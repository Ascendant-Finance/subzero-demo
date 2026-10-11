import { CardsModule } from '../cards/cards.module';
import { DemoCocoaService } from './demo-cocoa.service';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';
import { SubZeroProvisioner } from './subzero-provisioner';

@Module({
  imports: [AuthModule, CardsModule],
  controllers: [DemoController],
  providers: [DemoService, SubZeroProvisioner, DemoCocoaService],
})
export class DemoModule {}
