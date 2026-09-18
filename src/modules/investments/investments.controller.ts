import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import {
  Investment,
  InvestmentTransaction,
  InvestmentValuation,
} from '../../shared/database/schema';
import { CreateInvestmentTransactionDto } from './dto/create-investment-transaction.dto';
import { CreateInvestmentValuationDto } from './dto/create-investment-valuation.dto';
import { CreateInvestmentDto } from './dto/create-investment.dto';
import {
  InvestmentsService,
  InvestmentWithValuation,
} from './investments.service';

@Controller('investments')
export class InvestmentsController {
  constructor(private readonly investmentsService: InvestmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateInvestmentDto,
  ) {
    const investment = await this.investmentsService.create(currentUser, dto);

    return this.toResponse({
      ...investment,
      latest_price_per_unit: null,
      quantity_held: 0,
    });
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentUser() currentUser: AuthenticatedUser) {
    const investments = await this.investmentsService.list(currentUser);

    return investments.map((investment) => this.toResponse(investment));
  }

  @Post(':id/transactions')
  @HttpCode(HttpStatus.CREATED)
  async addTransaction(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateInvestmentTransactionDto,
  ) {
    const transaction = await this.investmentsService.addTransaction(
      currentUser,
      id,
      dto.wallet_id,
      dto.type,
      dto.quantity,
      dto.price,
      dto.date,
    );

    return this.toTransactionResponse(transaction);
  }

  @Get(':id/transactions')
  @HttpCode(HttpStatus.OK)
  async listTransactions(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const transactions = await this.investmentsService.listTransactions(
      currentUser,
      id,
    );

    return transactions.map((tx) => this.toTransactionResponse(tx));
  }

  @Post(':id/valuations')
  @HttpCode(HttpStatus.CREATED)
  async addValuation(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateInvestmentValuationDto,
  ) {
    const valuation = await this.investmentsService.addValuation(
      currentUser,
      id,
      dto.price_per_unit,
    );

    return this.toValuationResponse(valuation);
  }

  @Get(':id/valuations')
  @HttpCode(HttpStatus.OK)
  async listValuations(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const valuations = await this.investmentsService.listValuations(
      currentUser,
      id,
    );

    return valuations.map((v) => this.toValuationResponse(v));
  }

  private toResponse(investment: Investment & InvestmentWithValuation) {
    return {
      id: investment.id,
      owner_user_id: investment.ownerUserId,
      owner_household_id: investment.ownerHouseholdId,
      asset_type: investment.assetType,
      asset_name: investment.assetName,
      unit: investment.unit,
      latest_price_per_unit: investment.latest_price_per_unit,
      quantity_held: investment.quantity_held,
    };
  }

  private toTransactionResponse(tx: InvestmentTransaction) {
    return {
      id: tx.id,
      investment_id: tx.investmentId,
      wallet_id: tx.walletId,
      type: tx.type,
      quantity: Number(tx.quantity),
      price: Number(tx.price),
      date: tx.date,
      status: tx.status,
      correction_of_id: tx.correctionOfId,
    };
  }

  private toValuationResponse(v: InvestmentValuation) {
    return {
      id: v.id,
      investment_id: v.investmentId,
      price_per_unit: Number(v.pricePerUnit),
      date: v.date,
      source: v.source,
    };
  }
}
