import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  createInviteBodySchema,
  createWorkspaceBodySchema,
  joinWorkspaceBodySchema,
} from '@trello-clone/shared';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { zodBody } from '../common/zod-validation.pipe';
import { WorkspacesService } from './workspaces.service';

@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(zodBody(createWorkspaceBodySchema)) body: any) {
    return this.workspaces.create(user.id, body);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.workspaces.listForUser(user.id);
  }

  // Declared before ':id' so the literal path is not captured as an id.
  @Post('join')
  join(@CurrentUser() user: AuthUser, @Body(zodBody(joinWorkspaceBodySchema)) body: any) {
    return this.workspaces.join(user.id, body.code);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workspaces.detail(id, user.id);
  }

  @Post(':id/invites')
  createInvite(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(zodBody(createInviteBodySchema)) body: any,
  ) {
    return this.workspaces.createInvite(id, user.id, body);
  }
}
