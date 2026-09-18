import { Module } from '@nestjs/common';
import { WalletsModule } from '../wallets/wallets.module';
import { BudgetEncroachmentsRepository } from './budget-encroachments.repository';
import { ReservationsController } from './reservations.controller';
import { ReservationsRepository } from './reservations.repository';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [WalletsModule],
  controllers: [ReservationsController],
  providers: [
    ReservationsService,
    ReservationsRepository,
    BudgetEncroachmentsRepository,
  ],
  exports: [ReservationsService],
})
export class ReservationsModule {}
