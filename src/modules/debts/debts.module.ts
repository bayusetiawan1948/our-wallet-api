import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { WalletsModule } from '../wallets/wallets.module';
import { DebtsController } from './debts.controller';
import { DebtsRepository } from './debts.repository';
import { DebtsService } from './debts.service';

@Module({
  imports: [WalletsModule, AuditLogsModule],
  controllers: [DebtsController],
  providers: [DebtsService, DebtsRepository],
  exports: [DebtsService],
})
export class DebtsModule {}
