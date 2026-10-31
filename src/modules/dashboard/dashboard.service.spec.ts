import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { WalletsService } from '../wallets/wallets.service';
import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let repository: jest.Mocked<DashboardRepository>;
  let walletsService: { listAccessibleIds: jest.Mock };

  const user: AuthenticatedUser = {
    userId: 'user-1',
    email: 'bayu@example.com',
    fullName: 'Bayu',
    householdId: 'household-1',
    role: 'admin',
    sessionId: 'session-1',
    deviceId: 'device-1',
  };

  beforeEach(async () => {
    const repositoryMock: Partial<jest.Mocked<DashboardRepository>> = {
      ListWalletDeltas: jest.fn().mockResolvedValue([]),
      ListInvestmentEvents: jest.fn().mockResolvedValue([]),
      ListValuations: jest.fn().mockResolvedValue([]),
      ListLiabilityDebts: jest.fn().mockResolvedValue([]),
      ListLiabilityPayments: jest.fn().mockResolvedValue([]),
    };
    walletsService = {
      listAccessibleIds: jest.fn().mockResolvedValue(['w-1', 'w-2']),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: DashboardRepository, useValue: repositoryMock },
        { provide: WalletsService, useValue: walletsService },
      ],
    }).compile();

    service = module.get(DashboardService);
    repository = module.get(DashboardRepository);
  });

  it('uses every accessible wallet when none are requested', async () => {
    await service.getHistory(user, { from: '2026-10-01', to: '2026-10-31' });

    expect(repository.ListWalletDeltas).toHaveBeenCalledWith(
      ['w-1', 'w-2'],
      '2026-10-31',
    );
  });

  it('restricts wallet balances to the requested wallets', async () => {
    await service.getHistory(user, {
      from: '2026-10-01',
      to: '2026-10-31',
      walletIds: ['w-2'],
    });

    expect(repository.ListWalletDeltas).toHaveBeenCalledWith(
      ['w-2'],
      '2026-10-31',
    );
  });

  it('rejects wallets the user cannot access', async () => {
    await expect(
      service.getHistory(user, {
        from: '2026-10-01',
        to: '2026-10-31',
        walletIds: ['w-1', 'someone-elses-wallet'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.ListWalletDeltas).not.toHaveBeenCalled();
  });

  it('scopes investments and debts to the current user and household', async () => {
    await service.getHistory(user, { from: '2026-10-01', to: '2026-10-31' });

    expect(repository.ListInvestmentEvents).toHaveBeenCalledWith(
      'user-1',
      'household-1',
      '2026-10-31',
    );
    expect(repository.ListLiabilityDebts).toHaveBeenCalledWith(
      'user-1',
      'household-1',
    );
  });

  it('returns daily points ending on `to` for a short range', async () => {
    repository.ListWalletDeltas.mockResolvedValue([
      { date: '2026-09-15', amount: 1_000 },
      { date: '2026-10-30', amount: 250 },
    ]);

    const history = await service.getHistory(user, {
      from: '2026-10-29',
      to: '2026-10-31',
    });

    expect(history.granularity).toBe('day');
    expect(history.points.map((p) => [p.date, p.netWorth])).toEqual([
      ['2026-10-29', 1_000],
      ['2026-10-30', 1_250],
      ['2026-10-31', 1_250],
    ]);
  });

  it('defaults to the last 30 days when no range is given', async () => {
    const history = await service.getHistory(user, {});

    expect(history.points.length).toBeGreaterThan(1);
    expect(history.points[0].date).toBe(history.from);
    expect(history.points.at(-1)?.date).toBe(history.to);
  });

  it('rejects a range where from is after to', async () => {
    await expect(
      service.getHistory(user, { from: '2026-10-31', to: '2026-10-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an impossible calendar date', async () => {
    await expect(
      service.getHistory(user, { from: '2026-02-31', to: '2026-10-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a range longer than the maximum', async () => {
    await expect(
      service.getHistory(user, { from: '2015-01-01', to: '2026-10-31' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
