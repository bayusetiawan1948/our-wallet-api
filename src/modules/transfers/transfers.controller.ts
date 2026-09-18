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
import { Transfer } from '../../shared/database/schema';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { ListTransfersDto } from './dto/list-transfers.dto';
import { TransfersService } from './transfers.service';

@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateTransferDto,
  ) {
    const transfer = await this.transfersService.create(currentUser, dto);

    return this.toResponse(transfer);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListTransfersDto,
  ) {
    const transfers = await this.transfersService.list(
      currentUser,
      query.wallet_id,
    );

    return transfers.map((transfer) => this.toResponse(transfer));
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  async void(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const transfer = await this.transfersService.void(currentUser, id);

    return this.toResponse(transfer);
  }

  private toResponse(transfer: Transfer) {
    return {
      id: transfer.id,
      from_wallet_id: transfer.fromWalletId,
      to_wallet_id: transfer.toWalletId,
      amount: Number(transfer.amount),
      fee: Number(transfer.fee),
      date: transfer.date,
      status: transfer.status,
      correction_of_id: transfer.correctionOfId,
    };
  }
}
