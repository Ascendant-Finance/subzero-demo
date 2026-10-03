import { Controller, Get, Param, Query } from '@nestjs/common';
import { cursorQuerySchema } from '@trello-clone/shared';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { zodBody } from '../common/zod-validation.pipe';
import { PermissionsService } from '../permissions/permissions.service';
import { ActivityService } from './activity.service';

@Controller()
export class ActivityController {
  constructor(
    private readonly activity: ActivityService,
    private readonly permissions: PermissionsService,
  ) {}

  @Get('boards/:id/activity')
  async board(
    @CurrentUser() user: AuthUser,
    @Param('id') boardId: string,
    @Query(zodBody(cursorQuerySchema)) query: any,
  ) {
    await this.permissions.requireBoardView(boardId, user.id);
    return this.activity.boardFeed(boardId, query.cursor, query.limit);
  }

  @Get('cards/:id/activity')
  async card(
    @CurrentUser() user: AuthUser,
    @Param('id') cardId: string,
    @Query(zodBody(cursorQuerySchema)) query: any,
  ) {
    await this.permissions.requireCardView(cardId, user.id);
    return this.activity.cardFeed(cardId, query.cursor, query.limit);
  }
}
