import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { HouseholdsModule } from '../households/households.module';
import { WalletsController } from './wallets.controller.js';
import { WalletsRepository } from './wallets.repository';
import { WalletsService } from './wallets.service.js';

@Module({
  imports: [HouseholdsModule, AuditLogsModule],
  controllers: [WalletsController],
  providers: [WalletsService, WalletsRepository],
  exports: [WalletsService],
})
export class WalletsModule {}
