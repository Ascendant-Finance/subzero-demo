import { Injectable } from '@nestjs/common';
import {
  ACTIVITY_TYPES,
  type CreateAttachmentBody,
  type PresignBody,
} from '@trello-clone/shared';
import { ActivityService } from '../activity/activity.service';
import { CardsService } from '../cards/cards.service';
import { AppError } from '../common/app-error';
import { toAttachment, toCard } from '../common/serialize';
import { aggregatesFor } from '../cards/card-aggregates';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly activity: ActivityService,
    private readonly storage: StorageService,
    private readonly cards: CardsService,
  ) {}

  /**
   * Presign is scoped to a card the caller can edit. The card id travels as a
   * query parameter because the spec's body carries only the file metadata.
   */
  async presign(cardId: string, userId: string, body: PresignBody) {
    await this.permissions.requireCardEdit(cardId, userId);
    if (body.sizeBytes > this.storage.maxBytes) {
      throw AppError.uploadTooLarge(
        `Attachments are limited to ${this.storage.maxBytes} bytes`,
      );
    }
    return this.storage.presignUpload({
      cardId,
      fileName: body.fileName,
      mimeType: body.mimeType,
    });
  }

  async create(cardId: string, userId: string, body: CreateAttachmentBody) {
    const { card } = await this.permissions.requireCardEdit(cardId, userId);
    if (body.sizeBytes && body.sizeBytes > this.storage.maxBytes) {
      throw AppError.uploadTooLarge('Attachment over the size cap');
    }

    const { attachment, activity } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.attachment.create({
        data: {
          ...(body.attachmentId ? { id: body.attachmentId } : {}),
          cardId,
          uploaderId: userId,
          kind: body.kind,
          url: body.url,
          name: body.name,
          mimeType: body.mimeType ?? null,
          sizeBytes: body.sizeBytes ?? null,
        },
      });
      const record = await this.activity.record(tx, {
        boardId: card.boardId,
        cardId,
        userId,
        type: ACTIVITY_TYPES.ATTACHMENT_ADDED,
        data: { attachmentName: created.name, cardTitle: card.title },
      });
      return { attachment: created, activity: record };
    });

    this.activity.publish(card.boardId, activity);
    await this.cards.broadcastCard(card.boardId, cardId);
    return { attachment: toAttachment(attachment) };
  }

  /** Sets an image attachment as the card cover (open decision 3, enabled). */
  async setCover(cardId: string, attachmentId: string, userId: string) {
    const { card } = await this.permissions.requireCardEdit(cardId, userId);
    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.cardId !== cardId) {
      throw AppError.notFound('Attachment not found on this card');
    }

    const { updated, activity } = await this.prisma.$transaction(async (tx) => {
      await tx.attachment.updateMany({ where: { cardId }, data: { isCover: false } });
      await tx.attachment.update({ where: { id: attachmentId }, data: { isCover: true } });
      const row = await tx.card.update({
        where: { id: cardId },
        data: { coverType: 'image', coverValue: attachment.url },
      });
      const record = await this.activity.record(tx, {
        boardId: card.boardId,
        cardId,
        userId,
        type: ACTIVITY_TYPES.ATTACHMENT_COVER_SET,
        data: { attachmentId, cardTitle: card.title },
      });
      return { updated: row, activity: record };
    });

    this.activity.publish(card.boardId, activity);
    await this.cards.broadcastCard(card.boardId, cardId);
    return { card: toCard(updated, await aggregatesFor(this.prisma, updated)) };
  }

  async remove(attachmentId: string, userId: string) {
    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) throw AppError.notFound('Attachment not found');
    const { card } = await this.permissions.requireCardEdit(attachment.cardId, userId);

    const activity = await this.prisma.$transaction(async (tx) => {
      await tx.attachment.delete({ where: { id: attachmentId } });
      if (attachment.isCover) {
        await tx.card.update({
          where: { id: attachment.cardId },
          data: { coverType: 'none', coverValue: null },
        });
      }
      return this.activity.record(tx, {
        boardId: card.boardId,
        cardId: card.id,
        userId,
        type: ACTIVITY_TYPES.ATTACHMENT_REMOVED,
        data: { attachmentName: attachment.name },
      });
    });

    this.activity.publish(card.boardId, activity);
    await this.cards.broadcastCard(card.boardId, card.id);
    return { ok: true as const };
  }
}
