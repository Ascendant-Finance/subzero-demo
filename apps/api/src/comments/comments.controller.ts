import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { createCommentBodySchema, updateCommentBodySchema } from '@trello-clone/shared';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { zodBody } from '../common/zod-validation.pipe';
import { CommentsService } from './comments.service';

@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Post('cards/:id/comments')
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') cardId: string,
    @Body(zodBody(createCommentBodySchema)) body: any,
  ) {
    return this.comments.create(cardId, user.id, body);
  }

  @Patch('comments/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(zodBody(updateCommentBodySchema)) body: any,
  ) {
    return this.comments.update(id, user.id, body.text);
  }

  @Delete('comments/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.comments.remove(id, user.id);
  }
}
