import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import {
  Wallet,
  WalletAccess,
  WalletBalanceSnapshot,
  WalletReconciliation,
} from '../../shared/database/schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { HouseholdsService } from '../households/households.service';
import { CreateWalletDto } from './dto/create-wallet.dto.js';
import { WalletsRepository } from './wallets.repository';

export interface WalletWithBalance extends Wallet {
  balance: number;
}

@Injectable()
export class WalletsService {
  constructor(
    private readonly walletsRepository: WalletsRepository,
    private readonly householdsService: HouseholdsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(
    currentUser: AuthenticatedUser,
    dto: CreateWalletDto,
  ): Promise<WalletWithBalance> {
    this.assertIsAdmin(currentUser);

    const ownerUserId =
      dto.owner_type === 'user'
        ? (dto.owner_user_id ?? currentUser.userId)
        : null;
    const ownerHouseholdId =
      dto.owner_type === 'household'
        ? (currentUser.householdId as string)
        : null;

    const wallet = await this.walletsRepository.CreateWallet({
      ownerUserId,
      ownerHouseholdId,
      name: dto.name,
      type: dto.type,
      currency: dto.currency ?? 'IDR',
    });

    if (dto.owner_type === 'household') {
      const members = await this.householdsService.ListMembers(currentUser);
      for (const member of members) {
        await this.walletsRepository.GrantAccess({
          walletId: wallet.id,
          userId: member.userId,
          assignedBy: currentUser.userId,
        });
      }
    }

    await this.auditLogsService.log(
      currentUser.userId,
      'WALLETS',
      wallet.id,
      'CREATE_WALLET',
    );

    return { ...wallet, balance: 0 };
  }

  async listAccessible(
    currentUser: AuthenticatedUser,
  ): Promise<WalletWithBalance[]> {
    const wallets = await this.walletsRepository.FindAccessibleWallets(
      currentUser.userId,
      currentUser.householdId,
    );

    return Promise.all(
      wallets.map(async (wallet) => ({
        ...wallet,
        balance: await this.walletsRepository.ComputeBalance(wallet.id),
      })),
    );
  }

  async getById(
    currentUser: AuthenticatedUser,
    walletId: string,
  ): Promise<WalletWithBalance> {
    const wallet = await this.assertCanAccess(currentUser, walletId);

    return {
      ...wallet,
      balance: await this.walletsRepository.ComputeBalance(wallet.id),
    };
  }

  async update(
    currentUser: AuthenticatedUser,
    walletId: string,
    data: {
      name?: string;
      type?: 'bank' | 'ewallet' | 'cash';
      ownerType?: 'user' | 'household';
      ownerUserId?: string;
    },
  ): Promise<WalletWithBalance> {
    const wallet = await this.assertCanAccess(currentUser, walletId);
    const isOwner = wallet.ownerUserId === currentUser.userId;

    if (currentUser.role !== 'admin' && !isOwner) {
      throw new ForbiddenException(
        'Only the wallet owner or an admin can update this wallet',
      );
    }

    const patch: Partial<Wallet> = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
    };

    if (currentUser.role === 'admin' && data.ownerType) {
      patch.ownerUserId =
        data.ownerType === 'user'
          ? (data.ownerUserId ?? currentUser.userId)
          : null;
      patch.ownerHouseholdId =
        data.ownerType === 'household'
          ? (currentUser.householdId as string)
          : null;
    }

    const updated = await this.walletsRepository.UpdateWallet(
      wallet.id,
      patch,
    );

    if (!updated) {
      throw new NotFoundException('Wallet not found');
    }

    return {
      ...updated,
      balance: await this.walletsRepository.ComputeBalance(updated.id),
    };
  }

  async remove(currentUser: AuthenticatedUser, walletId: string): Promise<void> {
    this.assertIsAdmin(currentUser);
    const wallet = await this.assertCanAccess(currentUser, walletId);

    const hasMovement = await this.walletsRepository.HasAnyMoneyMovement(
      wallet.id,
    );

    if (hasMovement) {
      throw new ConflictException(
        'Wallet still has transaction, transfer, debt, investment, or reconciliation history',
      );
    }

    await this.walletsRepository.DeleteWallet(wallet.id);
    await this.auditLogsService.log(
      currentUser.userId,
      'WALLETS',
      wallet.id,
      'DELETE_WALLET',
    );
  }

  async grantAccess(
    currentUser: AuthenticatedUser,
    walletId: string,
    targetUserId: string,
  ): Promise<WalletAccess> {
    this.assertIsAdmin(currentUser);
    await this.assertCanAccess(currentUser, walletId);

    const alreadyHasAccess = await this.walletsRepository.HasAccess(
      walletId,
      targetUserId,
    );

    if (alreadyHasAccess) {
      throw new ConflictException('User already has access to this wallet');
    }

    return this.walletsRepository.GrantAccess({
      walletId,
      userId: targetUserId,
      assignedBy: currentUser.userId,
    });
  }

  async revokeAccess(
    currentUser: AuthenticatedUser,
    walletId: string,
    targetUserId: string,
  ): Promise<void> {
    this.assertIsAdmin(currentUser);
    await this.assertCanAccess(currentUser, walletId);

    await this.walletsRepository.RevokeAccess(walletId, targetUserId);
  }

  async createReconciliation(
    currentUser: AuthenticatedUser,
    walletId: string,
    actualBalance: number,
  ): Promise<WalletReconciliation> {
    const wallet = await this.assertCanAccess(currentUser, walletId);
    const recordedBalance = await this.walletsRepository.ComputeBalance(
      wallet.id,
    );

    return this.walletsRepository.CreateReconciliation({
      walletId: wallet.id,
      recordedBalance: recordedBalance.toString(),
      actualBalance: actualBalance.toString(),
      date: new Date().toISOString().split('T')[0],
    });
  }

  async listReconciliations(
    currentUser: AuthenticatedUser,
    walletId: string,
  ): Promise<WalletReconciliation[]> {
    await this.assertCanAccess(currentUser, walletId);

    return this.walletsRepository.ListReconciliationsByWallet(walletId);
  }

  async listSnapshots(
    currentUser: AuthenticatedUser,
    walletId: string,
  ): Promise<WalletBalanceSnapshot[]> {
    await this.assertCanAccess(currentUser, walletId);

    return this.walletsRepository.ListSnapshotsByWallet(walletId);
  }

  private async assertCanAccess(
    currentUser: AuthenticatedUser,
    walletId: string,
  ): Promise<Wallet> {
    const wallet = await this.walletsRepository.FindById(walletId);

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const isOwner = wallet.ownerUserId === currentUser.userId;
    const isHouseholdWallet =
      wallet.ownerHouseholdId !== null &&
      wallet.ownerHouseholdId === currentUser.householdId;

    if (isOwner || isHouseholdWallet) {
      return wallet;
    }

    const hasAccess = await this.walletsRepository.HasAccess(
      walletId,
      currentUser.userId,
    );

    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this wallet');
    }

    return wallet;
  }

  private assertIsAdmin(currentUser: AuthenticatedUser): void {
    if (!currentUser.householdId) {
      throw new ForbiddenException('You do not belong to a household yet');
    }

    if (currentUser.role !== 'admin') {
      throw new ForbiddenException(
        'Only household admin can perform this action',
      );
    }
  }
}
