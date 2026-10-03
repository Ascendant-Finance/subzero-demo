import { Controller, Get, Param, Query } from '@nestjs/common';
import { boardSearchQuerySchema } from '@trello-clone/shared';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { zodBody } from '../common/zod-validation.pipe';
import { SearchService } from './search.service';

@Controller()
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('boards/:id/search')
  searchBoard(
    @CurrentUser() user: AuthUser,
    @Param('id') boardId: string,
    @Query(zodBody(boardSearchQuerySchema)) query: any,
  ) {
    return this.search.searchBoard(boardId, user.id, query);
  }
}
