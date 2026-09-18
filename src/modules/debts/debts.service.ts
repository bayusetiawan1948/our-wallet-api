import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { Debt, DebtPayment } from '../../shared/database/schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { WalletsService } from '../wallets/wallets.service';
import { CreateDebtDto } from './dto/create-debt.dto';
import { UpdateDebtDto } from './dto/update-debt.dto';
import { DebtsRepository } from './debts.repository';

@Injectable()
export class DebtsService {
  constructor(
    private readonly debtsRepository: DebtsRepository,
    private readonly walletsService: WalletsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(currentUser: AuthenticatedUser, dto: CreateDebtDto): Promise<Debt> {
    if (dto.owner_type === 'household' && currentUser.role !== 'admin') {
      throw new ForbiddenException(
        'Only household admin can create a household-owned debt',
      );
    }

    if (!currentUser.householdId) {
      throw new ForbiddenException('You do not belong to a household yet');
    }

    const debt = await this.debtsRepository.CreateDebt({
      ownerUserId: dto.owner_type === 'user' ? currentUser.userId : null,
      ownerHouseholdId:
        dto.owner_type === 'household' ? currentUser.householdId : null,
      type: dto.type,
      counterparty: dto.counterparty,
      principal: dto.principal.toString(),
      portionAdmin: (dto.portion_admin ?? 0).toString(),
      portionMember: (dto.portion_member ?? 0).toString(),
      dueDate: dto.due_date ?? null,
      status: 'active',
      note: dto.note ?? null,
    });

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

    const updated = await this.debtsRepository.UpdateDebt(debt.id, {
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.counterparty !== undefined
        ? { counterparty: dto.counterparty }
        : {}),
      ...(dto.principal !== undefined
        ? { principal: dto.principal.toString() }
        : {}),
      ...(dto.portion_admin !== undefined
        ? { portionAdmin: dto.portion_admin.toString() }
        : {}),
      ...(dto.portion_member !== undefined
        ? { portionMember: dto.portion_member.toString() }
        : {}),
      ...(dto.due_date !== undefined ? { dueDate: dto.due_date } : {}),
      ...(dto.note !== undefined ? { note: dto.note } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    });

    if (!updated) {
      throw new NotFoundException('Debt not found');
    }

    return this.recalculateStatus(updated);
  }

  async remove(currentUser: AuthenticatedUser, debtId: string): Promise<void> {
    const debt = await this.assertAccess(currentUser, debtId);

    const hasPayments = await this.debtsRepository.HasActivePayments(debt.id);

    if (hasPayments) {
      throw new ConflictException(
        'Debt still has active payment history, void the payments first',
      );
    }

    await this.debtsRepository.DeleteDebt(debt.id);
    await this.auditLogsService.log(
      currentUser.userId,
      'DEBTS',
      debt.id,
      'DELETE_DEBT',
    );
  }

  async addPayment(
    currentUser: AuthenticatedUser,
    debtId: string,
    walletId: string,
    amount: number,
    date: string,
  ): Promise<DebtPayment> {
    const debt = await this.assertAccess(currentUser, debtId);
    const wallet = await this.walletsService.getById(currentUser, walletId);

    if (debt.type === 'utang' && wallet.balance < amount) {
      throw new ConflictException(
        `Insufficient balance in wallet "${wallet.name}": available ${wallet.balance}, requested ${amount}`,
      );
    }

    const payment = await this.debtsRepository.CreatePayment({
      debtId: debt.id,
      walletId,
      amount: amount.toString(),
      date,
      status: 'active',
    });

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
    const payment = await this.debtsRepository.FindPaymentById(paymentId);

    if (!payment || payment.debtId !== debt.id) {
      throw new NotFoundException('Debt payment not found');
    }

    if (payment.status === 'void') {
      throw new ConflictException('Payment is already void');
    }

    await this.walletsService.getById(currentUser, payment.walletId);

    const updated = await this.debtsRepository.UpdatePaymentStatus(
      payment.id,
      'void',
    );

    if (!updated) {
      throw new NotFoundException('Debt payment not found');
    }

    await this.updateDebtStatusFromPayments(debt);

    return updated;
  }

  private async updateDebtStatusFromPayments(debt: Debt): Promise<void> {
    if (debt.status === 'cancelled') {
      return;
    }

    const totalPaid = await this.debtsRepository.SumActivePayments(debt.id);
    const principal = Number(debt.principal);

    const status =
      totalPaid >= principal ? 'paid' : totalPaid > 0 ? 'partial' : 'active';

    await this.debtsRepository.UpdateDebt(debt.id, { status });
  }

  private async recalculateStatus(debt: Debt): Promise<Debt> {
    if (debt.status === 'cancelled') {
      return debt;
    }

    const totalPaid = await this.debtsRepository.SumActivePayments(debt.id);
    const principal = Number(debt.principal);
    const status =
      totalPaid >= principal ? 'paid' : totalPaid > 0 ? 'partial' : 'active';

    if (status === debt.status) {
      return debt;
    }

    const updated = await this.debtsRepository.UpdateDebt(debt.id, { status });

    return updated ?? debt;
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
