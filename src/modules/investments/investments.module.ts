import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { WalletsModule } from '../wallets/wallets.module';
import { InvestmentsController } from './investments.controller';
import { InvestmentsRepository } from './investments.repository';
import { InvestmentsService } from './investments.service';

@Module({
  imports: [WalletsModule, HouseholdsModule],
  controllers: [InvestmentsController],
  providers: [InvestmentsService, InvestmentsRepository],
  exports: [InvestmentsService],
})
export class InvestmentsModule {}
