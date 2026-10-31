import { Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { DashboardService } from './dashboard.service';
import { HistoryQueryDto } from './dto/history-query.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('history')
  @HttpCode(HttpStatus.OK)
  async history(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: HistoryQueryDto,
  ) {
    const history = await this.dashboardService.getHistory(currentUser, {
      from: query.from,
      to: query.to,
      walletIds: query.wallet_ids
        ?.split(',')
        .map((walletId) => walletId.trim())
        .filter(Boolean),
    });

    return {
      from: history.from,
      to: history.to,
      granularity: history.granularity,
      points: history.points.map((point) => ({
        date: point.date,
        wallet_balance: point.walletBalance,
        investment_value: point.investmentValue,
        invested_capital: point.investedCapital,
        total_assets: point.totalAssets,
        liabilities: point.liabilities,
        net_worth: point.netWorth,
      })),
    };
  }
}
