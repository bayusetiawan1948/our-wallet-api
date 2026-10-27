import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { Reservation } from '../../shared/database/schema';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ListReservationsDto } from './dto/list-reservations.dto';
import { ReservationsService } from './reservations.service';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateReservationDto,
  ) {
    const reservation = await this.reservationsService.create(currentUser, dto);

    return this.toResponse(reservation);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListReservationsDto,
  ) {
    const reservations = await this.reservationsService.listByWallet(
      currentUser,
      query.wallet_id,
    );

    return reservations.map((r) => this.toResponse(r));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.reservationsService.remove(currentUser, id);

    return { id };
  }

  private toResponse(reservation: Reservation) {
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
