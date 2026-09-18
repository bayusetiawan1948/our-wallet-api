import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { Reservation } from '../../shared/database/schema';
import { ReservationsService } from '../reservations/reservations.service';
import { BudgetProgress, BudgetsService } from './budgets.service';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';

@Controller('budgets')
export class BudgetsController {
  constructor(
    private readonly budgetsService: BudgetsService,
    private readonly reservationsService: ReservationsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateBudgetDto,
  ) {
    const budget = await this.budgetsService.create(currentUser, dto);

    return { id: budget.id };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentUser() currentUser: AuthenticatedUser) {
    const budgets = await this.budgetsService.list(currentUser);

    return budgets.map((b) => this.toResponse(b));
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBudgetDto,
  ) {
    const progress = await this.budgetsService.update(currentUser, id, dto);

    return this.toResponse(progress);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.budgetsService.remove(currentUser, id);

    return { id };
  }

  @Get(':id/reservations')
  @HttpCode(HttpStatus.OK)
  async listReservations(@Param('id') id: string) {
    const reservations = await this.reservationsService.listByBudget(id);

    return reservations.map((r) => this.toReservationResponse(r));
  }

  @Get(':id/encroachments')
  @HttpCode(HttpStatus.OK)
  async listEncroachments(@Param('id') id: string) {
    const encroachments =
      await this.reservationsService.listEncroachmentsByBudget(id);

    return encroachments.map((e) => ({
      id: e.id,
      transaction_id: e.transactionId,
      wallet_id: e.walletId,
      budget_id: e.budgetId,
      goal_id: e.goalId,
      amount: Number(e.amount),
      created_at: e.createdAt,
    }));
  }

  @Post(':id/close-period')
  @HttpCode(HttpStatus.OK)
  async closePeriod(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const progress = await this.budgetsService.closePeriod(currentUser, id);

    return this.toResponse(progress);
  }

  private toResponse(progress: BudgetProgress) {
    return {
      id: progress.budget.id,
      owner_user_id: progress.budget.ownerUserId,
      owner_household_id: progress.budget.ownerHouseholdId,
      category_id: progress.budget.categoryId,
      name: progress.budget.name,
      target_amount: Number(progress.budget.targetAmount),
      period: progress.budget.period,
      start_date: progress.budget.startDate,
      current_period: progress.period
        ? {
            id: progress.period.id,
            period_start: progress.period.periodStart,
            period_end: progress.period.periodEnd,
            carried_deficit: Number(progress.period.carriedDeficit),
          }
        : null,
      carried_deficit: progress.carried_deficit,
      effective_target: progress.effective_target,
      spent_amount: progress.spent_amount,
      total_reserved: progress.total_reserved,
      remaining_budget: progress.remaining_budget,
      deficit_amount: progress.deficit_amount,
      is_overbudget: progress.is_overbudget,
    };
  }

  private toReservationResponse(reservation: Reservation) {
    return {
      id: reservation.id,
      wallet_id: reservation.walletId,
      budget_id: reservation.budgetId,
      goal_id: reservation.goalId,
      reserved_amount: Number(reservation.reservedAmount),
      allocation_method: reservation.allocationMethod,
      allocation_config: reservation.allocationConfig,
    };
  }
}
