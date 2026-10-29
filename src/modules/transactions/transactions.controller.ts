import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { Transaction } from '../../shared/database/schema';
import {
  BulkCreateTransactionsDto,
  CheckDuplicatesDto,
} from './dto/bulk-create-transactions.dto';
import { CheckEncroachmentDto } from './dto/check-encroachment.dto';
import { CorrectTransactionDto } from './dto/correct-transaction.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateTransactionDto,
  ) {
    const transaction = await this.transactionsService.create(currentUser, dto);

    return this.toResponse(transaction);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.CREATED)
  async bulkCreate(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: BulkCreateTransactionsDto,
  ) {
    return this.transactionsService.bulkCreate(currentUser, dto);
  }

  @Post('check-duplicates')
  @HttpCode(HttpStatus.OK)
  async checkDuplicates(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CheckDuplicatesDto,
  ) {
    const duplicateIndexes = await this.transactionsService.checkDuplicates(
      currentUser,
      dto,
    );

    return { duplicate_indexes: duplicateIndexes };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListTransactionsDto,
  ) {
    const transactions = await this.transactionsService.list(currentUser, {
      walletId: query.wallet_id,
      categoryId: query.category_id,
      from: query.from,
      to: query.to,
    });

    return transactions.map((transaction) => this.toResponse(transaction));
  }

  @Get('encroachment-check')
  @HttpCode(HttpStatus.OK)
  async checkEncroachment(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: CheckEncroachmentDto,
  ) {
    return this.transactionsService.checkEncroachment(
      currentUser,
      query.wallet_id,
      query.amount,
    );
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  async void(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const transaction = await this.transactionsService.void(currentUser, id);

    return this.toResponse(transaction);
  }

  @Post(':id/correct')
  @HttpCode(HttpStatus.CREATED)
  async correct(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CorrectTransactionDto,
  ) {
    const transaction = await this.transactionsService.correct(
      currentUser,
      id,
      dto,
    );

    return this.toResponse(transaction);
  }

  private toResponse(transaction: Transaction) {
    return {
      id: transaction.id,
      wallet_id: transaction.walletId,
      category_id: transaction.categoryId,
      owner_id: transaction.ownerId,
      recorded_by: transaction.recordedBy,
      type: transaction.type,
      amount: Number(transaction.amount),
      date: transaction.date,
      note: transaction.note,
      attachment_url: transaction.attachmentUrl,
      status: transaction.status,
      correction_of_id: transaction.correctionOfId,
      source: transaction.source,
      debt_id: transaction.debtId,
      debt_payment_id: transaction.debtPaymentId,
      investment_transaction_id: transaction.investmentTransactionId,
    };
  }
}
