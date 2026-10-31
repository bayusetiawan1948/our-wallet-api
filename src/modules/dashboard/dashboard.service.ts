import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
  subDays,
} from 'date-fns';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { WalletsService } from '../wallets/wallets.service';
import {
  buildBucketDates,
  buildHistoryPoints,
  resolveGranularity,
} from './dashboard-history';
import { DashboardRepository } from './dashboard.repository';
import { DashboardHistory } from './dashboard.type';

const DEFAULT_HISTORY_DAYS = 30;
const MAX_HISTORY_DAYS = 1830;
const DATE_FORMAT = 'yyyy-MM-dd';
const JAKARTA_TIME_ZONE = 'Asia/Jakarta';

export interface HistoryFilter {
  from?: string;
  to?: string;
  walletIds?: string[];
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly dashboardRepository: DashboardRepository,
    private readonly walletsService: WalletsService,
  ) {}

  async getHistory(
    currentUser: AuthenticatedUser,
    filter: HistoryFilter,
  ): Promise<DashboardHistory> {
    const { from, to } = this.resolveRange(filter);
    const walletIds = await this.resolveWalletIds(
      currentUser,
      filter.walletIds,
    );
    const { userId, householdId } = currentUser;

    const [walletDeltas, investmentEvents, valuations, debts, debtPayments] =
      await Promise.all([
        this.dashboardRepository.ListWalletDeltas(walletIds, to),
        this.dashboardRepository.ListInvestmentEvents(userId, householdId, to),
        this.dashboardRepository.ListValuations(userId, householdId, to),
        this.dashboardRepository.ListLiabilityDebts(userId, householdId),
        this.dashboardRepository.ListLiabilityPayments(userId, householdId, to),
      ]);

    const granularity = resolveGranularity(from, to);
    const points = buildHistoryPoints(buildBucketDates(from, to, granularity), {
      walletDeltas,
      investmentEvents,
      valuations,
      debts,
      debtPayments,
    });

    return { from, to, granularity, points };
  }

  private resolveRange(filter: HistoryFilter): { from: string; to: string } {
    const to = filter.to ?? this.todayInJakarta();

    if (
      !isValid(parseISO(to)) ||
      (filter.from && !isValid(parseISO(filter.from)))
    ) {
      throw new BadRequestException('from and to must be valid dates');
    }

    const from =
      filter.from ??
      format(subDays(parseISO(to), DEFAULT_HISTORY_DAYS), DATE_FORMAT);
    const spanDays = differenceInCalendarDays(parseISO(to), parseISO(from));

    if (spanDays < 0) {
      throw new BadRequestException('from must not be after to');
    }

    if (spanDays > MAX_HISTORY_DAYS) {
      throw new BadRequestException(
        `Date range cannot exceed ${MAX_HISTORY_DAYS} days`,
      );
    }

    return { from, to };
  }

  private async resolveWalletIds(
    currentUser: AuthenticatedUser,
    requested: string[] | undefined,
  ): Promise<string[]> {
    const accessible = await this.walletsService.listAccessibleIds(currentUser);

    if (!requested || requested.length === 0) {
      return accessible;
    }

    if (requested.some((walletId) => !accessible.includes(walletId))) {
      throw new ForbiddenException(
        'You do not have access to one or more of the requested wallets',
      );
    }

    return requested;
  }

  private todayInJakarta(): string {
    // en-CA menghasilkan format YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: JAKARTA_TIME_ZONE,
    }).format(new Date());
  }
}
