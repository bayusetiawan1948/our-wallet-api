import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { Debt } from '../../shared/database/schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { WalletsService } from '../wallets/wallets.service';
import { DebtsRepository } from './debts.repository';
import { DebtsService } from './debts.service';

describe('DebtsService', () => {
  let service: DebtsService;
  let repository: jest.Mocked<DebtsRepository>;
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

  const member: AuthenticatedUser = { ...admin, userId: 'user-2', role: 'member' };

  const debt: Debt = {
    id: 'debt-1',
    ownerUserId: null,
    ownerHouseholdId: 'household-1',
    type: 'utang',
    counterparty: 'Bank ABC',
    principal: '1000000',
    portionAdmin: '500000',
    portionMember: '500000',
    dueDate: '2026-06-01',
    status: 'active',
    note: null,
  };

  const wallet = {
    id: 'wallet-1',
    ownerUserId: 'user-1',
    ownerHouseholdId: null,
    name: 'BCA',
    type: 'bank' as const,
    currency: 'IDR',
    balance: 2000000,
  };

  beforeEach(async () => {
    const repositoryMock: Partial<jest.Mocked<DebtsRepository>> = {
      CreateDebt: jest.fn(),
      FindById: jest.fn(),
      FindAccessible: jest.fn(),
      UpdateDebt: jest.fn(),
      DeleteDebt: jest.fn(),
      CreatePayment: jest.fn(),
      FindPaymentById: jest.fn(),
      ListPaymentsByDebt: jest.fn(),
      UpdatePaymentStatus: jest.fn(),
      SumActivePayments: jest.fn(),
      HasActivePayments: jest.fn(),
    };
    const walletsServiceMock: Partial<jest.Mocked<WalletsService>> = {
      getById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DebtsService,
        { provide: DebtsRepository, useValue: repositoryMock },
        { provide: WalletsService, useValue: walletsServiceMock },
        { provide: AuditLogsService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get(DebtsService);
    repository = module.get(DebtsRepository);
    walletsService = module.get(WalletsService);
  });

  describe('create', () => {
    it('throws ForbiddenException when member creates a household-owned debt', async () => {
      await expect(
        service.create(member, {
          owner_type: 'household',
          type: 'utang',
          counterparty: 'Bank ABC',
          principal: 1000000,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('creates a household-owned debt', async () => {
      repository.CreateDebt.mockResolvedValue(debt);

      const result = await service.create(admin, {
        owner_type: 'household',
        type: 'utang',
        counterparty: 'Bank ABC',
        principal: 1000000,
        portion_admin: 500000,
        portion_member: 500000,
      });

      expect(repository.CreateDebt).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerHouseholdId: 'household-1',
          ownerUserId: null,
          status: 'active',
        }),
      );
      expect(result).toEqual(debt);
    });
  });

  describe('remove', () => {
    it('throws ConflictException when debt has active payments', async () => {
      repository.FindById.mockResolvedValue(debt);
      repository.HasActivePayments.mockResolvedValue(true);

      await expect(service.remove(admin, debt.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws ForbiddenException when debt is outside household', async () => {
      repository.FindById.mockResolvedValue({
        ...debt,
        ownerHouseholdId: 'other-household',
      });

      await expect(service.remove(admin, debt.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('addPayment', () => {
    it('throws ConflictException when balance is insufficient for utang payment', async () => {
      repository.FindById.mockResolvedValue(debt);
      walletsService.getById.mockResolvedValue({ ...wallet, balance: 100 });

      await expect(
        service.addPayment(admin, debt.id, wallet.id, 500000, '2026-01-01'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('records a payment and marks debt as partial when not fully paid', async () => {
      repository.FindById.mockResolvedValue(debt);
      walletsService.getById.mockResolvedValue(wallet);
      repository.CreatePayment.mockResolvedValue({
        id: 'payment-1',
        debtId: debt.id,
        walletId: wallet.id,
        amount: '400000',
        date: '2026-01-01',
        status: 'active',
        correctionOfId: null,
      });
      repository.SumActivePayments.mockResolvedValue(400000);

      await service.addPayment(admin, debt.id, wallet.id, 400000, '2026-01-01');

      expect(repository.UpdateDebt).toHaveBeenCalledWith(debt.id, {
        status: 'partial',
      });
    });

    it('marks debt as paid once total payments reach the principal', async () => {
      repository.FindById.mockResolvedValue(debt);
      walletsService.getById.mockResolvedValue({
        ...wallet,
        balance: 2000000,
      });
      repository.CreatePayment.mockResolvedValue({
        id: 'payment-1',
        debtId: debt.id,
        walletId: wallet.id,
        amount: '1000000',
        date: '2026-01-01',
        status: 'active',
        correctionOfId: null,
      });
      repository.SumActivePayments.mockResolvedValue(1000000);

      await service.addPayment(admin, debt.id, wallet.id, 1000000, '2026-01-01');

      expect(repository.UpdateDebt).toHaveBeenCalledWith(debt.id, {
        status: 'paid',
      });
    });
  });

  describe('voidPayment', () => {
    it('throws NotFoundException when payment does not belong to the debt', async () => {
      repository.FindById.mockResolvedValue(debt);
      repository.FindPaymentById.mockResolvedValue({
        id: 'payment-1',
        debtId: 'other-debt',
        walletId: wallet.id,
        amount: '100000',
        date: '2026-01-01',
        status: 'active',
        correctionOfId: null,
      });

      await expect(
        service.voidPayment(admin, debt.id, 'payment-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
