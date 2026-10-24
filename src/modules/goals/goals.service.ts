import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import {
  BudgetEncroachment,
  Goal,
  Reservation,
} from '../../shared/database/schema';
import { ReservationsService } from '../reservations/reservations.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { GoalsRepository } from './goals.repository';

export interface GoalProgress {
  goal: Goal;
  total_reserved: number;
  progress_percent: number;
  remaining_amount: number;
  is_completed: boolean;
}

@Injectable()
export class GoalsService {
  constructor(
    private readonly goalsRepository: GoalsRepository,
    private readonly reservationsService: ReservationsService,
  ) {}

  async create(currentUser: AuthenticatedUser, dto: CreateGoalDto): Promise<Goal> {
    if (dto.owner_type === 'household' && currentUser.role !== 'admin') {
      throw new ForbiddenException(
        'Only household admin can create a household-owned goal',
      );
    }

    if (!currentUser.householdId) {
      throw new ForbiddenException('You do not belong to a household yet');
    }

    return this.goalsRepository.Create({
      ownerUserId: dto.owner_type === 'user' ? currentUser.userId : null,
      ownerHouseholdId:
        dto.owner_type === 'household' ? currentUser.householdId : null,
      name: dto.name,
      targetAmount: dto.target_amount.toString(),
      targetDate: dto.target_date ?? null,
      status: 'active',
    });
  }

  async list(currentUser: AuthenticatedUser): Promise<GoalProgress[]> {
    const goals = await this.goalsRepository.FindAccessible(
      currentUser.userId,
      currentUser.householdId,
    );

    return Promise.all(goals.map((goal) => this.computeProgress(goal)));
  }

  async update(
    currentUser: AuthenticatedUser,
    goalId: string,
    dto: UpdateGoalDto,
  ): Promise<GoalProgress> {
    const goal = await this.assertAccess(currentUser, goalId);

    const updated = await this.goalsRepository.Update(goal.id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.target_amount !== undefined
        ? { targetAmount: dto.target_amount.toString() }
        : {}),
      ...(dto.target_date !== undefined ? { targetDate: dto.target_date } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    });

    if (!updated) {
      throw new NotFoundException('Goal not found');
    }

    return this.computeProgress(updated);
  }

  async remove(currentUser: AuthenticatedUser, goalId: string): Promise<void> {
    const goal = await this.assertAccess(currentUser, goalId);

    await this.goalsRepository.Delete(goal.id);
  }

  async listReservations(
    currentUser: AuthenticatedUser,
    goalId: string,
  ): Promise<Reservation[]> {
    const goal = await this.assertAccess(currentUser, goalId);

    return this.reservationsService.listByGoal(goal.id);
  }

  async listEncroachments(
    currentUser: AuthenticatedUser,
    goalId: string,
  ): Promise<BudgetEncroachment[]> {
    const goal = await this.assertAccess(currentUser, goalId);

    return this.reservationsService.listEncroachmentsByGoal(goal.id);
  }

  private async computeProgress(goal: Goal): Promise<GoalProgress> {
    const reservations = await this.reservationsService.listByGoal(goal.id);
    const totalReserved = reservations.reduce(
      (sum, r) => sum + Number(r.reservedAmount),
      0,
    );
    const targetAmount = Number(goal.targetAmount);
    const progressPercent = Math.min(
      100,
      Math.round((totalReserved / (targetAmount || 1)) * 100),
    );

    return {
      goal,
      total_reserved: totalReserved,
      progress_percent: progressPercent,
      remaining_amount: Math.max(0, targetAmount - totalReserved),
      is_completed: totalReserved >= targetAmount || goal.status === 'completed',
    };
  }

  private async assertAccess(
    currentUser: AuthenticatedUser,
    goalId: string,
  ): Promise<Goal> {
    const goal = await this.goalsRepository.FindById(goalId);

    if (!goal) {
      throw new NotFoundException('Goal not found');
    }

    const isOwner = goal.ownerUserId === currentUser.userId;
    const isHousehold =
      goal.ownerHouseholdId !== null &&
      goal.ownerHouseholdId === currentUser.householdId;

    if (!isOwner && !isHousehold) {
      throw new ForbiddenException('You do not have access to this goal');
    }

    return goal;
  }
}
