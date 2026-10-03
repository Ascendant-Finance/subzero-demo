import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('search')
  search(@CurrentUser() user: AuthUser, @Query('q') q = '') {
    return this.users.search(user.id, q);
  }
}
