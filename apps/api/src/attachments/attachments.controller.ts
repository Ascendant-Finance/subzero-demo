import { Body, Controller, Delete, Param, Post, Query } from '@nestjs/common';
import { createAttachmentBodySchema, presignBodySchema } from '@trello-clone/shared';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { zodBody } from '../common/zod-validation.pipe';
import { AttachmentsService } from './attachments.service';

@Controller()
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post('uploads/presign')
  presign(
    @CurrentUser() user: AuthUser,
    @Query('cardId') cardId: string,
    @Body(zodBody(presignBodySchema)) body: any,
  ) {
    return this.attachments.presign(cardId, user.id, body);
  }

  @Post('cards/:id/attachments')
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') cardId: string,
    @Body(zodBody(createAttachmentBodySchema)) body: any,
  ) {
    return this.attachments.create(cardId, user.id, body);
  }

  @Post('cards/:id/attachments/:attId/cover')
  setCover(
    @CurrentUser() user: AuthUser,
    @Param('id') cardId: string,
    @Param('attId') attId: string,
  ) {
    return this.attachments.setCover(cardId, attId, user.id);
  }

  @Delete('attachments/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.attachments.remove(id, user.id);
  }
}
