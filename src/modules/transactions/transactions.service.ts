import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { Transaction } from '../../shared/database/schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { HouseholdsService } from '../households/households.service';
import { ReservationsService } from '../reservations/reservations.service';
import { WalletsService } from '../wallets/wallets.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import {
  TransactionFilter,
  TransactionsRepository,
} from './transactions.repository';

export const ENCROACHMENT_REQUIRED = 'ENCROACHMENT_REQUIRED';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly transactionsRepository: TransactionsRepository,
    private readonly walletsService: WalletsService,
    private readonly householdsService: HouseholdsService,
    private readonly reservationsService: ReservationsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(
    currentUser: AuthenticatedUser,
    dto: CreateTransactionDto,
  ): Promise<Transaction> {
    const ownerId = await this.resolveOwnerId(currentUser, dto.owner_id);
    const wallet = await this.walletsService.getById(
      currentUser,
      dto.wallet_id,
    );

    await this.assertCategoryInHousehold(currentUser, dto.category_id);

    if (dto.type === 'expense' && wallet.balance < dto.amount) {
      throw new ConflictException(
        `Insufficient balance in wallet "${wallet.name}": available ${wallet.balance}, requested ${dto.amount}`,
      );
    }

    let shortfall = 0;

    if (dto.type === 'expense') {
      const reservedTotal = await this.reservationsService.computeReservedTotal(
        dto.wallet_id,
      );
      const freeBalanceAfter = wallet.balance - reservedTotal - dto.amount;

      if (freeBalanceAfter < 0) {
        shortfall = Math.abs(freeBalanceAfter);

        if (!dto.encroachments || dto.encroachments.length === 0) {
          throw new ConflictException({
            message: ENCROACHMENT_REQUIRED,
            shortfall,
            wallet_id: dto.wallet_id,
          });
        }

        const totalAllocated = dto.encroachments.reduce(
          (sum, a) => sum + a.amount,
          0,
        );

        if (Math.round(totalAllocated * 100) !== Math.round(shortfall * 100)) {
          throw new BadRequestException(
            `Total encroachment allocation (${totalAllocated}) must exactly match the free balance shortfall (${shortfall})`,
          );
        }

        await this.reservationsService.assertEncroachmentTargets(
          dto.wallet_id,
          dto.encroachments,
        );
      }
    }

    const transaction = await this.transactionsRepository.CreateTransaction({
      walletId: dto.wallet_id,
      categoryId: dto.category_id,
      ownerId,
      recordedBy: currentUser.userId,
      type: dto.type,
      amount: dto.amount.toString(),
      date: dto.date,
      note: dto.note ?? null,
      attachmentUrl: dto.attachment_url ?? null,
      status: 'active',
    });

    if (shortfall > 0 && dto.encroachments) {
      await this.reservationsService.applyEncroachment(
        transaction.id,
        dto.wallet_id,
        dto.encroachments,
      );
    }

    await this.auditLogsService.log(
      currentUser.userId,
      'TRANSACTIONS',
      transaction.id,
      'CREATE_TRANSACTION',
    );

    return transaction;
  }

  async checkEncroachment(
    currentUser: AuthenticatedUser,
    walletId: string,
    amount: number,
  ): Promise<{ shortfall: number; reserved_total: number }> {
    const wallet = await this.walletsService.getById(currentUser, walletId);
    const reservedTotal =
      await this.reservationsService.computeReservedTotal(walletId);
    const freeBalanceAfter = wallet.balance - reservedTotal - amount;

    return {
      shortfall: freeBalanceAfter < 0 ? Math.abs(freeBalanceAfter) : 0,
      reserved_total: reservedTotal,
    };
  }

  async list(
    currentUser: AuthenticatedUser,
    filter: TransactionFilter,
  ): Promise<Transaction[]> {
    let walletIds: string[];

    if (filter.walletId) {
      const wallet = await this.walletsService.getById(
        currentUser,
        filter.walletId,
      );
      walletIds = [wallet.id];
    } else {
      const wallets = await this.walletsService.listAccessible(currentUser);
      walletIds = wallets.map((w) => w.id);
    }

    return this.transactionsRepository.FindByWalletIds(walletIds, filter);
  }

  async void(
    currentUser: AuthenticatedUser,
    transactionId: string,
  ): Promise<Transaction> {
    const transaction = await this.assertAccessToTransaction(
      currentUser,
      transactionId,
    );

    this.assertNotDebtEntry(transaction);

    if (transaction.status === 'void') {
      throw new ConflictException('Transaction is already void');
    }

    const updated = await this.transactionsRepository.UpdateStatus(
      transaction.id,
      'void',
    );

    if (!updated) {
      throw new NotFoundException('Transaction not found');
    }

    await this.auditLogsService.log(
      currentUser.userId,
      'TRANSACTIONS',
      updated.id,
      'VOID_TRANSACTION',
    );

    return updated;
  }

  async correct(
    currentUser: AuthenticatedUser,
    transactionId: string,
    dto: CreateTransactionDto,
  ): Promise<Transaction> {
    const original = await this.assertAccessToTransaction(
      currentUser,
      transactionId,
    );

    this.assertNotDebtEntry(original);

    if (original.status === 'void') {
      throw new ConflictException(
        'Cannot correct a transaction that is already void',
      );
    }

    const ownerId = await this.resolveOwnerId(currentUser, dto.owner_id);
    const wallet = await this.walletsService.getById(
      currentUser,
      dto.wallet_id,
    );

    await this.assertCategoryInHousehold(currentUser, dto.category_id);

    if (dto.type === 'expense' && wallet.balance < dto.amount) {
      throw new ConflictException(
        `Insufficient balance in wallet "${wallet.name}": available ${wallet.balance}, requested ${dto.amount}`,
      );
    }

    await this.transactionsRepository.UpdateStatus(original.id, 'void');

    const corrected = await this.transactionsRepository.CreateTransaction({
      walletId: dto.wallet_id,
      categoryId: dto.category_id,
      ownerId,
      recordedBy: currentUser.userId,
      type: dto.type,
      amount: dto.amount.toString(),
      date: dto.date,
      note: dto.note ?? null,
      status: 'active',
      correctionOfId: original.id,
    });

    await this.auditLogsService.log(
      currentUser.userId,
      'TRANSACTIONS',
      corrected.id,
      'CORRECT_TRANSACTION',
    );

    return corrected;
  }

  // Entri hasil utang/piutang atau investasi hanya boleh dibatalkan lewat menu
  // asalnya supaya saldo dan data sumbernya tidak bisa tidak sinkron.
  private assertNotDebtEntry(transaction: Transaction): void {
    if (transaction.source?.startsWith('investment_')) {
      throw new ConflictException(
        'Transaksi ini berasal dari investasi, batalkan lewat menu Investasi',
      );
    }

    if (transaction.source !== null) {
      throw new ConflictException(
        'Transaksi ini berasal dari utang/piutang, batalkan lewat menu Utang & Piutang',
      );
    }
  }

  private async resolveOwnerId(
    currentUser: AuthenticatedUser,
    requestedOwnerId?: string,
  ): Promise<string> {
    if (!requestedOwnerId || requestedOwnerId === currentUser.userId) {
      return currentUser.userId;
    }

    if (currentUser.role === 'admin') {
      return requestedOwnerId;
    }

    const membership = await this.householdsService.FindMembershipByUserId(
      currentUser.userId,
    );

    if (!membership?.canEditOthersTransactions) {
      throw new ForbiddenException(
        'You are not allowed to record transactions on behalf of other members',
      );
    }

    return requestedOwnerId;
  }

  private async assertCategoryInHousehold(
    currentUser: AuthenticatedUser,
    categoryId: string,
  ): Promise<void> {
    const householdId =
      await this.transactionsRepository.FindCategoryHouseholdId(categoryId);

    if (!householdId || householdId !== currentUser.householdId) {
      throw new BadRequestException('Category not found in your household');
    }
  }

  private async assertAccessToTransaction(
    currentUser: AuthenticatedUser,
    transactionId: string,
  ): Promise<Transaction> {
    const transaction =
      await this.transactionsRepository.FindById(transactionId);

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    await this.walletsService.getById(currentUser, transaction.walletId);

    return transaction;
  }
}
