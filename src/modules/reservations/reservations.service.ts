import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { BudgetEncroachment, Reservation } from '../../shared/database/schema';
import { WalletsService } from '../wallets/wallets.service';
import { BudgetEncroachmentsRepository } from './budget-encroachments.repository';
import { CreateReservationDto } from './dto/create-reservation.dto';
import {
  ReservationsRepository,
  ReservationTargetOwner,
} from './reservations.repository';

export interface EncroachmentAllocation {
  budget_id?: string;
  goal_id?: string;
  amount: number;
}

@Injectable()
export class ReservationsService {
  constructor(
    private readonly reservationsRepository: ReservationsRepository,
    private readonly encroachmentsRepository: BudgetEncroachmentsRepository,
    private readonly walletsService: WalletsService,
  ) {}

  async create(
    currentUser: AuthenticatedUser,
    dto: CreateReservationDto,
  ): Promise<Reservation> {
    await this.walletsService.getById(currentUser, dto.wallet_id);

    if (dto.budget_id) {
      const owner = await this.reservationsRepository.FindBudgetOwner(
        dto.budget_id,
      );

      this.assertCanTarget(currentUser, owner, 'Budget');
      await this.assertWithinTarget(
        await this.reservationsRepository.ListByBudget(dto.budget_id),
        dto.reserved_amount,
        Number(owner!.targetAmount),
        'budget',
      );
    }

    if (dto.goal_id) {
      const owner = await this.reservationsRepository.FindGoalOwner(
        dto.goal_id,
      );

      this.assertCanTarget(currentUser, owner, 'Goal');
      await this.assertWithinTarget(
        await this.reservationsRepository.ListByGoal(dto.goal_id),
        dto.reserved_amount,
        Number(owner!.targetAmount),
        'goal',
      );
    }

    return this.reservationsRepository.Create({
      walletId: dto.wallet_id,
      budgetId: dto.budget_id ?? null,
      goalId: dto.goal_id ?? null,
      reservedAmount: dto.reserved_amount.toString(),
      allocationMethod: dto.allocation_method ?? 'manual',
      allocationConfig: dto.allocation_config ?? null,
    });
  }

  async listByWallet(
    currentUser: AuthenticatedUser,
    walletId: string,
  ): Promise<Reservation[]> {
    await this.walletsService.getById(currentUser, walletId);

    return this.reservationsRepository.ListByWallet(walletId);
  }

  async listByBudget(budgetId: string): Promise<Reservation[]> {
    return this.reservationsRepository.ListByBudget(budgetId);
  }

  async listByGoal(goalId: string): Promise<Reservation[]> {
    return this.reservationsRepository.ListByGoal(goalId);
  }

  async listEncroachmentsByBudget(
    budgetId: string,
  ): Promise<BudgetEncroachment[]> {
    return this.encroachmentsRepository.ListByBudget(budgetId);
  }

  async listEncroachmentsByGoal(goalId: string): Promise<BudgetEncroachment[]> {
    return this.encroachmentsRepository.ListByGoal(goalId);
  }

  async remove(
    currentUser: AuthenticatedUser,
    reservationId: string,
  ): Promise<void> {
    const reservation =
      await this.reservationsRepository.FindById(reservationId);

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    await this.walletsService.getById(currentUser, reservation.walletId);
    await this.reservationsRepository.Delete(reservationId);
  }

  async computeReservedTotal(walletId: string): Promise<number> {
    const reservations =
      await this.reservationsRepository.ListByWallet(walletId);

    return reservations.reduce((sum, r) => sum + Number(r.reservedAmount), 0);
  }

  async computeReservedTotalForWallets(
    walletIds: string[],
  ): Promise<Map<string, number>> {
    const reservations =
      await this.reservationsRepository.ListByWallets(walletIds);
    const totals = new Map<string, number>();

    for (const reservation of reservations) {
      const current = totals.get(reservation.walletId) ?? 0;
      totals.set(
        reservation.walletId,
        current + Number(reservation.reservedAmount),
      );
    }

    return totals;
  }

  async assertEncroachmentTargets(
    walletId: string,
    allocations: EncroachmentAllocation[],
  ): Promise<void> {
    const walletReservations =
      await this.reservationsRepository.ListByWallet(walletId);

    for (const allocation of allocations) {
      if (allocation.amount <= 0) {
        continue;
      }

      this.findReservationForAllocation(walletReservations, allocation);
    }
  }

  async applyEncroachment(
    transactionId: string,
    walletId: string,
    allocations: EncroachmentAllocation[],
  ): Promise<BudgetEncroachment[]> {
    const walletReservations =
      await this.reservationsRepository.ListByWallet(walletId);
    const created: BudgetEncroachment[] = [];

    for (const allocation of allocations) {
      if (allocation.amount <= 0) {
        continue;
      }

      const reservation = this.findReservationForAllocation(
        walletReservations,
        allocation,
      );

      await this.reservationsRepository.UpdateReservedAmount(
        reservation.id,
        Number(reservation.reservedAmount) - allocation.amount,
      );

      const encroachment = await this.encroachmentsRepository.Create({
        transactionId,
        walletId,
        budgetId: reservation.budgetId,
        goalId: reservation.goalId,
        amount: allocation.amount.toString(),
      });

      created.push(encroachment);
    }

    return created;
  }

  private findReservationForAllocation(
    walletReservations: Reservation[],
    allocation: EncroachmentAllocation,
  ): Reservation {
    const reservation = walletReservations.find(
      (r) =>
        (allocation.budget_id && r.budgetId === allocation.budget_id) ||
        (allocation.goal_id && r.goalId === allocation.goal_id),
    );

    if (!reservation) {
      throw new BadRequestException(
        `No reservation found in this wallet for ${allocation.budget_id ? `budget ${allocation.budget_id}` : `goal ${allocation.goal_id}`}`,
      );
    }

    return reservation;
  }

  private assertWithinTarget(
    existing: Reservation[],
    amount: number,
    target: number,
    label: 'budget' | 'goal',
  ): void {
    const reserved = existing.reduce(
      (sum, r) => sum + Number(r.reservedAmount),
      0,
    );

    if (reserved + amount > target) {
      throw new BadRequestException(
        `Total reservations (${reserved + amount}) cannot exceed the ${label} target (${target})`,
      );
    }
  }

  private assertCanTarget(
    currentUser: AuthenticatedUser,
    owner: ReservationTargetOwner | undefined,
    label: 'Budget' | 'Goal',
  ): void {
    if (!owner) {
      throw new NotFoundException(`${label} not found`);
    }

    const isOwner = owner.ownerUserId === currentUser.userId;
    const isHousehold =
      owner.ownerHouseholdId !== null &&
      owner.ownerHouseholdId === currentUser.householdId;

    if (!isOwner && !isHousehold) {
      throw new ForbiddenException(
        `You do not have access to this ${label.toLowerCase()}`,
      );
    }
  }
}
