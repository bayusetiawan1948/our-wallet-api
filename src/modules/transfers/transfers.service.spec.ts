import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { Transfer, Wallet } from '../../shared/database/schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { HouseholdsService } from '../households/households.service';
import { WalletsService } from '../wallets/wallets.service';
import { TransfersRepository } from './transfers.repository';
import { TransfersService } from './transfers.service';

describe('TransfersService', () => {
  let service: TransfersService;
  let repository: jest.Mocked<TransfersRepository>;
  let walletsService: jest.Mocked<WalletsService>;
  let householdsService: jest.Mocked<HouseholdsService>;

  const admin: AuthenticatedUser = {
    userId: 'user-1',
    email: 'bayu@example.com',
    fullName: 'Bayu',
    householdId: 'household-1',
    role: 'admin',
    sessionId: 'session-1',
    deviceId: 'device-1',
  };

  const fromWallet = {
    id: 'wallet-1',
    ownerUserId: 'user-1',
    ownerHouseholdId: null,
    name: 'BCA',
    type: 'bank' as const,
    currency: 'IDR',
    balance: 100000,
  };

  const toWallet: Wallet = {
    id: 'wallet-2',
    ownerUserId: null,
    ownerHouseholdId: 'household-1',
    name: 'Kantong Bersama',
    type: 'cash',
    currency: 'IDR',
  };

  const transfer: Transfer = {
    id: 'transfer-1',
    fromWalletId: 'wallet-1',
    toWalletId: 'wallet-2',
    amount: '50000',
    fee: '0',
    date: '2026-01-01',
    status: 'active',
    correctionOfId: null,
  };

  beforeEach(async () => {
    const repositoryMock: Partial<jest.Mocked<TransfersRepository>> = {
      CreateTransfer: jest.fn(),
      FindById: jest.fn(),
      FindByWalletIds: jest.fn(),
      UpdateStatus: jest.fn(),
      FindWalletById: jest.fn(),
      IsWalletInHousehold: jest.fn(),
    };
    const walletsServiceMock: Partial<jest.Mocked<WalletsService>> = {
      getById: jest.fn(),
      listAccessible: jest.fn(),
    };
    const householdsServiceMock: Partial<jest.Mocked<HouseholdsService>> = {
      FindMembershipByUserId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransfersService,
        { provide: TransfersRepository, useValue: repositoryMock },
        { provide: WalletsService, useValue: walletsServiceMock },
        { provide: HouseholdsService, useValue: householdsServiceMock },
        { provide: AuditLogsService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get(TransfersService);
    repository = module.get(TransfersRepository);
    walletsService = module.get(WalletsService);
    householdsService = module.get(HouseholdsService);
  });

  describe('create', () => {
    it('throws BadRequestException when source and destination are the same', async () => {
      await expect(
        service.create(admin, {
          from_wallet_id: 'wallet-1',
          to_wallet_id: 'wallet-1',
          amount: 1000,
          date: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when destination wallet does not exist', async () => {
      walletsService.getById.mockResolvedValue(fromWallet);
      repository.FindWalletById.mockResolvedValue(undefined);

      await expect(
        service.create(admin, {
          from_wallet_id: 'wallet-1',
          to_wallet_id: 'missing',
          amount: 1000,
          date: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when destination wallet is outside the household', async () => {
      walletsService.getById.mockResolvedValue(fromWallet);
      repository.FindWalletById.mockResolvedValue({
        ...toWallet,
        ownerHouseholdId: 'other-household',
        ownerUserId: 'stranger',
      });
      householdsService.FindMembershipByUserId.mockResolvedValue(undefined);

      await expect(
        service.create(admin, {
          from_wallet_id: 'wallet-1',
          to_wallet_id: 'wallet-2',
          amount: 1000,
          date: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ConflictException when balance is insufficient including fee', async () => {
      walletsService.getById.mockResolvedValue(fromWallet);
      repository.FindWalletById.mockResolvedValue(toWallet);

      await expect(
        service.create(admin, {
          from_wallet_id: 'wallet-1',
          to_wallet_id: 'wallet-2',
          amount: 99999,
          fee: 5000,
          date: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a transfer', async () => {
      walletsService.getById.mockResolvedValue(fromWallet);
      repository.FindWalletById.mockResolvedValue(toWallet);
      repository.CreateTransfer.mockResolvedValue(transfer);

      const result = await service.create(admin, {
        from_wallet_id: 'wallet-1',
        to_wallet_id: 'wallet-2',
        amount: 50000,
        date: '2026-01-01',
      });

      expect(repository.CreateTransfer).toHaveBeenCalledWith({
        fromWalletId: 'wallet-1',
        toWalletId: 'wallet-2',
        amount: '50000',
        fee: '0',
        date: '2026-01-01',
        status: 'active',
      });
      expect(result).toEqual(transfer);
    });
  });

  describe('void', () => {
    it('throws ConflictException when already void', async () => {
      repository.FindById.mockResolvedValue({ ...transfer, status: 'void' });
      walletsService.getById.mockResolvedValue(fromWallet);

      await expect(service.void(admin, transfer.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('voids an active transfer', async () => {
      repository.FindById.mockResolvedValue(transfer);
      walletsService.getById.mockResolvedValue(fromWallet);
      repository.UpdateStatus.mockResolvedValue({
        ...transfer,
        status: 'void',
      });

      const result = await service.void(admin, transfer.id);

      expect(repository.UpdateStatus).toHaveBeenCalledWith(transfer.id, 'void');
      expect(result.status).toBe('void');
    });
  });
});
