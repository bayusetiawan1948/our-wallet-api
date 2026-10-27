import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import {
  Investment,
  InvestmentTransaction,
} from '../../shared/database/schema';
import { HouseholdsService } from '../households/households.service';
import { WalletsService } from '../wallets/wallets.service';
import { InvestmentsRepository } from './investments.repository';
import { InvestmentsService } from './investments.service';

describe('InvestmentsService', () => {
  let service: InvestmentsService;
  let repository: jest.Mocked<InvestmentsRepository>;
  let walletsService: jest.Mocked<WalletsService>;

  const admin: AuthenticatedUser = {
    userId: 'user-1',
    email: 'bayu@example.com',
    fullName: 'Bayu',
    householdId: 'household-1',
    role: 'admin',
    sessionId: 'session-1',
    deviceId: 'device-1',
  };

  const member: AuthenticatedUser = {
    ...admin,
    userId: 'user-2',
    role: 'member',
  };

  const investment: Investment = {
    id: 'investment-1',
    ownerUserId: 'user-1',
    ownerHouseholdId: null,
    assetType: 'emas',
    assetName: 'Emas Antam',
    unit: 'gram',
  };

  const wallet = {
    id: 'wallet-1',
    ownerUserId: 'user-1',
    ownerHouseholdId: null,
    name: 'BCA',
    type: 'bank' as const,
    currency: 'IDR',
    balance: 5000000,
  };

  const buyTx: InvestmentTransaction = {
    id: 'itx-1',
    investmentId: investment.id,
    walletId: wallet.id,
    type: 'buy',
    quantity: '10',
    price: '1000000',
    date: '2026-01-01',
    status: 'active',
    correctionOfId: null,
  };

  beforeEach(async () => {
    const repositoryMock: Partial<jest.Mocked<InvestmentsRepository>> = {
      CreateInvestment: jest.fn(),
      FindById: jest.fn(),
      FindAccessible: jest.fn(),
      CreateTransaction: jest.fn(),
      ListTransactionsByInvestment: jest.fn(),
      CreateValuation: jest.fn(),
      FindLatestValuation: jest.fn(),
      ListValuationsByInvestment: jest.fn(),
      HasActiveTransactions: jest.fn(),
      UpdateInvestment: jest.fn(),
      DeleteInvestment: jest.fn(),
      FindTransactionById: jest.fn(),
      UpdateTransactionStatus: jest.fn(),
    };
    const householdsServiceMock: Partial<jest.Mocked<HouseholdsService>> = {
      FindMembershipByUserId: jest.fn(),
    };
    const walletsServiceMock: Partial<jest.Mocked<WalletsService>> = {
      getById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvestmentsService,
        { provide: InvestmentsRepository, useValue: repositoryMock },
        { provide: WalletsService, useValue: walletsServiceMock },
        { provide: HouseholdsService, useValue: householdsServiceMock },
      ],
    }).compile();

    service = module.get(InvestmentsService);
    repository = module.get(InvestmentsRepository);
    walletsService = module.get(WalletsService);
  });

  describe('create', () => {
    it('throws ForbiddenException when member creates a household-owned investment', async () => {
      await expect(
        service.create(member, {
          owner_type: 'household',
          asset_type: 'emas',
          asset_name: 'Emas Antam',
          unit: 'gram',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('creates a personal investment', async () => {
      repository.CreateInvestment.mockResolvedValue(investment);

      const result = await service.create(admin, {
        owner_type: 'user',
        asset_type: 'emas',
        asset_name: 'Emas Antam',
        unit: 'gram',
      });

      expect(result).toEqual(investment);
    });
  });

  describe('addTransaction', () => {
    it('throws ConflictException when buying exceeds wallet balance', async () => {
      repository.FindById.mockResolvedValue(investment);
      walletsService.getById.mockResolvedValue({ ...wallet, balance: 100 });

      await expect(
        service.addTransaction(
          admin,
          investment.id,
          wallet.id,
          'buy',
          10,
          1000000,
          '2026-01-01',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException when selling more than held quantity', async () => {
      repository.FindById.mockResolvedValue(investment);
      walletsService.getById.mockResolvedValue(wallet);
      repository.ListTransactionsByInvestment.mockResolvedValue([buyTx]);

      await expect(
        service.addTransaction(
          admin,
          investment.id,
          wallet.id,
          'sell',
          20,
          1000000,
          '2026-01-01',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('records a buy transaction', async () => {
      repository.FindById.mockResolvedValue(investment);
      walletsService.getById.mockResolvedValue(wallet);
      repository.CreateTransaction.mockResolvedValue(buyTx);

      const result = await service.addTransaction(
        admin,
        investment.id,
        wallet.id,
        'buy',
        3,
        1000000,
        '2026-01-01',
      );

      expect(repository.CreateTransaction).toHaveBeenCalledWith({
        investmentId: investment.id,
        walletId: wallet.id,
        type: 'buy',
        quantity: '3',
        price: '1000000',
        date: '2026-01-01',
        status: 'active',
      });
      expect(result).toEqual(buyTx);
    });

    it('allows selling exactly the held quantity', async () => {
      repository.FindById.mockResolvedValue(investment);
      walletsService.getById.mockResolvedValue(wallet);
      repository.ListTransactionsByInvestment.mockResolvedValue([buyTx]);
      repository.CreateTransaction.mockResolvedValue({
        ...buyTx,
        id: 'itx-2',
        type: 'sell',
      });

      await service.addTransaction(
        admin,
        investment.id,
        wallet.id,
        'sell',
        10,
        1000000,
        '2026-01-02',
      );

      expect(repository.CreateTransaction).toHaveBeenCalled();
    });

    it('records an opening holding without checking or touching any wallet', async () => {
      repository.FindById.mockResolvedValue(investment);
      repository.CreateTransaction.mockResolvedValue({
        ...buyTx,
        type: 'opening',
        walletId: null,
      });

      await service.addTransaction(
        admin,
        investment.id,
        undefined,
        'opening',
        5,
        900000,
        '2025-01-01',
      );

      expect(walletsService.getById).not.toHaveBeenCalled();
      expect(repository.CreateTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'opening', walletId: null }),
      );
    });

    it('throws BadRequestException when buying with a zero price', async () => {
      repository.FindById.mockResolvedValue(investment);

      await expect(
        service.addTransaction(
          admin,
          investment.id,
          wallet.id,
          'buy',
          1,
          0,
          '2026-01-01',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    it('throws ConflictException while the asset still has active transactions', async () => {
      repository.FindById.mockResolvedValue(investment);
      repository.HasActiveTransactions.mockResolvedValue(true);

      await expect(service.remove(admin, investment.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repository.DeleteInvestment).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when a member removes someone else's asset", async () => {
      repository.FindById.mockResolvedValue({
        ...investment,
        ownerUserId: null,
        ownerHouseholdId: 'household-1',
      });

      await expect(
        service.remove(member, investment.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('voidTransaction', () => {
    it('throws ConflictException when later sales depend on the buy being voided', async () => {
      repository.FindById.mockResolvedValue(investment);
      repository.FindTransactionById.mockResolvedValue(buyTx);
      repository.ListTransactionsByInvestment.mockResolvedValue([
        buyTx,
        { ...buyTx, id: 'itx-2', type: 'sell', quantity: '4' },
      ]);

      await expect(
        service.voidTransaction(admin, investment.id, buyTx.id),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.UpdateTransactionStatus).not.toHaveBeenCalled();
    });

    it('voids a buy that nothing depends on', async () => {
      repository.FindById.mockResolvedValue(investment);
      repository.FindTransactionById.mockResolvedValue(buyTx);
      repository.ListTransactionsByInvestment.mockResolvedValue([buyTx]);
      walletsService.getById.mockResolvedValue(wallet);
      repository.UpdateTransactionStatus.mockResolvedValue({
        ...buyTx,
        status: 'void',
      });

      const result = await service.voidTransaction(
        admin,
        investment.id,
        buyTx.id,
      );

      expect(result.status).toBe('void');
    });
  });
});
