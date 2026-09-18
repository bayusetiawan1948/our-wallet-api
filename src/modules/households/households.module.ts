import { Module } from '@nestjs/common';
import { HouseholdsController } from './households.controller';
import { HouseholdsRepository } from './households.repository';
import { HouseholdsService } from './households.service';

@Module({
  controllers: [HouseholdsController],
  providers: [HouseholdsService, HouseholdsRepository],
  exports: [HouseholdsService],
})
export class HouseholdsModule {}
