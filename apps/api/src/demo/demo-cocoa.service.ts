import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { OrderingService } from '../ordering/ordering.service';
import { CardsService } from '../cards/cards.service';
import { AppError } from '../common/app-error';
const REPAIR = 'clear-card-description-v1';
interface RemoteStatus {
  available: boolean;
  incidentReady: boolean;
  attemptsRemaining: number;
  run: null | {
    id: string;
    status: string;
    stage: string;
    repairId: string;
    [key: string]: unknown;
  };
}
@Injectable()
export class DemoCocoaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cards: CardsService,
    private readonly ordering: OrderingService,
  ) {}
  private async tenant(userId: string) {
    const t = await this.prisma.demoTenant.findUnique({ where: { userId } });
    if (!t || t.expiresAt <= new Date()) throw AppError.forbidden('Your demo has expired.');
    return t;
  }
  private async remote(project: string, action: string) {
    const base = new URL(
      this.config.get<string>(
        'SUBZERO_DEMO_PROVISION_URL',
        'https://api.sub-zero.dev/demo/provision',
      ),
    );
    if (base.protocol !== 'https:' && base.hostname !== '127.0.0.1')
      throw AppError.internal('Invalid demo service configuration');
    base.pathname =
      base.pathname.replace(/\/provision\/?$/, '') +
      '/cocoa/' +
      encodeURIComponent(project) +
      (action ? '/' + action : '');
    base.search = '';
    base.hash = '';
    const secret = this.config.get<string>('DEMO_PROVISION_SECRET', '');
    if (secret.length < 32) throw AppError.internal('Cocoa demos are not configured yet.');
    let response: Response;
    try {
      response = await fetch(base, {
        method: action ? 'POST' : 'GET',
        headers: { 'X-Demo-Provision-Secret': secret },
        redirect: 'error',
        signal: AbortSignal.timeout(65000),
      });
    } catch {
      throw AppError.conflict(
        'Cocoa is temporarily unavailable. Your progress is saved; try again.',
      );
    }
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { message?: unknown };
      throw AppError.conflict(
        typeof data.message === 'string' ? data.message : 'Cocoa could not complete that request.',
      );
    }
    return (await response.json()) as RemoteStatus;
  }
  async request(userId: string, action: 'status' | 'start' | 'preview' | 'reset') {
    let t = await this.tenant(userId);
    if (action === 'reset') {
      await this.prisma.demoTenant.update({
        where: { userId },
        data: {
          cocoaRepairBoardId: null,
          cocoaRepairRunId: null,
          cocoaVerification: { reset: true },
        },
      });
    }
    const state = await this.remote(t.subzeroProjectKey, action === 'start' ? 'start' : '');
    if (action === 'start' && state.run?.status === 'ready') {
      if (state.run.repairId !== REPAIR) throw AppError.conflict('This repair is not supported.');
      const runId = state.run.id;
      await this.prisma.$transaction(async (tx) => {
        // Serializes sample creation and activation for this prospect only.
        await tx.$queryRaw`SELECT id FROM "DemoTenant" WHERE "userId"=${userId} FOR UPDATE`;
        const current = await tx.demoTenant.findUniqueOrThrow({ where: { userId } });
        if (current.expiresAt <= new Date()) throw AppError.forbidden('Your demo has expired.');
        const board = await tx.board.findFirst({
          where: { createdById: userId, title: 'Product Roadmap' },
          orderBy: { createdAt: 'asc' },
        });
        if (!board) throw AppError.notFound('Your demo board is unavailable.');
        const list = await tx.list.findFirst({
          where: { boardId: board.id },
          orderBy: { position: 'asc' },
        });
        if (!list) throw AppError.notFound('Your demo list is unavailable.');
        await this.ordering.lockBoardOrdering(tx, board.id);
        const siblings = await this.ordering.lockCardsInList(tx, list.id);
        const existing = current.cocoaSampleCardId
          ? await tx.card.findFirst({
              where: { id: current.cocoaSampleCardId, boardId: board.id, createdById: userId },
            })
          : null;
        const sample =
          existing ??
          (await tx.card.create({
            data: {
              boardId: board.id,
              listId: list.id,
              title: 'Try Cocoa’s description repair',
              description: 'Clear these notes to try the reviewed repair.',
              position: this.ordering.appendPosition(siblings),
              createdById: userId,
            },
          }));
        await tx.demoTenant.update({
          where: { userId },
          data: {
            cocoaRepairBoardId: board.id,
            cocoaRepairRunId: runId,
            cocoaSampleCardId: sample.id,
          },
        });
      });
      t = await this.tenant(userId);
      await this.verify(userId);
      const completed = await this.remote(
        t.subzeroProjectKey,
        encodeURIComponent(runId) + '/complete',
      );
      return this.present(userId, completed);
    }
    if (action === 'preview') await this.verify(userId);
    return this.present(userId, state);
  }
  private async verify(userId: string) {
    const t = await this.tenant(userId);
    if (!t.cocoaRepairBoardId || !t.cocoaSampleCardId)
      throw AppError.conflict('Apply the reviewed repair first.');
    const original = await this.prisma.card.findFirst({
      where: { id: t.cocoaSampleCardId, boardId: t.cocoaRepairBoardId, createdById: userId },
    });
    if (!original) throw AppError.notFound('The sample card is unavailable.');
    await this.cards.update(original.id, userId, { description: 'Sample notes to clear' });
    await this.cards.update(original.id, userId, { description: null });
    const updated = await this.prisma.card.findUniqueOrThrow({ where: { id: original.id } });
    if (updated.description !== null || updated.title !== original.title)
      throw AppError.conflict('The repair did not pass verification.');
    await this.prisma.demoTenant.update({
      where: { userId },
      data: {
        cocoaVerification: {
          passed: true,
          message: 'Description cleared successfully. The card title is unchanged.',
        },
      },
    });
  }
  private async present(userId: string, state: RemoteStatus) {
    const t = await this.tenant(userId);
    return {
      ...state,
      repairApplied: !!t.cocoaRepairBoardId,
      boardId: t.cocoaRepairBoardId,
      sampleCardId: t.cocoaSampleCardId,
      preview: t.cocoaVerification,
    };
  }
}
