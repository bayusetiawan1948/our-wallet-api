import {
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
import { WalletsService } from '../wallets/wallets.service';
import { CreateInvestmentDto } from './dto/create-investment.dto';
import { InvestmentsRepository } from './investments.repository';

export interface InvestmentWithValuation extends Investment {
  latest_price_per_unit: number | null;
  quantity_held: number;
}

@Injectable()
export class InvestmentsService {
  constructor(
    private readonly investmentsRepository: InvestmentsRepository,
    private readonly walletsService: WalletsService,
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

  async addTransaction(
    currentUser: AuthenticatedUser,
    investmentId: string,
    walletId: string,
    type: 'buy' | 'sell',
    quantity: number,
    price: number,
    date: string,
  ): Promise<InvestmentTransaction> {
    const investment = await this.assertAccess(currentUser, investmentId);
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
        return tx.type === 'buy' ? sum + qty : sum - qty;
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
}
