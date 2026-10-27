import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import {
  Debt,
  DebtPayment,
  NewTransaction,
} from '../../shared/database/schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { WalletsService } from '../wallets/wallets.service';
import { CreateDebtDto } from './dto/create-debt.dto';
import { UpdateDebtDto } from './dto/update-debt.dto';
import { DebtsRepository } from './debts.repository';

type EntryType = 'income' | 'expense';
type EntrySource = NonNullable<NewTransaction['source']>;
type DebtType = Debt['type'];

interface LedgerEntryInput {
  walletId: string;
  type: EntryType;
  amount: number;
  note: string;
  source: EntrySource;
  date: string;
  debtPaymentId?: string;
}

const today = () => new Date().toISOString().slice(0, 10);

// Utang: dana pinjaman masuk ke dompet. Piutang: dana keluar dari dompet.
const principalDirection = (type: DebtType): EntryType =>
  type === 'utang' ? 'income' : 'expense';

const reverse = (type: EntryType): EntryType =>
  type === 'income' ? 'expense' : 'income';

const createTitle = (type: DebtType, counterparty: string) =>
  type === 'utang'
    ? `Menerima pinjaman · ${counterparty}`
    : `Meminjamkan dana · ${counterparty}`;

const paymentTitle = (type: DebtType, counterparty: string) =>
  type === 'utang'
    ? `Pembayaran utang · ${counterparty}`
    : `Pengembalian dana · ${counterparty}`;

