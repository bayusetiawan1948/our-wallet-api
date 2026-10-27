import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import {
  Budget,
  BudgetEncroachment,
  BudgetPeriod,
  Reservation,
} from '../../shared/database/schema';
import { ReservationsService } from '../reservations/reservations.service';
import { BudgetsRepository } from './budgets.repository';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';

export interface BudgetProgress {
  budget: Budget;
  period: BudgetPeriod | undefined;
  carried_deficit: number;
  base_target: number;
  effective_target: number;
  spent_amount: number;
  total_reserved: number;
  remaining_budget: number;
  deficit_amount: number;
  is_overbudget: boolean;
}

const PERIOD_DAYS: Record<'weekly' | 'monthly' | 'yearly', number> = {
  weekly: 7,
  monthly: 30,
  yearly: 365,
};

@Injectable()
export class BudgetsService {
  constructor(
    private readonly budgetsRepository: BudgetsRepository,
    private readonly reservationsService: ReservationsService,
  ) {}

  async create(
    currentUser: AuthenticatedUser,
    dto: CreateBudgetDto,
  ): Promise<Budget> {
    if (dto.owner_type === 'household' && currentUser.role !== 'admin') {
      throw new ForbiddenException(
        'Only household admin can create a household-owned budget',
      );
    }

    if (!currentUser.householdId) {
      throw new ForbiddenException('You do not belong to a household yet');
    }

    await this.assertCategoryInHousehold(currentUser, dto.category_id);

    const startDate = dto.start_date ?? new Date().toISOString().split('T')[0];

    const budget = await this.budgetsRepository.Create({
      ownerUserId: dto.owner_type === 'user' ? currentUser.userId : null,
      ownerHouseholdId:
        dto.owner_type === 'household' ? currentUser.householdId : null,
      categoryId: dto.category_id,
      name: dto.name,
      targetAmount: dto.target_amount.toString(),
      period: dto.period,
      startDate,
    });

    await this.budgetsRepository.CreatePeriod({
      budgetId: budget.id,
      periodStart: startDate,
      periodEnd: this.addDays(startDate, PERIOD_DAYS[dto.period]),
      targetAmount: dto.target_amount.toString(),
      carriedDeficit: '0',
      status: 'active',
    });

    return budget;
  }

  async list(currentUser: AuthenticatedUser): Promise<BudgetProgress[]> {
    const budgets = await this.budgetsRepository.FindAccessible(
      currentUser.userId,
      currentUser.householdId,
    );

    return Promise.all(budgets.map((budget) => this.computeProgress(budget)));
  }

  async update(
    currentUser: AuthenticatedUser,
    budgetId: string,
    dto: UpdateBudgetDto,
  ): Promise<BudgetProgress> {
    const budget = await this.assertAccess(currentUser, budgetId);

    if (dto.category_id !== undefined) {
      await this.assertCategoryInHousehold(currentUser, dto.category_id);
    }

    const updated = await this.budgetsRepository.Update(budget.id, {
      ...(dto.category_id !== undefined ? { categoryId: dto.category_id } : {}),
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.target_amount !== undefined
        ? { targetAmount: dto.target_amount.toString() }
        : {}),
      ...(dto.period !== undefined ? { period: dto.period } : {}),
    });

    if (!updated) {
      throw new NotFoundException('Budget not found');
    }

    return this.computeProgress(updated);
  }

  async remove(
    currentUser: AuthenticatedUser,
    budgetId: string,
  ): Promise<void> {
    const budget = await this.assertAccess(currentUser, budgetId);

    await this.budgetsRepository.Delete(budget.id);
  }

  async listReservations(
    currentUser: AuthenticatedUser,
    budgetId: string,
  ): Promise<Reservation[]> {
    const budget = await this.assertAccess(currentUser, budgetId);

    return this.reservationsService.listByBudget(budget.id);
  }

  async listEncroachments(
    currentUser: AuthenticatedUser,
    budgetId: string,
  ): Promise<BudgetEncroachment[]> {
    const budget = await this.assertAccess(currentUser, budgetId);

    return this.reservationsService.listEncroachmentsByBudget(budget.id);
  }

  async closePeriod(
    currentUser: AuthenticatedUser,
    budgetId: string,
  ): Promise<BudgetProgress> {
    const budget = await this.assertAccess(currentUser, budgetId);
    const progress = await this.computeProgress(budget);

    if (progress.period) {
      await this.budgetsRepository.CloseActivePeriod(progress.period.id);
    }

    const nextStart = progress.period
      ? progress.period.periodEnd
      : new Date().toISOString().split('T')[0];

    await this.budgetsRepository.CreatePeriod({
      budgetId: budget.id,
      periodStart: nextStart,
      periodEnd: this.addDays(nextStart, PERIOD_DAYS[budget.period]),
      targetAmount: budget.targetAmount,
      carriedDeficit: progress.deficit_amount.toString(),
      status: 'active',
    });

    return this.computeProgress(budget);
  }

  private async computeProgress(budget: Budget): Promise<BudgetProgress> {
    const period = await this.budgetsRepository.FindActivePeriod(budget.id);
    const carriedDeficit = period ? Number(period.carriedDeficit) : 0;
    const baseTarget = Number(budget.targetAmount);
    const effectiveTarget = baseTarget + carriedDeficit;

    const spentAmount = period
      ? await this.budgetsRepository.SumExpenseByCategoryInRange(
          budget.categoryId,
          period.periodStart,
          period.periodEnd,
        )
      : 0;

    const reservations = await this.reservationsService.listByBudget(budget.id);
    const totalReserved = reservations.reduce(
      (sum, r) => sum + Number(r.reservedAmount),
      0,
    );

    return {
      budget,
      period,
      carried_deficit: carriedDeficit,
      base_target: baseTarget,
      effective_target: effectiveTarget,
      spent_amount: spentAmount,
      total_reserved: totalReserved,
      remaining_budget: Math.max(0, effectiveTarget - spentAmount),
      deficit_amount: Math.max(0, spentAmount - effectiveTarget),
      is_overbudget: spentAmount > effectiveTarget,
    };
  }

  private async assertCategoryInHousehold(
    currentUser: AuthenticatedUser,
    categoryId: string,
  ): Promise<void> {
    const householdId =
      await this.budgetsRepository.FindCategoryHouseholdId(categoryId);

    if (!householdId || householdId !== currentUser.householdId) {
      throw new BadRequestException('Category not found in your household');
    }
  }

  private async assertAccess(
    currentUser: AuthenticatedUser,
    budgetId: string,
  ): Promise<Budget> {
    const budget = await this.budgetsRepository.FindById(budgetId);

    if (!budget) {
      throw new NotFoundException('Budget not found');
    }

    const isOwner = budget.ownerUserId === currentUser.userId;
    const isHousehold =
      budget.ownerHouseholdId !== null &&
      budget.ownerHouseholdId === currentUser.householdId;

    if (!isOwner && !isHousehold) {
      throw new ForbiddenException('You do not have access to this budget');
    }

    return budget;
  }

  private addDays(date: string, days: number): string {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }
}
