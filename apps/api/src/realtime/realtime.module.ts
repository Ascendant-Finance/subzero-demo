import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module';
import { ListsModule } from '../lists/lists.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [CardsModule, ListsModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
