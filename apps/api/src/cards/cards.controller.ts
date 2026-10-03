import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  cardLabelBodySchema,
  cardMemberBodySchema,
  createCardBodySchema,
  moveCardBodySchema,
  updateCardBodySchema,
} from '@trello-clone/shared';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { zodBody } from '../common/zod-validation.pipe';
import { CardsService } from './cards.service';

@Controller()
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Post('lists/:id/cards')
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') listId: string,
    @Body(zodBody(createCardBodySchema)) body: any,
  ) {
    return this.cards.create(listId, user.id, body);
  }

  @Get('cards/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.cards.detail(id, user.id);
  }

  @Patch('cards/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(zodBody(updateCardBodySchema)) body: any,
  ) {
    return this.cards.update(id, user.id, body);
  }

  @Post('cards/:id/move')
  move(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(zodBody(moveCardBodySchema)) body: any,
  ) {
    return this.cards.move(id, user.id, body);
  }

  @Post('cards/:id/labels')
  addLabel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(zodBody(cardLabelBodySchema)) body: any,
  ) {
    return this.cards.addLabel(id, user.id, body.labelId);
  }

  @Delete('cards/:id/labels/:labelId')
  removeLabel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('labelId') labelId: string,
  ) {
    return this.cards.removeLabel(id, user.id, labelId);
  }

  @Post('cards/:id/members')
  addMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(zodBody(cardMemberBodySchema)) body: any,
  ) {
    return this.cards.addMember(id, user.id, body.userId);
  }

  @Delete('cards/:id/members/:userId')
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.cards.removeMember(id, user.id, userId);
  }
}
