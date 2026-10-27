import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { Wallet } from '../../shared/database/schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { HouseholdsService } from '../households/households.service';
import { WalletsRepository } from './wallets.repository';
import { WalletsService } from './wallets.service';

describe('WalletsService', () => {
  let service: WalletsService;
  let repository: jest.Mocked<WalletsRepository>;

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

  const wallet: Wallet = {
    id: 'wallet-1',
    ownerUserId: 'user-1',
    ownerHouseholdId: null,
    name: 'BCA',
    type: 'bank',
    currency: 'IDR',
  };

  beforeEach(async () => {
    const repositoryMock: Partial<jest.Mocked<WalletsRepository>> = {
      CreateWallet: jest.fn(),
      FindById: jest.fn(),
      FindAccessibleWallets: jest.fn(),
      UpdateWallet: jest.fn(),
      DeleteWallet: jest.fn(),
      ComputeBalance: jest.fn(),
      HasAnyMoneyMovement: jest.fn(),
      GrantAccess: jest.fn(),
      RevokeAccess: jest.fn(),
      HasAccess: jest.fn(),
      ListAccessByWallet: jest.fn(),
      CreateReconciliation: jest.fn(),
      ListReconciliationsByWallet: jest.fn(),
      ListSnapshotsByWallet: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletsService,
        { provide: WalletsRepository, useValue: repositoryMock },
        { provide: HouseholdsService, useValue: { ListMembers: jest.fn() } },
        { provide: AuditLogsService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get(WalletsService);
    repository = module.get(WalletsRepository);
  });

  describe('create', () => {
    it('throws ForbiddenException when current user is not admin', async () => {
      await expect(
        service.create(member, {
          owner_type: 'user',
          name: 'BCA',
          type: 'bank',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('creates a personal wallet owned by the current user', async () => {
      repository.CreateWallet.mockResolvedValue(wallet);

      const result = await service.create(admin, {
        owner_type: 'user',
        name: 'BCA',
        type: 'bank',
      });

      expect(repository.CreateWallet).toHaveBeenCalledWith({
        ownerUserId: 'user-1',
        ownerHouseholdId: null,
        name: 'BCA',
        type: 'bank',
        currency: 'IDR',
      });
      expect(result.balance).toBe(0);
    });
  });

  describe('getById / assertCanAccess', () => {
    it('throws NotFoundException when wallet does not exist', async () => {
      repository.FindById.mockResolvedValue(undefined);

      await expect(service.getById(admin, 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when member has no access', async () => {
      repository.FindById.mockResolvedValue(wallet);
      repository.HasAccess.mockResolvedValue(false);

      await expect(service.getById(member, wallet.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns wallet with computed balance for the owner', async () => {
      repository.FindById.mockResolvedValue(wallet);
      repository.ComputeBalance.mockResolvedValue(150000);

      const result = await service.getById(admin, wallet.id);

      expect(result.balance).toBe(150000);
    });
  });

  describe('remove', () => {
    it('throws ConflictException when wallet has money movement history', async () => {
      repository.FindById.mockResolvedValue(wallet);
      repository.HasAnyMoneyMovement.mockResolvedValue(true);

      await expect(service.remove(admin, wallet.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('deletes the wallet when unreferenced', async () => {
      repository.FindById.mockResolvedValue(wallet);
      repository.HasAnyMoneyMovement.mockResolvedValue(false);

      await service.remove(admin, wallet.id);

      expect(repository.DeleteWallet).toHaveBeenCalledWith(wallet.id);
    });
  });

  describe('grantAccess', () => {
    it('throws ConflictException when user already has access', async () => {
      repository.FindById.mockResolvedValue(wallet);
      repository.HasAccess.mockResolvedValue(true);

      await expect(
        service.grantAccess(admin, wallet.id, 'user-2'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
