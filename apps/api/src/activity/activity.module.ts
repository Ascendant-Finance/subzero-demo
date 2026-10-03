import { Global, Module } from '@nestjs/common';
import { RealtimeService } from '../realtime/realtime.service';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

@Global()
@Module({
  controllers: [ActivityController],
  providers: [ActivityService, RealtimeService],
  exports: [ActivityService, RealtimeService],
})
export class ActivityModule {}
