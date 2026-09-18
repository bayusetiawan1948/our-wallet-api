import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { Transfer } from '../../shared/database/schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { HouseholdsService } from '../households/households.service';
import { WalletsService } from '../wallets/wallets.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransfersRepository } from './transfers.repository';

@Injectable()
export class TransfersService {
  constructor(
    private readonly transfersRepository: TransfersRepository,
    private readonly walletsService: WalletsService,
    private readonly householdsService: HouseholdsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(
    currentUser: AuthenticatedUser,
    dto: CreateTransferDto,
  ): Promise<Transfer> {
    if (dto.from_wallet_id === dto.to_wallet_id) {
      throw new BadRequestException(
        'from_wallet_id and to_wallet_id must be different',
      );
    }

    const fromWallet = await this.walletsService.getById(
      currentUser,
      dto.from_wallet_id,
    );

    await this.assertWalletInHousehold(currentUser, dto.to_wallet_id);

    const fee = dto.fee ?? 0;
    const totalDeduction = dto.amount + fee;

    if (fromWallet.balance < totalDeduction) {
      throw new ConflictException(
        `Insufficient balance in wallet "${fromWallet.name}": available ${fromWallet.balance}, requested ${totalDeduction}`,
      );
    }

    const transfer = await this.transfersRepository.CreateTransfer({
      fromWalletId: dto.from_wallet_id,
      toWalletId: dto.to_wallet_id,
      amount: dto.amount.toString(),
      fee: fee.toString(),
      date: dto.date,
      status: 'active',
    });

    await this.auditLogsService.log(
      currentUser.userId,
      'TRANSFERS',
      transfer.id,
      'CREATE_TRANSFER',
    );

    return transfer;
  }

  async list(
    currentUser: AuthenticatedUser,
    walletId?: string,
  ): Promise<Transfer[]> {
    let walletIds: string[];

    if (walletId) {
      const wallet = await this.walletsService.getById(currentUser, walletId);
      walletIds = [wallet.id];
    } else {
      const wallets = await this.walletsService.listAccessible(currentUser);
      walletIds = wallets.map((w) => w.id);
    }

    return this.transfersRepository.FindByWalletIds(walletIds);
  }

  async void(
    currentUser: AuthenticatedUser,
    transferId: string,
  ): Promise<Transfer> {
    const transfer = await this.transfersRepository.FindById(transferId);

    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }

    await this.walletsService.getById(currentUser, transfer.fromWalletId);

    if (transfer.status === 'void') {
      throw new ConflictException('Transfer is already void');
    }

    const updated = await this.transfersRepository.UpdateStatus(
      transfer.id,
      'void',
    );

    if (!updated) {
      throw new NotFoundException('Transfer not found');
    }

    await this.auditLogsService.log(
      currentUser.userId,
      'TRANSFERS',
      updated.id,
      'VOID_TRANSFER',
    );

    return updated;
  }

  private async assertWalletInHousehold(
    currentUser: AuthenticatedUser,
    walletId: string,
  ): Promise<void> {
    const wallet = await this.transfersRepository.FindWalletById(walletId);

    if (!wallet) {
      throw new NotFoundException('Destination wallet not found');
    }

    if (wallet.ownerHouseholdId === currentUser.householdId) {
      return;
    }

    if (wallet.ownerUserId) {
      const membership = await this.householdsService.FindMembershipByUserId(
        wallet.ownerUserId,
      );

      if (membership?.householdId === currentUser.householdId) {
        return;
      }
    }

    throw new ForbiddenException(
      'Destination wallet must belong to your household',
    );
  }
}
