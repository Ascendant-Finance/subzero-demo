import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { createListBodySchema, moveListBodySchema, updateListBodySchema } from '@trello-clone/shared';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { zodBody } from '../common/zod-validation.pipe';
import { ListsService } from './lists.service';

@Controller()
export class ListsController {
  constructor(private readonly lists: ListsService) {}

  @Post('boards/:id/lists')
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') boardId: string,
    @Body(zodBody(createListBodySchema)) body: any,
  ) {
    return this.lists.create(boardId, user.id, body);
  }

  @Patch('lists/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(zodBody(updateListBodySchema)) body: any,
  ) {
    return this.lists.update(id, user.id, body);
  }

  @Post('lists/:id/move')
  move(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(zodBody(moveListBodySchema)) body: any,
  ) {
    return this.lists.move(id, user.id, body);
  }
}
