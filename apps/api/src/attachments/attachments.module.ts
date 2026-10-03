import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { StorageService } from './storage.service';

@Module({
  imports: [CardsModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, StorageService],
})
export class AttachmentsModule {}
