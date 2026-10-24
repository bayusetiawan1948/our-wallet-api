import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { Reservation } from '../../shared/database/schema';
import { WalletsService } from '../wallets/wallets.service';
import { BudgetEncroachmentsRepository } from './budget-encroachments.repository';
import { ReservationsRepository } from './reservations.repository';
import { ReservationsService } from './reservations.service';

describe('ReservationsService', () => {
  let service: ReservationsService;
  let repository: jest.Mocked<ReservationsRepository>;
  let encroachmentsRepository: jest.Mocked<BudgetEncroachmentsRepository>;
  let walletsService: jest.Mocked<WalletsService>;

  const admin: AuthenticatedUser = {
    userId: 'user-1',
    email: 'bayu@example.com',
    fullName: 'Bayu',
    householdId: 'household-1',
    role: 'admin',
    sessionId: 'session-1',
    deviceId: 'device-1',
  };

  const reservation: Reservation = {
    id: 'reservation-1',
    walletId: 'wallet-1',
    budgetId: 'budget-1',
    goalId: null,
    reservedAmount: '100000',
    allocationMethod: 'manual',
    allocationConfig: null,
  };

  beforeEach(async () => {
    const repositoryMock: Partial<jest.Mocked<ReservationsRepository>> = {
      Create: jest.fn(),
      FindById: jest.fn(),
      FindBudgetOwner: jest.fn().mockResolvedValue({
        ownerUserId: null,
        ownerHouseholdId: 'household-1',
      }),
      FindGoalOwner: jest.fn().mockResolvedValue({
        ownerUserId: null,
        ownerHouseholdId: 'household-1',
      }),
      ListByWallet: jest.fn(),
      ListByBudget: jest.fn(),
      ListByGoal: jest.fn(),
      ListByWallets: jest.fn(),
      UpdateReservedAmount: jest.fn(),
      Delete: jest.fn(),
    };
    const encroachmentsRepositoryMock: Partial<
      jest.Mocked<BudgetEncroachmentsRepository>
    > = {
      Create: jest.fn(),
      ListByTransaction: jest.fn(),
    };
    const walletsServiceMock: Partial<jest.Mocked<WalletsService>> = {
      getById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: ReservationsRepository, useValue: repositoryMock },
        {
          provide: BudgetEncroachmentsRepository,
          useValue: encroachmentsRepositoryMock,
        },
        { provide: WalletsService, useValue: walletsServiceMock },
      ],
    }).compile();

    service = module.get(ReservationsService);
    repository = module.get(ReservationsRepository);
    encroachmentsRepository = module.get(BudgetEncroachmentsRepository);
    walletsService = module.get(WalletsService);
  });

  describe('create', () => {
    it('checks wallet access before creating a reservation', async () => {
      walletsService.getById.mockResolvedValue({
        id: 'wallet-1',
        ownerUserId: 'user-1',
        ownerHouseholdId: null,
        name: 'BCA',
        type: 'bank',
        currency: 'IDR',
        balance: 500000,
      });
      repository.Create.mockResolvedValue(reservation);

      const result = await service.create(admin, {
        wallet_id: 'wallet-1',
        budget_id: 'budget-1',
        reserved_amount: 100000,
      });

      expect(walletsService.getById).toHaveBeenCalledWith(admin, 'wallet-1');
      expect(result).toEqual(reservation);
    });
  });

  describe('create target ownership', () => {
    const wallet = {
      id: 'wallet-1',
      ownerUserId: 'user-1',
      ownerHouseholdId: null,
      name: 'BCA',
      type: 'bank' as const,
      currency: 'IDR',
      balance: 500000,
    };

    it('rejects a goal owned by another household', async () => {
      walletsService.getById.mockResolvedValue(wallet);
      repository.FindGoalOwner.mockResolvedValue({
        ownerUserId: null,
        ownerHouseholdId: 'household-2',
      });

      await expect(
        service.create(admin, {
          wallet_id: 'wallet-1',
          goal_id: 'goal-x',
          reserved_amount: 1000,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(repository.Create).not.toHaveBeenCalled();
    });

    it('rejects an unknown budget', async () => {
      walletsService.getById.mockResolvedValue(wallet);
      repository.FindBudgetOwner.mockResolvedValue(undefined);

      await expect(
        service.create(admin, {
          wallet_id: 'wallet-1',
          budget_id: 'missing',
          reserved_amount: 1000,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when reservation does not exist', async () => {
      repository.FindById.mockResolvedValue(undefined);

      await expect(service.remove(admin, 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('computeReservedTotal', () => {
    it('sums reserved amounts for a wallet', async () => {
      repository.ListByWallet.mockResolvedValue([
        reservation,
        { ...reservation, id: 'reservation-2', reservedAmount: '50000' },
      ]);

      const total = await service.computeReservedTotal('wallet-1');

      expect(total).toBe(150000);
    });
  });

  describe('applyEncroachment', () => {
    it('throws BadRequestException when no matching reservation exists', async () => {
      repository.ListByWallet.mockResolvedValue([]);

      await expect(
        service.applyEncroachment('tx-1', 'wallet-1', [
          { budget_id: 'budget-1', amount: 10000 },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('decrements the matching reservation and records the encroachment', async () => {
      repository.ListByWallet.mockResolvedValue([reservation]);
      encroachmentsRepository.Create.mockResolvedValue({
        id: 'enc-1',
        transactionId: 'tx-1',
        walletId: 'wallet-1',
        budgetId: 'budget-1',
        goalId: null,
        amount: '10000',
        createdAt: new Date(),
      });

      const result = await service.applyEncroachment('tx-1', 'wallet-1', [
        { budget_id: 'budget-1', amount: 10000 },
      ]);

      expect(repository.UpdateReservedAmount).toHaveBeenCalledWith(
        'reservation-1',
        90000,
      );
      expect(result).toHaveLength(1);
    });
  });
});
