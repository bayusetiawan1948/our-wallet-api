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
import { Public, Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { CreateReconciliationDto } from './dto/create-reconciliation.dto.js';
import { CreateWalletDto } from './dto/create-wallet.dto.js';
import { GrantAccessDto } from './dto/grant-access.dto.js';
import { UpdateWalletDto } from './dto/update-wallet.dto.js';
import { WalletsService, WalletWithBalance } from './wallets.service.js';

@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Public()
  @Get('health')
  @HttpCode(HttpStatus.OK)
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Post()
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateWalletDto,
  ) {
    const wallet = await this.walletsService.create(currentUser, dto);

    return this.toResponse(wallet);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentUser() currentUser: AuthenticatedUser) {
    const wallets = await this.walletsService.listAccessible(currentUser);

    return wallets.map((wallet) => this.toResponse(wallet));
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getById(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const wallet = await this.walletsService.getById(currentUser, id);

    return this.toResponse(wallet);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWalletDto,
  ) {
    const wallet = await this.walletsService.update(currentUser, id, {
      name: dto.name,
      type: dto.type,
      ownerType: dto.owner_type,
      ownerUserId: dto.owner_user_id,
    });

    return this.toResponse(wallet);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.walletsService.remove(currentUser, id);

    return { id };
  }

  @Post(':id/access')
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async grantAccess(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GrantAccessDto,
  ) {
    await this.walletsService.grantAccess(currentUser, id, dto.user_id);

    return { wallet_id: id, user_id: dto.user_id };
  }

  @Delete(':id/access/:userId')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async revokeAccess(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    await this.walletsService.revokeAccess(currentUser, id, userId);

    return { wallet_id: id, user_id: userId };
  }

  @Post(':id/reconciliations')
  @HttpCode(HttpStatus.CREATED)
  async createReconciliation(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateReconciliationDto,
  ) {
    const reconciliation = await this.walletsService.createReconciliation(
      currentUser,
      id,
      dto.actual_balance,
    );

    return {
      id: reconciliation.id,
      wallet_id: reconciliation.walletId,
      recorded_balance: Number(reconciliation.recordedBalance),
      actual_balance: Number(reconciliation.actualBalance),
      date: reconciliation.date,
      adjustment_transaction_id: reconciliation.adjustmentTransactionId,
    };
  }

  @Get(':id/reconciliations')
  @HttpCode(HttpStatus.OK)
  async listReconciliations(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const reconciliations = await this.walletsService.listReconciliations(
      currentUser,
      id,
    );

    return reconciliations.map((reconciliation) => ({
      id: reconciliation.id,
      wallet_id: reconciliation.walletId,
      recorded_balance: Number(reconciliation.recordedBalance),
      actual_balance: Number(reconciliation.actualBalance),
      date: reconciliation.date,
      adjustment_transaction_id: reconciliation.adjustmentTransactionId,
    }));
  }

  @Get(':id/snapshots')
  @HttpCode(HttpStatus.OK)
  async listSnapshots(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const snapshots = await this.walletsService.listSnapshots(currentUser, id);

    return snapshots.map((snapshot) => ({
      id: snapshot.id,
      wallet_id: snapshot.walletId,
      balance: Number(snapshot.balance),
      snapshot_date: snapshot.snapshotDate,
    }));
  }

  private toResponse(wallet: WalletWithBalance) {
    return {
      id: wallet.id,
      owner_user_id: wallet.ownerUserId,
      owner_household_id: wallet.ownerHouseholdId,
      name: wallet.name,
      type: wallet.type,
      currency: wallet.currency,
      balance: wallet.balance,
    };
  }
}
