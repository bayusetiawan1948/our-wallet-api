import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { Budget, BudgetPeriod } from '../../shared/database/schema';
import { ReservationsService } from '../reservations/reservations.service';
import { BudgetsRepository } from './budgets.repository';
import { BudgetsService } from './budgets.service';

describe('BudgetsService', () => {
  let service: BudgetsService;
  let repository: jest.Mocked<BudgetsRepository>;
  let reservationsService: jest.Mocked<ReservationsService>;

  const admin: AuthenticatedUser = {
    userId: 'user-1',
    email: 'bayu@example.com',
    fullName: 'Bayu',
    householdId: 'household-1',
    role: 'admin',
    sessionId: 'session-1',
    deviceId: 'device-1',
  };

  const member: AuthenticatedUser = { ...admin, userId: 'user-2', role: 'member' };

  const budget: Budget = {
    id: 'budget-1',
    ownerUserId: null,
    ownerHouseholdId: 'household-1',
    categoryId: 'category-1',
    name: 'Makan Bulanan',
    targetAmount: '1000000',
    period: 'monthly',
    startDate: '2026-01-01',
  };

  const period: BudgetPeriod = {
    id: 'period-1',
    budgetId: budget.id,
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
    targetAmount: '1000000',
    carriedDeficit: '0',
    status: 'active',
  };

  beforeEach(async () => {
    const repositoryMock: Partial<jest.Mocked<BudgetsRepository>> = {
      Create: jest.fn(),
      FindById: jest.fn(),
      FindCategoryHouseholdId: jest.fn().mockResolvedValue('household-1'),
      FindAccessible: jest.fn(),
      Update: jest.fn(),
      Delete: jest.fn(),
      CreatePeriod: jest.fn(),
      FindActivePeriod: jest.fn(),
      ListPeriods: jest.fn(),
      CloseActivePeriod: jest.fn(),
      SumExpenseByCategoryInRange: jest.fn(),
    };
    const reservationsServiceMock: Partial<jest.Mocked<ReservationsService>> = {
      listByBudget: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BudgetsService,
        { provide: BudgetsRepository, useValue: repositoryMock },
        { provide: ReservationsService, useValue: reservationsServiceMock },
      ],
    }).compile();

    service = module.get(BudgetsService);
    repository = module.get(BudgetsRepository);
    reservationsService = module.get(ReservationsService);
  });

  describe('create', () => {
    it('throws ForbiddenException when member creates a household-owned budget', async () => {
      await expect(
        service.create(member, {
          owner_type: 'household',
          category_id: 'category-1',
          name: 'Makan Bulanan',
          target_amount: 1000000,
          period: 'monthly',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('creates a budget with its initial active period', async () => {
      repository.Create.mockResolvedValue(budget);

      await service.create(admin, {
        owner_type: 'household',
        category_id: 'category-1',
        name: 'Makan Bulanan',
        target_amount: 1000000,
        period: 'monthly',
        start_date: '2026-01-01',
      });

      expect(repository.CreatePeriod).toHaveBeenCalledWith(
        expect.objectContaining({
          budgetId: budget.id,
          periodStart: '2026-01-01',
          periodEnd: '2026-01-31',
          status: 'active',
        }),
      );
    });
  });

  describe('create category check', () => {
    it('rejects a category that belongs to another household', async () => {
      repository.FindCategoryHouseholdId.mockResolvedValue('household-2');

      await expect(
        service.create(admin, {
          owner_type: 'household',
          category_id: 'category-x',
          name: 'X',
          target_amount: 1000,
          period: 'monthly',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(repository.Create).not.toHaveBeenCalled();
    });
  });

  describe('list / progress', () => {
    it('flags overbudget when spending exceeds the effective target', async () => {
      repository.FindAccessible.mockResolvedValue([budget]);
      repository.FindActivePeriod.mockResolvedValue(period);
      repository.SumExpenseByCategoryInRange.mockResolvedValue(1200000);

      const [progress] = await service.list(admin);

      expect(progress.is_overbudget).toBe(true);
      expect(progress.deficit_amount).toBe(200000);
    });

    it('carries forward the previous deficit into the effective target', async () => {
      repository.FindAccessible.mockResolvedValue([budget]);
      repository.FindActivePeriod.mockResolvedValue({
        ...period,
        carriedDeficit: '50000',
      });
      repository.SumExpenseByCategoryInRange.mockResolvedValue(900000);

      const [progress] = await service.list(admin);

      expect(progress.effective_target).toBe(1050000);
      expect(progress.is_overbudget).toBe(false);
    });
  });

  describe('closePeriod', () => {
    it('closes the active period and opens a new one carrying the deficit', async () => {
      repository.FindById.mockResolvedValue(budget);
      repository.FindActivePeriod.mockResolvedValue(period);
      repository.SumExpenseByCategoryInRange.mockResolvedValue(1200000);

      await service.closePeriod(admin, budget.id);

      expect(repository.CloseActivePeriod).toHaveBeenCalledWith(period.id);
      expect(repository.CreatePeriod).toHaveBeenCalledWith(
        expect.objectContaining({
          periodStart: period.periodEnd,
          carriedDeficit: '200000',
        }),
      );
    });
  });
});