@Injectable()
export class DebtsService {
  constructor(
    private readonly debtsRepository: DebtsRepository,
    private readonly walletsService: WalletsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(
    currentUser: AuthenticatedUser,
    dto: CreateDebtDto,
  ): Promise<Debt> {
    if (dto.owner_type === 'household' && currentUser.role !== 'admin') {
      throw new ForbiddenException(
        'Only household admin can create a household-owned debt',
      );
    }

    const householdId = this.requireHousehold(currentUser);
    const isOpening = dto.is_opening === true;
    const openingPaid = dto.opening_paid ?? 0;

    if (isOpening) {
      if (dto.wallet_id) {
        throw new BadRequestException(
          'wallet_id must be empty for an existing (opening) debt',
        );
      }

      if (openingPaid > dto.principal) {
        throw new BadRequestException(
          'opening_paid cannot be greater than principal',
        );
      }
    } else {
      if (!dto.wallet_id) {
        throw new BadRequestException(
          'wallet_id is required for a new debt, or mark it as an existing (opening) debt',
        );
      }

      if (openingPaid > 0) {
        throw new BadRequestException(
          'opening_paid is only allowed for an existing (opening) debt',
        );
      }

      // Piutang baru berarti uang keluar dari dompet, jadi saldo harus cukup.
      if (dto.type === 'piutang') {
        await this.assertFunds(currentUser, dto.wallet_id, dto.principal);
      } else {
        await this.walletsService.getById(currentUser, dto.wallet_id);
      }
    }

    const walletId = isOpening ? null : (dto.wallet_id ?? null);

    const debt = await this.debtsRepository.CreateDebtWithEntries(
      householdId,
      {
        ownerUserId: dto.owner_type === 'user' ? currentUser.userId : null,
        ownerHouseholdId: dto.owner_type === 'household' ? householdId : null,
        walletId,
        type: dto.type,
        counterparty: dto.counterparty,
        principal: dto.principal.toString(),
        openingPaid: openingPaid.toString(),
        portionAdmin: (dto.portion_admin ?? 0).toString(),
        portionMember: (dto.portion_member ?? 0).toString(),
        dueDate: dto.due_date ?? null,
        status: this.resolveStatus(dto.principal, openingPaid),
        note: dto.note ?? null,
      },
      (created, categoryId) =>
        walletId
          ? [
              this.buildEntry(currentUser, created, categoryId, {
                walletId,
                type: principalDirection(created.type),
                amount: dto.principal,
                note: createTitle(created.type, created.counterparty),
                source: 'debt_create',
                date: dto.date ?? today(),
              }),
            ]
          : [],
    );

    await this.auditLogsService.log(
      currentUser.userId,
      'DEBTS',
      debt.id,
      'CREATE_DEBT',
    );

    return debt;
  }

  async list(currentUser: AuthenticatedUser): Promise<Debt[]> {
    return this.debtsRepository.FindAccessible(
      currentUser.userId,
      currentUser.householdId,
    );
  }

  async update(
    currentUser: AuthenticatedUser,
    debtId: string,
    dto: UpdateDebtDto,
  ): Promise<Debt> {
    const debt = await this.assertAccess(currentUser, debtId);

    if (debt.status === 'cancelled') {
      throw new ConflictException('Debt is already cancelled');
    }

    if (dto.status === 'cancelled') {
      return this.cancel(currentUser, debt);
    }

    const householdId = this.requireHousehold(currentUser);
    const isOpening = debt.walletId === null;
    const hasPayments = await this.debtsRepository.HasActivePayments(debt.id);

    if (dto.type !== undefined && dto.type !== debt.type) {
      if (!isOpening || hasPayments) {
        throw new ConflictException(
          'Debt type cannot be changed once it has a wallet movement or payments',
        );
      }
    }

    if (isOpening && dto.wallet_id !== undefined) {
      throw new BadRequestException(
        'An existing (opening) debt cannot be linked to a wallet',
      );
    }

    if (!isOpening && dto.opening_paid !== undefined) {
      throw new BadRequestException(
        'opening_paid is only allowed for an existing (opening) debt',
      );
    }

    const type = dto.type ?? debt.type;
    const counterparty = dto.counterparty ?? debt.counterparty;
    const oldPrincipal = Number(debt.principal);
    const newPrincipal = dto.principal ?? oldPrincipal;
    const newOpeningPaid = dto.opening_paid ?? Number(debt.openingPaid);
    const activePaid = await this.debtsRepository.SumActivePayments(debt.id);

    if (newPrincipal < newOpeningPaid + activePaid) {
      throw new ConflictException(
        'Principal cannot be less than the amount that has already been paid',
      );
    }

    const entries: LedgerEntryInput[] = [];
    let newWalletId = debt.walletId;

    if (debt.walletId) {
      newWalletId = dto.wallet_id ?? debt.walletId;
      const direction = principalDirection(type);
      const title = `Revisi: ${createTitle(type, counterparty)}`;

      if (newWalletId !== debt.walletId) {
        await this.walletsService.getById(currentUser, newWalletId);
        entries.push(
          {
            walletId: debt.walletId,
            type: reverse(direction),
            amount: oldPrincipal,
            note: `${title} (dompet dipindahkan)`,
            source: 'debt_revision',
            date: today(),
          },
          {
            walletId: newWalletId,
            type: direction,
            amount: newPrincipal,
            note: title,
            source: 'debt_revision',
            date: today(),
          },
        );
      } else if (newPrincipal !== oldPrincipal) {
        const delta = newPrincipal - oldPrincipal;

        entries.push({
          walletId: debt.walletId,
          type: delta > 0 ? direction : reverse(direction),
          amount: Math.abs(delta),
          note: title,
          source: 'debt_revision',
          date: today(),
        });
      }

      await this.assertEntriesAffordable(currentUser, entries);
    }

    const updated = await this.debtsRepository.UpdateDebtWithEntries(
      householdId,
      debt.id,
      {
        type,
        counterparty,
        principal: newPrincipal.toString(),
        openingPaid: newOpeningPaid.toString(),
        walletId: newWalletId,
        ...(dto.portion_admin !== undefined
          ? { portionAdmin: dto.portion_admin.toString() }
          : {}),
        ...(dto.portion_member !== undefined
          ? { portionMember: dto.portion_member.toString() }
          : {}),
        ...(dto.due_date !== undefined ? { dueDate: dto.due_date } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        status: this.resolveStatus(newPrincipal, newOpeningPaid + activePaid),
      },
      (record, categoryId) =>
        entries.map((entry) =>
          this.buildEntry(currentUser, record, categoryId, entry),
        ),
    );

    if (!updated) {
      throw new NotFoundException('Debt not found');
    }

    await this.auditLogsService.log(
      currentUser.userId,
      'DEBTS',
      updated.id,
      'UPDATE_DEBT',
    );

    return updated;
  }

  // Debt yang menggerakkan saldo tidak dihapus: dibatalkan dengan entri
  // pembalik supaya riwayat transaksi tetap utuh. Debt lama (opening) tidak
  // punya entri transaksi sehingga cukup dihapus.
  async remove(currentUser: AuthenticatedUser, debtId: string): Promise<void> {
    const debt = await this.assertAccess(currentUser, debtId);

    if (debt.status === 'cancelled') {
      throw new ConflictException('Debt is already cancelled');
    }

    const hasPayments = await this.debtsRepository.HasActivePayments(debt.id);

    if (hasPayments) {
      throw new ConflictException(
        'Debt still has active payment history, void the payments first',
      );
    }

    if (debt.walletId === null) {
      await this.debtsRepository.DeleteDebt(debt.id);
      await this.auditLogsService.log(
        currentUser.userId,
        'DEBTS',
        debt.id,
        'DELETE_DEBT',
      );

      return;
    }

    await this.cancel(currentUser, debt);
  }

  async addPayment(
    currentUser: AuthenticatedUser,
    debtId: string,
    walletId: string,
    amount: number,
    date: string,
  ): Promise<DebtPayment> {
    const debt = await this.assertAccess(currentUser, debtId);
    const householdId = this.requireHousehold(currentUser);

    if (debt.status === 'cancelled') {
      throw new ConflictException('Cannot add a payment to a cancelled debt');
    }

    const activePaid = await this.debtsRepository.SumActivePayments(debt.id);
    const remaining =
      Number(debt.principal) - Number(debt.openingPaid) - activePaid;

    if (amount > remaining) {
      throw new ConflictException(
        `Payment exceeds the remaining debt: remaining ${remaining}, requested ${amount}`,
      );
    }

    // Membayar utang mengeluarkan dana dari dompet, jadi saldo harus cukup.
    if (debt.type === 'utang') {
      await this.assertFunds(currentUser, walletId, amount);
    } else {
      await this.walletsService.getById(currentUser, walletId);
    }

    const payment = await this.debtsRepository.CreatePaymentWithEntry(
      householdId,
      {
        debtId: debt.id,
        walletId,
        amount: amount.toString(),
        date,
        status: 'active',
      },
      (created, categoryId) => [
        this.buildEntry(currentUser, debt, categoryId, {
          walletId,
          type: reverse(principalDirection(debt.type)),
          amount,
          note: paymentTitle(debt.type, debt.counterparty),
          source: 'debt_payment',
          date,
          debtPaymentId: created.id,
        }),
      ],
    );

    await this.updateDebtStatusFromPayments(debt);
    await this.auditLogsService.log(
      currentUser.userId,
      'DEBT_PAYMENTS',
      payment.id,
      'CREATE_DEBT_PAYMENT',
    );

    return payment;
  }

  async listPayments(
    currentUser: AuthenticatedUser,
    debtId: string,
  ): Promise<DebtPayment[]> {
    await this.assertAccess(currentUser, debtId);

    return this.debtsRepository.ListPaymentsByDebt(debtId);
  }

  async voidPayment(
    currentUser: AuthenticatedUser,
    debtId: string,
    paymentId: string,
  ): Promise<DebtPayment> {
    const debt = await this.assertAccess(currentUser, debtId);
    const householdId = this.requireHousehold(currentUser);
    const payment = await this.debtsRepository.FindPaymentById(paymentId);

    if (!payment || payment.debtId !== debt.id) {
      throw new NotFoundException('Debt payment not found');
    }

    if (payment.status === 'void') {
      throw new ConflictException('Payment is already void');
    }

    // Membatalkan pembayaran piutang menarik kembali dana yang sudah masuk.
    const reversal = principalDirection(debt.type);
    const amount = Number(payment.amount);

    if (reversal === 'expense') {
      await this.assertFunds(currentUser, payment.walletId, amount);
    } else {
      await this.walletsService.getById(currentUser, payment.walletId);
    }

    const updated = await this.debtsRepository.VoidPaymentWithEntry(
      householdId,
      payment.id,
      (voided, categoryId) => [
        this.buildEntry(currentUser, debt, categoryId, {
          walletId: voided.walletId,
          type: reversal,
          amount,
          note: `Pembatalan pembayaran · ${debt.counterparty}`,
          source: 'debt_payment_void',
          date: today(),
          debtPaymentId: voided.id,
        }),
      ],
    );

    if (!updated) {
      throw new NotFoundException('Debt payment not found');
    }

    await this.updateDebtStatusFromPayments(debt);
    await this.auditLogsService.log(
      currentUser.userId,
      'DEBT_PAYMENTS',
      updated.id,
      'VOID_DEBT_PAYMENT',
    );

    return updated;
  }

  private async cancel(
    currentUser: AuthenticatedUser,
    debt: Debt,
  ): Promise<Debt> {
    const householdId = this.requireHousehold(currentUser);
    const hasPayments = await this.debtsRepository.HasActivePayments(debt.id);

    if (hasPayments) {
      throw new ConflictException(
        'Debt still has active payment history, void the payments first',
      );
    }

    const entries: LedgerEntryInput[] = [];

    if (debt.walletId) {
      // Dana pokok dikembalikan: utang berarti uang keluar lagi, piutang masuk lagi.
      entries.push({
        walletId: debt.walletId,
        type: reverse(principalDirection(debt.type)),
        amount: Number(debt.principal),
        note: `Pembatalan utang/piutang · ${debt.counterparty}`,
        source: 'debt_cancel',
        date: today(),
      });

      await this.assertEntriesAffordable(currentUser, entries);
    }

    const cancelled = await this.debtsRepository.UpdateDebtWithEntries(
      householdId,
      debt.id,
      { status: 'cancelled' },
      (record, categoryId) =>
        entries.map((entry) =>
          this.buildEntry(currentUser, record, categoryId, entry),
        ),
    );

    if (!cancelled) {
      throw new NotFoundException('Debt not found');
    }

    await this.auditLogsService.log(
      currentUser.userId,
      'DEBTS',
      debt.id,
      'CANCEL_DEBT',
    );

    return cancelled;
  }

  private buildEntry(
    currentUser: AuthenticatedUser,
    debt: Debt,
    categoryId: string,
    input: LedgerEntryInput,
  ): NewTransaction {
    return {
      walletId: input.walletId,
      categoryId,
      ownerId: debt.ownerUserId ?? currentUser.userId,
      recordedBy: currentUser.userId,
      type: input.type,
      amount: input.amount.toString(),
      date: input.date,
      note: input.note,
      status: 'active',
      source: input.source,
      debtId: debt.id,
      debtPaymentId: input.debtPaymentId ?? null,
    };
  }

  private async assertFunds(
    currentUser: AuthenticatedUser,
    walletId: string,
    amount: number,
  ): Promise<void> {
    const wallet = await this.walletsService.getById(currentUser, walletId);

    if (wallet.balance < amount) {
      throw new ConflictException(
        `Insufficient balance in wallet "${wallet.name}": available ${wallet.balance}, requested ${amount}`,
      );
    }
  }

  private async assertEntriesAffordable(
    currentUser: AuthenticatedUser,
    entries: LedgerEntryInput[],
  ): Promise<void> {
    for (const entry of entries) {
      if (entry.type === 'expense') {
        await this.assertFunds(currentUser, entry.walletId, entry.amount);
      }
    }
  }

  private requireHousehold(currentUser: AuthenticatedUser): string {
    if (!currentUser.householdId) {
      throw new ForbiddenException('You do not belong to a household yet');
    }

    return currentUser.householdId;
  }

  private resolveStatus(
    principal: number,
    totalPaid: number,
  ): 'active' | 'partial' | 'paid' {
    return totalPaid >= principal
      ? 'paid'
      : totalPaid > 0
        ? 'partial'
        : 'active';
  }

  private async updateDebtStatusFromPayments(debt: Debt): Promise<void> {
    if (debt.status === 'cancelled') {
      return;
    }

    const activePaid = await this.debtsRepository.SumActivePayments(debt.id);
    const status = this.resolveStatus(
      Number(debt.principal),
      Number(debt.openingPaid) + activePaid,
    );

    await this.debtsRepository.UpdateDebt(debt.id, { status });
  }

  private async assertAccess(
    currentUser: AuthenticatedUser,
    debtId: string,
  ): Promise<Debt> {
    const debt = await this.debtsRepository.FindById(debtId);

    if (!debt) {
      throw new NotFoundException('Debt not found');
    }

    const isOwner = debt.ownerUserId === currentUser.userId;
    const isHouseholdDebt =
      debt.ownerHouseholdId !== null &&
      debt.ownerHouseholdId === currentUser.householdId;

    if (!isOwner && !isHouseholdDebt) {
      throw new ForbiddenException('You do not have access to this debt');
    }

    return debt;
  }
}
