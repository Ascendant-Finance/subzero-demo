import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  addBoardMemberBodySchema,
  createBoardBodySchema,
  updateBoardBodySchema,
  updateBoardMemberBodySchema,
} from '@trello-clone/shared';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { zodBody } from '../common/zod-validation.pipe';
import { BoardsService } from './boards.service';

@Controller()
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Post('workspaces/:wsId/boards')
  create(
    @CurrentUser() user: AuthUser,
    @Param('wsId') wsId: string,
    @Body(zodBody(createBoardBodySchema)) body: any,
  ) {
    return this.boards.create(wsId, user.id, body);
  }

  @Get('boards/:id')
  bootstrap(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.boards.bootstrap(id, user.id);
  }

  @Patch('boards/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(zodBody(updateBoardBodySchema)) body: any,
  ) {
    return this.boards.update(id, user.id, body);
  }

  @Post('boards/:id/close')
  close(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.boards.setClosed(id, user.id, true);
  }

  @Post('boards/:id/reopen')
  reopen(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.boards.setClosed(id, user.id, false);
  }

  @Post('boards/:id/star')
  star(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.boards.setStarred(id, user.id, true);
  }

  @Delete('boards/:id/star')
  unstar(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.boards.setStarred(id, user.id, false);
  }

  @Post('boards/:id/members')
  addMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(zodBody(addBoardMemberBodySchema)) body: any,
  ) {
    return this.boards.addMember(id, user.id, body);
  }

  @Patch('boards/:id/members/:userId')
  updateMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body(zodBody(updateBoardMemberBodySchema)) body: any,
  ) {
    return this.boards.updateMemberRole(id, user.id, userId, body.role);
  }

  @Delete('boards/:id/members/:userId')
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.boards.removeMember(id, user.id, userId);
  }
}
