import { Global, Module } from '@nestjs/common';
import { OrderingService } from './ordering.service';

@Global()
@Module({
  providers: [OrderingService],
  exports: [OrderingService],
})
export class OrderingModule {}
