import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

@Module({
  imports: [CardsModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
