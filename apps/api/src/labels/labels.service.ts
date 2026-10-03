import { Injectable } from '@nestjs/common';
import type { CreateLabelBody, UpdateLabelBody } from '@trello-clone/shared';
import { AppError } from '../common/app-error';
import { toLabel } from '../common/serialize';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LabelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async create(boardId: string, userId: string, body: CreateLabelBody) {
    await this.permissions.requireBoardEdit(boardId, userId);
    const label = await this.prisma.label.create({
      data: { boardId, name: body.name ?? '', color: body.color },
    });
    return { label: toLabel(label) };
  }

  async update(labelId: string, userId: string, body: UpdateLabelBody) {
    const label = await this.loadLabel(labelId, userId);
    const updated = await this.prisma.label.update({ where: { id: label.id }, data: body });
    return { label: toLabel(updated) };
  }

  async remove(labelId: string, userId: string) {
    const label = await this.loadLabel(labelId, userId);
    await this.prisma.label.delete({ where: { id: label.id } });
    return { ok: true as const };
  }

  private async loadLabel(labelId: string, userId: string) {
    const label = await this.prisma.label.findUnique({ where: { id: labelId } });
    if (!label) throw AppError.notFound('Label not found');
    await this.permissions.requireBoardEdit(label.boardId, userId);
    return label;
  }
}
