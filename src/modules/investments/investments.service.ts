import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import {
  Investment,
  InvestmentTransaction,
  InvestmentValuation,
} from '../../shared/database/schema';
import { HouseholdsService } from '../households/households.service';
import { WalletsService } from '../wallets/wallets.service';
import { CreateInvestmentDto } from './dto/create-investment.dto';
import { UpdateInvestmentDto } from './dto/update-investment.dto';
import { InvestmentsRepository } from './investments.repository';

export type InvestmentTransactionType = 'buy' | 'sell' | 'opening';

export interface InvestmentWithValuation extends Investment {
  latest_price_per_unit: number | null;
  quantity_held: number;
}

@Injectable()
export class InvestmentsService {
  constructor(
    private readonly investmentsRepository: InvestmentsRepository,
    private readonly walletsService: WalletsService,
    private readonly householdsService: HouseholdsService,
  ) {}

  async create(
    currentUser: AuthenticatedUser,
    dto: CreateInvestmentDto,
  ): Promise<Investment> {
    if (dto.owner_type === 'household' && currentUser.role !== 'admin') {
      throw new ForbiddenException(
        'Only household admin can create a household-owned investment',
      );
    }

    if (!currentUser.householdId) {
      throw new ForbiddenException('You do not belong to a household yet');
    }

    if (
      dto.opening_quantity !== undefined &&
      dto.opening_quantity > 0 &&
      dto.opening_price === undefined
    ) {
      throw new BadRequestException(
        'opening_price is required when opening_quantity is provided',
      );
    }

    const investment = await this.investmentsRepository.CreateInvestment({
      ownerUserId: dto.owner_type === 'user' ? currentUser.userId : null,
      ownerHouseholdId:
        dto.owner_type === 'household' ? currentUser.householdId : null,
      assetType: dto.asset_type,
      assetName: dto.asset_name,
      unit: dto.unit,
    });

    if (dto.initial_price && dto.initial_price > 0) {
      await this.investmentsRepository.CreateValuation({
        investmentId: investment.id,
        pricePerUnit: dto.initial_price.toString(),
        date: new Date().toISOString().split('T')[0],
        source: 'manual',
      });
    }

    if (dto.opening_quantity !== undefined && dto.opening_quantity > 0) {
      await this.investmentsRepository.CreateTransaction({
        investmentId: investment.id,
        walletId: null,
        type: 'opening',
        quantity: dto.opening_quantity.toString(),
        price: (dto.opening_price ?? 0).toString(),
        date: dto.opening_date ?? new Date().toISOString().split('T')[0],
        status: 'active',
      });
    }

    return investment;
  }

  async list(
    currentUser: AuthenticatedUser,
  ): Promise<InvestmentWithValuation[]> {
    const investments = await this.investmentsRepository.FindAccessible(
      currentUser.userId,
      currentUser.householdId,
    );

    return Promise.all(
      investments.map(async (investment) => {
        const [valuation, transactions] = await Promise.all([
          this.investmentsRepository.FindLatestValuation(investment.id),
          this.investmentsRepository.ListTransactionsByInvestment(
            investment.id,
          ),
        ]);

        return {
          ...investment,
          latest_price_per_unit: valuation
            ? Number(valuation.pricePerUnit)
            : null,
          quantity_held: this.computeQuantityHeld(transactions),
        };
      }),
    );
  }

  async update(
    currentUser: AuthenticatedUser,
    investmentId: string,
    dto: UpdateInvestmentDto,
  ): Promise<InvestmentWithValuation> {
    const investment = await this.assertAccess(currentUser, investmentId);

    this.assertCanManage(currentUser, investment);

    const patch: Partial<Investment> = {
      ...(dto.asset_name !== undefined ? { assetName: dto.asset_name } : {}),
      ...(dto.asset_type !== undefined ? { assetType: dto.asset_type } : {}),
      ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
    };

    if (dto.owner_type !== undefined) {
      if (currentUser.role !== 'admin') {
        throw new ForbiddenException(
          'Only household admin can change the ownership of an investment',
        );
      }

      if (dto.owner_type === 'user') {
        const ownerUserId = dto.owner_user_id ?? currentUser.userId;

        await this.assertIsHouseholdMember(currentUser, ownerUserId);

        patch.ownerUserId = ownerUserId;
        patch.ownerHouseholdId = null;
      } else {
        patch.ownerUserId = null;
        patch.ownerHouseholdId = currentUser.householdId;
      }
    }

    const updated = await this.investmentsRepository.UpdateInvestment(
      investment.id,
      patch,
    );

    if (!updated) {
      throw new NotFoundException('Investment not found');
    }

    const [valuation, transactions] = await Promise.all([
      this.investmentsRepository.FindLatestValuation(updated.id),
      this.investmentsRepository.ListTransactionsByInvestment(updated.id),
    ]);

    return {
      ...updated,
      latest_price_per_unit: valuation ? Number(valuation.pricePerUnit) : null,
      quantity_held: this.computeQuantityHeld(transactions),
    };
  }

  async remove(
    currentUser: AuthenticatedUser,
    investmentId: string,
  ): Promise<void> {
    const investment = await this.assertAccess(currentUser, investmentId);

    this.assertCanManage(currentUser, investment);

    const hasActiveTransactions =
      await this.investmentsRepository.HasActiveTransactions(investment.id);

    if (hasActiveTransactions) {
      throw new ConflictException(
        'Investment still has active transactions, void them first',
      );
    }

    await this.investmentsRepository.DeleteInvestment(investment.id);
  }

