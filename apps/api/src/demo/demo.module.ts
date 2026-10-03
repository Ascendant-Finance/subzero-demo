import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';
import { SubZeroProvisioner } from './subzero-provisioner';

@Module({
  imports: [AuthModule],
  controllers: [DemoController],
  providers: [DemoService, SubZeroProvisioner],
})
export class DemoModule {}
