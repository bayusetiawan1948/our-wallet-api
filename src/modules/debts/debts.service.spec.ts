import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { Debt, DebtPayment } from '../../shared/database/schema';
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

  const member: AuthenticatedUser = {
    ...admin,
    userId: 'user-2',
    role: 'member',
  };

  const debt: Debt = {
    id: 'debt-1',
    ownerUserId: null,
    ownerHouseholdId: 'household-1',
    walletId: 'wallet-1',
    type: 'utang',
    counterparty: 'Bank ABC',
    principal: '1000000',
    openingPaid: '0',
    portionAdmin: '500000',
    portionMember: '500000',
    dueDate: '2026-06-01',
    status: 'active',
    note: null,
  };

  const piutang: Debt = {
    ...debt,
    id: 'debt-2',
    type: 'piutang',
    counterparty: 'Sari',
  };
  const openingDebt: Debt = { ...debt, id: 'debt-3', walletId: null };

  const wallet = {
    id: 'wallet-1',
    ownerUserId: 'user-1',
    ownerHouseholdId: null,
    name: 'BCA',
    type: 'bank' as const,
    currency: 'IDR',
    balance: 2000000,
  };

  const payment = (overrides: Partial<DebtPayment> = {}): DebtPayment => ({
    id: 'payment-1',
    debtId: debt.id,
    walletId: wallet.id,
    amount: '400000',
    date: '2026-01-01',
    status: 'active',
    correctionOfId: null,
    ...overrides,
  });

  // Menjalankan builder entri (argumen terakhir) seperti yang dilakukan repository
  // di dalam DB transaction.
  const entriesOf = (call: unknown[], record: unknown) => {
    const builder = call[call.length - 1] as (
      r: unknown,
      categoryId: string,
    ) => unknown[];

    return builder(record, 'category-1');
  };

  beforeEach(async () => {
    const repositoryMock: Partial<jest.Mocked<DebtsRepository>> = {
      CreateDebtWithEntries: jest.fn(),
      UpdateDebtWithEntries: jest.fn(),
      CreatePaymentWithEntry: jest.fn(),
      VoidPaymentWithEntry: jest.fn(),
      FindById: jest.fn(),
      FindAccessible: jest.fn(),
      UpdateDebt: jest.fn(),
      DeleteDebt: jest.fn(),
      FindPaymentById: jest.fn(),
      ListPaymentsByDebt: jest.fn(),
      SumActivePayments: jest.fn().mockResolvedValue(0),
      HasActivePayments: jest.fn().mockResolvedValue(false),
    };
    const walletsServiceMock: Partial<jest.Mocked<WalletsService>> = {
      getById: jest.fn().mockResolvedValue(wallet),
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
          wallet_id: wallet.id,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('requires a wallet for a new debt', async () => {
      await expect(
        service.create(admin, {
          owner_type: 'household',
          type: 'utang',
          counterparty: 'Bank ABC',
          principal: 1000000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('records an income entry when a new utang is created', async () => {
      repository.CreateDebtWithEntries.mockResolvedValue(debt);

      await service.create(admin, {
        owner_type: 'household',
        type: 'utang',
        counterparty: 'Bank ABC',
        principal: 1000000,
        wallet_id: wallet.id,
        date: '2026-02-01',
      });

      const call = repository.CreateDebtWithEntries.mock.calls[0];

      expect(call[0]).toBe('household-1');
      expect(call[1]).toEqual(
        expect.objectContaining({
          ownerHouseholdId: 'household-1',
          ownerUserId: null,
          walletId: wallet.id,
          status: 'active',
        }),
      );
      expect(entriesOf(call, debt)).toEqual([
        expect.objectContaining({
          walletId: wallet.id,
          type: 'income',
          amount: '1000000',
          date: '2026-02-01',
          note: 'Menerima pinjaman · Bank ABC',
          source: 'debt_create',
          debtId: debt.id,
          categoryId: 'category-1',
        }),
      ]);
    });

    it('records an expense entry when a new piutang is created', async () => {
      repository.CreateDebtWithEntries.mockResolvedValue(piutang);

      await service.create(admin, {
        owner_type: 'user',
        type: 'piutang',
        counterparty: 'Sari',
        principal: 200000,
        wallet_id: wallet.id,
      });

      const call = repository.CreateDebtWithEntries.mock.calls[0];

      expect(entriesOf(call, piutang)).toEqual([
        expect.objectContaining({
          type: 'expense',
          amount: '200000',
          note: 'Meminjamkan dana · Sari',
          source: 'debt_create',
        }),
      ]);
    });

    it('rejects a new piutang when the wallet balance is insufficient', async () => {
      walletsService.getById.mockResolvedValue({ ...wallet, balance: 100 });

      await expect(
        service.create(admin, {
          owner_type: 'user',
          type: 'piutang',
          counterparty: 'Sari',
          principal: 200000,
          wallet_id: wallet.id,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.CreateDebtWithEntries).not.toHaveBeenCalled();
    });

    it('creates an opening debt without a wallet movement and derives its status', async () => {
      repository.CreateDebtWithEntries.mockResolvedValue(openingDebt);

      await service.create(admin, {
        owner_type: 'user',
        type: 'utang',
        counterparty: 'Bank ABC',
        principal: 1000000,
        is_opening: true,
        opening_paid: 300000,
      });

      const call = repository.CreateDebtWithEntries.mock.calls[0];

      expect(call[1]).toEqual(
        expect.objectContaining({
          walletId: null,
          openingPaid: '300000',
          status: 'partial',
        }),
      );
      expect(entriesOf(call, openingDebt)).toEqual([]);
      expect(walletsService.getById).not.toHaveBeenCalled();
    });

    it('rejects an opening debt linked to a wallet or overpaid', async () => {
      await expect(
        service.create(admin, {
          owner_type: 'user',
          type: 'utang',
          counterparty: 'A',
          principal: 1000,
          is_opening: true,
          wallet_id: wallet.id,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.create(admin, {
          owner_type: 'user',
          type: 'utang',
          counterparty: 'A',
          principal: 1000,
          is_opening: true,
          opening_paid: 2000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it('adds a revision entry with the delta when principal increases on a utang', async () => {
      repository.FindById.mockResolvedValue(debt);
      repository.UpdateDebtWithEntries.mockResolvedValue(debt);

      await service.update(admin, debt.id, { principal: 1300000 });

      const call = repository.UpdateDebtWithEntries.mock.calls[0];

      expect(call[2]).toEqual(
        expect.objectContaining({ principal: '1300000', status: 'active' }),
      );
      expect(entriesOf(call, debt)).toEqual([
        expect.objectContaining({
          type: 'income',
          amount: '300000',
          note: 'Revisi: Menerima pinjaman · Bank ABC',
          source: 'debt_revision',
        }),
      ]);
    });

    it('adds a reversing revision entry when principal decreases on a utang', async () => {
      repository.FindById.mockResolvedValue(debt);
      repository.UpdateDebtWithEntries.mockResolvedValue(debt);

      await service.update(admin, debt.id, { principal: 800000 });

      const call = repository.UpdateDebtWithEntries.mock.calls[0];

      expect(entriesOf(call, debt)).toEqual([
        expect.objectContaining({ type: 'expense', amount: '200000' }),
      ]);
    });

    it('moves the principal between wallets with a reversal and a new entry', async () => {
      const other = { ...wallet, id: 'wallet-2', name: 'Cash' };
      repository.FindById.mockResolvedValue(debt);
      repository.UpdateDebtWithEntries.mockResolvedValue(debt);
      walletsService.getById.mockImplementation(async (_u, id) =>
        id === other.id ? other : wallet,
      );

      await service.update(admin, debt.id, { wallet_id: other.id });

      const call = repository.UpdateDebtWithEntries.mock.calls[0];

      expect(entriesOf(call, debt)).toEqual([
        expect.objectContaining({
          walletId: wallet.id,
          type: 'expense',
          amount: '1000000',
          note: 'Revisi: Menerima pinjaman · Bank ABC (dompet dipindahkan)',
        }),
        expect.objectContaining({
          walletId: other.id,
          type: 'income',
          amount: '1000000',
          note: 'Revisi: Menerima pinjaman · Bank ABC',
        }),
      ]);
    });

    it('creates no entries when only non-monetary fields change', async () => {
      repository.FindById.mockResolvedValue(debt);
      repository.UpdateDebtWithEntries.mockResolvedValue(debt);

      await service.update(admin, debt.id, { note: 'catatan' });

      const call = repository.UpdateDebtWithEntries.mock.calls[0];

      expect(entriesOf(call, debt)).toEqual([]);
    });

    it('rejects principal lower than what has already been paid', async () => {
      repository.FindById.mockResolvedValue(debt);
      repository.SumActivePayments.mockResolvedValue(600000);

      await expect(
        service.update(admin, debt.id, { principal: 500000 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects changing the type of a debt that moved wallet funds', async () => {
      repository.FindById.mockResolvedValue(debt);

      await expect(
        service.update(admin, debt.id, { type: 'piutang' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('updates an opening debt without ledger entries and recomputes status', async () => {
      repository.FindById.mockResolvedValue(openingDebt);
      repository.UpdateDebtWithEntries.mockResolvedValue(openingDebt);

      await service.update(admin, openingDebt.id, { opening_paid: 1000000 });

      const call = repository.UpdateDebtWithEntries.mock.calls[0];

      expect(call[2]).toEqual(
        expect.objectContaining({ openingPaid: '1000000', status: 'paid' }),
      );
      expect(entriesOf(call, openingDebt)).toEqual([]);
    });

    it('rejects linking an opening debt to a wallet', async () => {
      repository.FindById.mockResolvedValue(openingDebt);

      await expect(
        service.update(admin, openingDebt.id, { wallet_id: wallet.id }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cancels through update with a reversing entry', async () => {
      repository.FindById.mockResolvedValue(debt);
      repository.UpdateDebtWithEntries.mockResolvedValue({
        ...debt,
        status: 'cancelled',
      });

      await service.update(admin, debt.id, { status: 'cancelled' });

      const call = repository.UpdateDebtWithEntries.mock.calls[0];

      expect(call[2]).toEqual({ status: 'cancelled' });
      expect(entriesOf(call, debt)).toEqual([
        expect.objectContaining({ type: 'expense', source: 'debt_cancel' }),
      ]);
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

    it('cancels a wallet debt with a reversing entry instead of deleting it', async () => {
      repository.FindById.mockResolvedValue(debt);
      repository.UpdateDebtWithEntries.mockResolvedValue({
        ...debt,
        status: 'cancelled',
      });

      await service.remove(admin, debt.id);

      const call = repository.UpdateDebtWithEntries.mock.calls[0];

      expect(repository.DeleteDebt).not.toHaveBeenCalled();
      expect(entriesOf(call, debt)).toEqual([
        expect.objectContaining({
          type: 'expense',
          amount: '1000000',
          note: 'Pembatalan utang/piutang · Bank ABC',
          source: 'debt_cancel',
        }),
      ]);
    });

    it('credits the wallet back when a piutang is cancelled', async () => {
      repository.FindById.mockResolvedValue(piutang);
      repository.UpdateDebtWithEntries.mockResolvedValue({
        ...piutang,
        status: 'cancelled',
      });

      await service.remove(admin, piutang.id);

      const call = repository.UpdateDebtWithEntries.mock.calls[0];

      expect(entriesOf(call, piutang)).toEqual([
        expect.objectContaining({ type: 'income', amount: '1000000' }),
      ]);
    });

    it('hard deletes an opening debt that has no ledger entries', async () => {
      repository.FindById.mockResolvedValue(openingDebt);

      await service.remove(admin, openingDebt.id);

      expect(repository.DeleteDebt).toHaveBeenCalledWith(openingDebt.id);
      expect(repository.UpdateDebtWithEntries).not.toHaveBeenCalled();
    });

    it('refuses to cancel a utang when the wallet cannot refund the principal', async () => {
      repository.FindById.mockResolvedValue(debt);
      walletsService.getById.mockResolvedValue({ ...wallet, balance: 10 });

      await expect(service.remove(admin, debt.id)).rejects.toBeInstanceOf(
        ConflictException,
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

    it('rejects a payment larger than the remaining debt, counting opening_paid', async () => {
      repository.FindById.mockResolvedValue({
        ...openingDebt,
        openingPaid: '800000',
      });

      await expect(
        service.addPayment(
          admin,
          openingDebt.id,
          wallet.id,
          300000,
          '2026-01-01',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('records a utang payment as an expense entry and marks the debt partial', async () => {
      repository.FindById.mockResolvedValue(debt);
      repository.CreatePaymentWithEntry.mockResolvedValue(payment());
      repository.SumActivePayments.mockResolvedValueOnce(
        0,
      ).mockResolvedValueOnce(400000);

      await service.addPayment(admin, debt.id, wallet.id, 400000, '2026-01-01');

      const call = repository.CreatePaymentWithEntry.mock.calls[0];

      expect(entriesOf(call, payment())).toEqual([
        expect.objectContaining({
          walletId: wallet.id,
          type: 'expense',
          amount: '400000',
          note: 'Pembayaran utang · Bank ABC',
          source: 'debt_payment',
          debtId: debt.id,
          debtPaymentId: 'payment-1',
        }),
      ]);
      expect(repository.UpdateDebt).toHaveBeenCalledWith(debt.id, {
        status: 'partial',
      });
    });

    it('records a piutang payment as an income entry', async () => {
      repository.FindById.mockResolvedValue(piutang);
      repository.CreatePaymentWithEntry.mockResolvedValue(
        payment({ debtId: piutang.id }),
      );

      await service.addPayment(
        admin,
        piutang.id,
        wallet.id,
        400000,
        '2026-01-01',
      );

      const call = repository.CreatePaymentWithEntry.mock.calls[0];

      expect(entriesOf(call, payment())).toEqual([
        expect.objectContaining({
          type: 'income',
          note: 'Pengembalian dana · Sari',
        }),
      ]);
    });

    it('marks debt as paid once total payments reach the principal', async () => {
      repository.FindById.mockResolvedValue(debt);
      repository.CreatePaymentWithEntry.mockResolvedValue(
        payment({ amount: '1000000' }),
      );
      repository.SumActivePayments.mockResolvedValueOnce(
        0,
      ).mockResolvedValueOnce(1000000);

      await service.addPayment(
        admin,
        debt.id,
        wallet.id,
        1000000,
        '2026-01-01',
      );

      expect(repository.UpdateDebt).toHaveBeenCalledWith(debt.id, {
        status: 'paid',
      });
    });

    it('counts opening_paid when deriving the status', async () => {
      const partlyPaid = { ...openingDebt, openingPaid: '600000' };
      repository.FindById.mockResolvedValue(partlyPaid);
      repository.CreatePaymentWithEntry.mockResolvedValue(
        payment({ debtId: partlyPaid.id, amount: '400000' }),
      );
      repository.SumActivePayments.mockResolvedValueOnce(
        0,
      ).mockResolvedValueOnce(400000);

      await service.addPayment(
        admin,
        partlyPaid.id,
        wallet.id,
        400000,
        '2026-01-01',
      );

      expect(repository.UpdateDebt).toHaveBeenCalledWith(partlyPaid.id, {
        status: 'paid',
      });
    });

    it('rejects a payment on a cancelled debt', async () => {
      repository.FindById.mockResolvedValue({ ...debt, status: 'cancelled' });

      await expect(
        service.addPayment(admin, debt.id, wallet.id, 1000, '2026-01-01'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('voidPayment', () => {
    it('throws NotFoundException when payment does not belong to the debt', async () => {
      repository.FindById.mockResolvedValue(debt);
      repository.FindPaymentById.mockResolvedValue(
        payment({ debtId: 'other-debt' }),
      );

      await expect(
        service.voidPayment(admin, debt.id, 'payment-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('credits the wallet back when a utang payment is voided', async () => {
      repository.FindById.mockResolvedValue(debt);
      repository.FindPaymentById.mockResolvedValue(payment());
      repository.VoidPaymentWithEntry.mockResolvedValue(
        payment({ status: 'void' }),
      );

      await service.voidPayment(admin, debt.id, 'payment-1');

      const call = repository.VoidPaymentWithEntry.mock.calls[0];

      expect(entriesOf(call, payment({ status: 'void' }))).toEqual([
        expect.objectContaining({
          type: 'income',
          amount: '400000',
          note: 'Pembatalan pembayaran · Bank ABC',
          source: 'debt_payment_void',
          debtPaymentId: 'payment-1',
        }),
      ]);
    });

    it('refuses to void a piutang payment when the wallet cannot return the funds', async () => {
      repository.FindById.mockResolvedValue(piutang);
      repository.FindPaymentById.mockResolvedValue(
        payment({ debtId: piutang.id }),
      );
      walletsService.getById.mockResolvedValue({ ...wallet, balance: 10 });

      await expect(
        service.voidPayment(admin, piutang.id, 'payment-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects voiding an already void payment', async () => {
      repository.FindById.mockResolvedValue(debt);
      repository.FindPaymentById.mockResolvedValue(payment({ status: 'void' }));

      await expect(
        service.voidPayment(admin, debt.id, 'payment-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
