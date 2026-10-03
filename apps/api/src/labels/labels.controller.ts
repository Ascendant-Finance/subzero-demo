import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { createLabelBodySchema, updateLabelBodySchema } from '@trello-clone/shared';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { zodBody } from '../common/zod-validation.pipe';
import { LabelsService } from './labels.service';

@Controller()
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Post('boards/:id/labels')
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') boardId: string,
    @Body(zodBody(createLabelBodySchema)) body: any,
  ) {
    return this.labels.create(boardId, user.id, body);
  }

  @Patch('labels/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(zodBody(updateLabelBodySchema)) body: any,
  ) {
    return this.labels.update(id, user.id, body);
  }

  @Delete('labels/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.labels.remove(id, user.id);
  }
}
