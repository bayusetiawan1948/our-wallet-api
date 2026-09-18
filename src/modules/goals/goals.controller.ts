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
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { GoalProgress, GoalsService } from './goals.service';

@Controller('goals')
export class GoalsController {
  constructor(
    private readonly goalsService: GoalsService,
    private readonly reservationsService: ReservationsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateGoalDto,
  ) {
    const goal = await this.goalsService.create(currentUser, dto);

    return { id: goal.id };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentUser() currentUser: AuthenticatedUser) {
    const goals = await this.goalsService.list(currentUser);

    return goals.map((g) => this.toResponse(g));
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateGoalDto,
  ) {
    const progress = await this.goalsService.update(currentUser, id, dto);

    return this.toResponse(progress);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.goalsService.remove(currentUser, id);

    return { id };
  }

  @Get(':id/reservations')
  @HttpCode(HttpStatus.OK)
  async listReservations(@Param('id') id: string) {
    const reservations = await this.reservationsService.listByGoal(id);

    return reservations.map((r) => this.toReservationResponse(r));
  }

  @Get(':id/encroachments')
  @HttpCode(HttpStatus.OK)
  async listEncroachments(@Param('id') id: string) {
    const encroachments =
      await this.reservationsService.listEncroachmentsByGoal(id);

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

  private toResponse(progress: GoalProgress) {
    return {
      id: progress.goal.id,
      owner_user_id: progress.goal.ownerUserId,
      owner_household_id: progress.goal.ownerHouseholdId,
      name: progress.goal.name,
      target_amount: Number(progress.goal.targetAmount),
      target_date: progress.goal.targetDate,
      status: progress.goal.status,
      total_reserved: progress.total_reserved,
      progress_percent: progress.progress_percent,
      remaining_amount: progress.remaining_amount,
      is_completed: progress.is_completed,
    };
  }
}
