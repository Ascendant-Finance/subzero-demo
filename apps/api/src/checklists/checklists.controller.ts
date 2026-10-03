import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import {
  createChecklistBodySchema,
  createChecklistItemBodySchema,
  updateChecklistBodySchema,
  updateChecklistItemBodySchema,
} from '@trello-clone/shared';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { zodBody } from '../common/zod-validation.pipe';
import { ChecklistsService } from './checklists.service';

@Controller()
export class ChecklistsController {
  constructor(private readonly checklists: ChecklistsService) {}

  @Post('cards/:id/checklists')
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') cardId: string,
    @Body(zodBody(createChecklistBodySchema)) body: any,
  ) {
    return this.checklists.create(cardId, user.id, body);
  }

  @Patch('checklists/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(zodBody(updateChecklistBodySchema)) body: any,
  ) {
    return this.checklists.update(id, user.id, body.title);
  }

  @Delete('checklists/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.checklists.remove(id, user.id);
  }

  @Post('checklists/:id/items')
  createItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(zodBody(createChecklistItemBodySchema)) body: any,
  ) {
    return this.checklists.createItem(id, user.id, body);
  }

  @Patch('checklist-items/:id')
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(zodBody(updateChecklistItemBodySchema)) body: any,
  ) {
    return this.checklists.updateItem(id, user.id, body);
  }

  @Delete('checklist-items/:id')
  removeItem(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.checklists.removeItem(id, user.id);
  }
}