  async addTransaction(
    currentUser: AuthenticatedUser,
    investmentId: string,
    walletId: string | undefined,
    type: InvestmentTransactionType,
    quantity: number,
    price: number,
    date: string,
  ): Promise<InvestmentTransaction> {
    const investment = await this.assertAccess(currentUser, investmentId);

    if (type === 'opening') {
      return this.investmentsRepository.CreateTransaction({
        investmentId: investment.id,
        walletId: null,
        type,
        quantity: quantity.toString(),
        price: price.toString(),
        date,
        status: 'active',
      });
    }

    if (price <= 0) {
      throw new BadRequestException('price must be greater than zero');
    }

    if (!walletId) {
      throw new BadRequestException('wallet_id is required');
    }

    const wallet = await this.walletsService.getById(currentUser, walletId);

    const totalPrice = quantity * price;

    if (type === 'buy' && wallet.balance < totalPrice) {
      throw new ConflictException(
        `Insufficient balance in wallet "${wallet.name}": available ${wallet.balance}, requested ${totalPrice}`,
      );
    }

    if (type === 'sell') {
      const existingTransactions =
        await this.investmentsRepository.ListTransactionsByInvestment(
          investment.id,
        );
      const held = this.computeQuantityHeld(existingTransactions);

      if (held < quantity) {
        throw new ConflictException(
          `Insufficient holding: available ${held}, requested ${quantity}`,
        );
      }
    }

    return this.investmentsRepository.CreateTransaction({
      investmentId: investment.id,
      walletId,
      type,
      quantity: quantity.toString(),
      price: price.toString(),
      date,
      status: 'active',
    });
  }

  async listTransactions(
    currentUser: AuthenticatedUser,
    investmentId: string,
  ): Promise<InvestmentTransaction[]> {
    await this.assertAccess(currentUser, investmentId);

    return this.investmentsRepository.ListTransactionsByInvestment(
      investmentId,
    );
  }

  async voidTransaction(
    currentUser: AuthenticatedUser,
    investmentId: string,
    transactionId: string,
  ): Promise<InvestmentTransaction> {
    const investment = await this.assertAccess(currentUser, investmentId);
    const transaction =
      await this.investmentsRepository.FindTransactionById(transactionId);

    if (!transaction || transaction.investmentId !== investment.id) {
      throw new NotFoundException('Investment transaction not found');
    }

    if (transaction.status === 'void') {
      throw new ConflictException('Investment transaction is already void');
    }

    const transactions =
      await this.investmentsRepository.ListTransactionsByInvestment(
        investment.id,
      );

    if (transaction.type !== 'sell') {
      const heldWithout = this.computeQuantityHeld(
        transactions.filter((tx) => tx.id !== transaction.id),
      );

      if (heldWithout < 0) {
        throw new ConflictException(
          'Cannot void this transaction because later sales would exceed the remaining holding',
        );
      }
    }

    if (transaction.walletId) {
      const wallet = await this.walletsService.getById(
        currentUser,
        transaction.walletId,
      );

      if (transaction.type === 'sell') {
        const proceeds = Number(transaction.quantity) * Number(transaction.price);

        if (wallet.balance < proceeds) {
          throw new ConflictException(
            `Insufficient balance in wallet "${wallet.name}" to reverse this sale: available ${wallet.balance}, required ${proceeds}`,
          );
        }
      }
    }

    const updated = await this.investmentsRepository.UpdateTransactionStatus(
      transaction.id,
      'void',
    );

    if (!updated) {
      throw new NotFoundException('Investment transaction not found');
    }

    return updated;
  }

  async addValuation(
    currentUser: AuthenticatedUser,
    investmentId: string,
    pricePerUnit: number,
  ): Promise<InvestmentValuation> {
    const investment = await this.assertAccess(currentUser, investmentId);

    return this.investmentsRepository.CreateValuation({
      investmentId: investment.id,
      pricePerUnit: pricePerUnit.toString(),
      date: new Date().toISOString().split('T')[0],
      source: 'manual',
    });
  }

  async listValuations(
    currentUser: AuthenticatedUser,
    investmentId: string,
  ): Promise<InvestmentValuation[]> {
    await this.assertAccess(currentUser, investmentId);

    return this.investmentsRepository.ListValuationsByInvestment(
      investmentId,
    );
  }

  private computeQuantityHeld(
    transactions: InvestmentTransaction[],
  ): number {
    return transactions
      .filter((tx) => tx.status === 'active')
      .reduce((sum, tx) => {
        const qty = Number(tx.quantity);
        return tx.type === 'sell' ? sum - qty : sum + qty;
      }, 0);
  }

  private async assertAccess(
    currentUser: AuthenticatedUser,
    investmentId: string,
  ): Promise<Investment> {
    const investment = await this.investmentsRepository.FindById(investmentId);

    if (!investment) {
      throw new NotFoundException('Investment not found');
    }

    const isOwner = investment.ownerUserId === currentUser.userId;
    const isHouseholdInvestment =
      investment.ownerHouseholdId !== null &&
      investment.ownerHouseholdId === currentUser.householdId;

    if (!isOwner && !isHouseholdInvestment) {
      throw new ForbiddenException(
        'You do not have access to this investment',
      );
    }

    return investment;
  }

  private assertCanManage(
    currentUser: AuthenticatedUser,
    investment: Investment,
  ): void {
    const isOwner = investment.ownerUserId === currentUser.userId;

    if (currentUser.role !== 'admin' && !isOwner) {
      throw new ForbiddenException(
        'Only the investment owner or an admin can modify this investment',
      );
    }
  }

  private async assertIsHouseholdMember(
    currentUser: AuthenticatedUser,
    userId: string,
  ): Promise<void> {
    const membership =
      await this.householdsService.FindMembershipByUserId(userId);

    if (!membership || membership.householdId !== currentUser.householdId) {
      throw new BadRequestException('owner_user_id must be a household member');
    }
  }
}
