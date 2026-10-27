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
import { Debt, DebtPayment } from '../../shared/database/schema';
import { CreateDebtPaymentDto } from './dto/create-debt-payment.dto';
import { CreateDebtDto } from './dto/create-debt.dto';
import { UpdateDebtDto } from './dto/update-debt.dto';
import { DebtsService } from './debts.service';

@Controller('debts')
export class DebtsController {
  constructor(private readonly debtsService: DebtsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateDebtDto,
  ) {
    const debt = await this.debtsService.create(currentUser, dto);

    return this.toResponse(debt);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentUser() currentUser: AuthenticatedUser) {
    const debts = await this.debtsService.list(currentUser);

    return debts.map((debt) => this.toResponse(debt));
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDebtDto,
  ) {
    const debt = await this.debtsService.update(currentUser, id, dto);

    return this.toResponse(debt);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.debtsService.remove(currentUser, id);

    return { id };
  }

  @Post(':id/payments')
  @HttpCode(HttpStatus.CREATED)
  async addPayment(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateDebtPaymentDto,
  ) {
    const payment = await this.debtsService.addPayment(
      currentUser,
      id,
      dto.wallet_id,
      dto.amount,
      dto.date,
    );

    return this.toPaymentResponse(payment);
  }

  @Get(':id/payments')
  @HttpCode(HttpStatus.OK)
  async listPayments(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const payments = await this.debtsService.listPayments(currentUser, id);

    return payments.map((payment) => this.toPaymentResponse(payment));
  }

  @Post(':id/payments/:paymentId/void')
  @HttpCode(HttpStatus.OK)
  async voidPayment(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
  ) {
    const payment = await this.debtsService.voidPayment(
      currentUser,
      id,
      paymentId,
    );

    return this.toPaymentResponse(payment);
  }

  private toResponse(debt: Debt) {
    return {
      id: debt.id,
      owner_user_id: debt.ownerUserId,
      owner_household_id: debt.ownerHouseholdId,
      wallet_id: debt.walletId,
      is_opening: debt.walletId === null,
      opening_paid: Number(debt.openingPaid),
      type: debt.type,
      counterparty: debt.counterparty,
      principal: Number(debt.principal),
      portion_admin: Number(debt.portionAdmin),
      portion_member: Number(debt.portionMember),
      due_date: debt.dueDate,
      status: debt.status,
      note: debt.note,
    };
  }

  private toPaymentResponse(payment: DebtPayment) {
    return {
      id: payment.id,
      debt_id: payment.debtId,
      wallet_id: payment.walletId,
      amount: Number(payment.amount),
      date: payment.date,
      status: payment.status,
      correction_of_id: payment.correctionOfId,
    };
  }
}
