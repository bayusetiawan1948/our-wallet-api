import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { Transaction } from '../../shared/database/schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { HouseholdsService } from '../households/households.service';
import { ReservationsService } from '../reservations/reservations.service';
import { WalletsService } from '../wallets/wallets.service';
import { buildImportHashes } from './transaction-import-hash';
import { TransactionsRepository } from './transactions.repository';
import { TransactionsService } from './transactions.service';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let repository: jest.Mocked<TransactionsRepository>;
  let walletsService: jest.Mocked<WalletsService>;
  let householdsService: jest.Mocked<HouseholdsService>;
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

  const member: AuthenticatedUser = {
    ...admin,
    userId: 'user-2',
    role: 'member',
  };

  const wallet = {
    id: 'wallet-1',
    ownerUserId: 'user-1',
    ownerHouseholdId: null,
    name: 'BCA',
    type: 'bank' as const,
    currency: 'IDR',
    balance: 100000,
  };

  const transaction: Transaction = {
    id: 'tx-1',
    walletId: 'wallet-1',
    categoryId: 'category-1',
    ownerId: 'user-1',
    recordedBy: 'user-1',
    type: 'expense',
    amount: '50000',
    date: '2026-01-01',
    note: null,
    attachmentUrl: null,
    status: 'active',
    source: null,
    debtId: null,
    debtPaymentId: null,
    investmentTransactionId: null,
    correctionOfId: null,
    importHash: null,
  };

  beforeEach(async () => {
    const repositoryMock: Partial<jest.Mocked<TransactionsRepository>> = {
      CreateTransaction: jest.fn(),
      FindById: jest.fn(),
      FindByWalletIds: jest.fn(),
      UpdateStatus: jest.fn(),
      FindCategoryHouseholdId: jest.fn(),
      BulkCreateTransactions: jest.fn(),
      FindExistingImportHashes: jest.fn(),
    };
    const walletsServiceMock: Partial<jest.Mocked<WalletsService>> = {
      getById: jest.fn(),
      listAccessible: jest.fn(),
    };
    const householdsServiceMock: Partial<jest.Mocked<HouseholdsService>> = {
      FindMembershipByUserId: jest.fn(),
    };
    const reservationsServiceMock: Partial<jest.Mocked<ReservationsService>> = {
      computeReservedTotal: jest.fn().mockResolvedValue(0),
      applyEncroachment: jest.fn(),
      assertEncroachmentTargets: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: TransactionsRepository, useValue: repositoryMock },
        { provide: WalletsService, useValue: walletsServiceMock },
        { provide: HouseholdsService, useValue: householdsServiceMock },
        { provide: ReservationsService, useValue: reservationsServiceMock },
        { provide: AuditLogsService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get(TransactionsService);
    repository = module.get(TransactionsRepository);
    walletsService = module.get(WalletsService);
    householdsService = module.get(HouseholdsService);
    reservationsService = module.get(ReservationsService);
  });

  describe('create', () => {
    it('throws BadRequestException when category is outside the household', async () => {
      walletsService.getById.mockResolvedValue(wallet);
      repository.FindCategoryHouseholdId.mockResolvedValue('other-household');

      await expect(
        service.create(admin, {
          wallet_id: 'wallet-1',
          category_id: 'category-1',
          type: 'expense',
          amount: 1000,
          date: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ConflictException when expense exceeds wallet balance', async () => {
      walletsService.getById.mockResolvedValue(wallet);
      repository.FindCategoryHouseholdId.mockResolvedValue('household-1');

      await expect(
        service.create(admin, {
          wallet_id: 'wallet-1',
          category_id: 'category-1',
          type: 'expense',
          amount: 999999,
          date: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ForbiddenException when member records for another user without permission', async () => {
      walletsService.getById.mockResolvedValue(wallet);
      repository.FindCategoryHouseholdId.mockResolvedValue('household-1');
      householdsService.FindMembershipByUserId.mockResolvedValue({
        householdId: 'household-1',
        userId: 'user-2',
        role: 'member',
        canEditOthersTransactions: false,
      });

      await expect(
        service.create(member, {
          wallet_id: 'wallet-1',
          category_id: 'category-1',
          owner_id: 'user-1',
          type: 'expense',
          amount: 1000,
          date: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ConflictException requiring encroachment when reservations exceed free balance', async () => {
      walletsService.getById.mockResolvedValue(wallet);
      repository.FindCategoryHouseholdId.mockResolvedValue('household-1');
      reservationsService.computeReservedTotal.mockResolvedValue(60000);

      await expect(
        service.create(admin, {
          wallet_id: 'wallet-1',
          category_id: 'category-1',
          type: 'expense',
          amount: 50000,
          date: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates the transaction and applies encroachment when allocation matches shortfall', async () => {
      walletsService.getById.mockResolvedValue(wallet);
      repository.FindCategoryHouseholdId.mockResolvedValue('household-1');
      reservationsService.computeReservedTotal.mockResolvedValue(60000);
      repository.CreateTransaction.mockResolvedValue(transaction);

      await service.create(admin, {
        wallet_id: 'wallet-1',
        category_id: 'category-1',
        type: 'expense',
        amount: 50000,
        date: '2026-01-01',
        encroachments: [{ budget_id: 'budget-1', amount: 10000 }],
      });

      expect(reservationsService.applyEncroachment).toHaveBeenCalledWith(
        transaction.id,
        'wallet-1',
        [{ budget_id: 'budget-1', amount: 10000 }],
      );
    });

    it('does not save the transaction when an allocation target is invalid', async () => {
      walletsService.getById.mockResolvedValue(wallet);
      repository.FindCategoryHouseholdId.mockResolvedValue('household-1');
      reservationsService.computeReservedTotal.mockResolvedValue(60000);
      reservationsService.assertEncroachmentTargets.mockRejectedValue(
        new BadRequestException('No reservation found'),
      );

      await expect(
        service.create(admin, {
          wallet_id: 'wallet-1',
          category_id: 'category-1',
          type: 'expense',
          amount: 50000,
          date: '2026-01-01',
          encroachments: [{ budget_id: 'budget-1', amount: 10000 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(repository.CreateTransaction).not.toHaveBeenCalled();
    });

    it('creates a transaction for the current user', async () => {
      walletsService.getById.mockResolvedValue(wallet);
      repository.FindCategoryHouseholdId.mockResolvedValue('household-1');
      repository.CreateTransaction.mockResolvedValue(transaction);

      const result = await service.create(admin, {
        wallet_id: 'wallet-1',
        category_id: 'category-1',
        type: 'expense',
        amount: 50000,
        date: '2026-01-01',
      });

      expect(repository.CreateTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: 'user-1',
          recordedBy: 'user-1',
          status: 'active',
        }),
      );
      expect(result).toEqual(transaction);
    });
  });

  describe('void', () => {
    it('throws NotFoundException when transaction does not exist', async () => {
      repository.FindById.mockResolvedValue(undefined);

      await expect(service.void(admin, 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ConflictException when already void', async () => {
      repository.FindById.mockResolvedValue({ ...transaction, status: 'void' });
      walletsService.getById.mockResolvedValue(wallet);

      await expect(service.void(admin, transaction.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects voiding an entry that originates from a debt', async () => {
      repository.FindById.mockResolvedValue({
        ...transaction,
        source: 'debt_create',
        debtId: 'debt-1',
      });
      walletsService.getById.mockResolvedValue(wallet);

      await expect(service.void(admin, transaction.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repository.UpdateStatus).not.toHaveBeenCalled();
    });

    it('voids an active transaction', async () => {
      repository.FindById.mockResolvedValue(transaction);
      walletsService.getById.mockResolvedValue(wallet);
      repository.UpdateStatus.mockResolvedValue({
        ...transaction,
        status: 'void',
      });

      const result = await service.void(admin, transaction.id);

      expect(repository.UpdateStatus).toHaveBeenCalledWith(
        transaction.id,
        'void',
      );
      expect(result.status).toBe('void');
    });
  });

  describe('bulkCreate', () => {
    const items = [
      {
        category_id: 'category-1',
        type: 'expense' as const,
        amount: 35000,
        date: '2026-10-02T09:00:00+07:00',
        note: 'Makan',
      },
      {
        category_id: 'category-1',
        type: 'income' as const,
        amount: 8000000,
        date: '2026-10-01T08:10:00+07:00',
        note: 'Gaji',
      },
    ];

    it('rejects when a category is outside the household', async () => {
      walletsService.getById.mockResolvedValue(wallet);
      repository.FindCategoryHouseholdId.mockResolvedValue('other-household');

      await expect(
        service.bulkCreate(admin, { wallet_id: 'wallet-1', items }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.BulkCreateTransactions).not.toHaveBeenCalled();
    });

    it('inserts rows ordered by date and reports inserted and skipped counts', async () => {
      walletsService.getById.mockResolvedValue(wallet);
      repository.FindCategoryHouseholdId.mockResolvedValue('household-1');
      repository.BulkCreateTransactions.mockResolvedValue([transaction]);

      const result = await service.bulkCreate(admin, {
        wallet_id: 'wallet-1',
        items,
      });

      const rows = repository.BulkCreateTransactions.mock.calls[0][0];
      expect(rows.map((r) => r.note)).toEqual(['Gaji', 'Makan']);
      expect(rows.every((r) => typeof r.importHash === 'string')).toBe(true);
      expect(rows.every((r) => r.recordedBy === 'user-1')).toBe(true);
      expect(result).toEqual({ inserted: 1, skipped: 1 });
    });

    it('does not check wallet balance for imported expenses', async () => {
      walletsService.getById.mockResolvedValue({ ...wallet, balance: 0 });
      repository.FindCategoryHouseholdId.mockResolvedValue('household-1');
      repository.BulkCreateTransactions.mockResolvedValue([transaction]);

      await expect(
        service.bulkCreate(admin, {
          wallet_id: 'wallet-1',
          items: [items[0]],
        }),
      ).resolves.toEqual({ inserted: 1, skipped: 0 });
    });
  });

  describe('checkDuplicates', () => {
    it('returns the input indexes whose hash already exists', async () => {
      walletsService.getById.mockResolvedValue(wallet);
      const items = [
        { type: 'expense' as const, amount: 100, date: '2026-10-02T09:00:00Z' },
        { type: 'expense' as const, amount: 200, date: '2026-10-01T09:00:00Z' },
      ];
      const [oldestHash] = buildImportHashes('wallet-1', [items[1]]);
      repository.FindExistingImportHashes.mockResolvedValue(
        new Set([oldestHash]),
      );

      const result = await service.checkDuplicates(admin, {
        wallet_id: 'wallet-1',
        items,
      });

      expect(result).toEqual([1]);
    });
  });

  describe('buildImportHashes', () => {
    const base = {
      type: 'expense' as const,
      amount: 5000,
      date: '2026-10-02T09:00:00+07:00',
      note: 'Parkir',
    };

    it('is deterministic and ignores note casing and spacing', () => {
      const [a] = buildImportHashes('w1', [base]);
      const [b] = buildImportHashes('w1', [{ ...base, note: '  parkir ' }]);

      expect(a).toBe(b);
    });

    it('separates identical twins within a batch but stays stable across runs', () => {
      const first = buildImportHashes('w1', [base, base]);
      const second = buildImportHashes('w1', [base, base]);

      expect(first[0]).not.toBe(first[1]);
      expect(first).toEqual(second);
    });

    it('differs per wallet', () => {
      expect(buildImportHashes('w1', [base])[0]).not.toBe(
        buildImportHashes('w2', [base])[0],
      );
    });
  });
});
