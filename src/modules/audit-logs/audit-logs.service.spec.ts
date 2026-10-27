import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { AuditLog } from '../../shared/database/schema';
import { HouseholdsService } from '../households/households.service';
import { AuditLogsRepository } from './audit-logs.repository';
import { AuditLogsService } from './audit-logs.service';

describe('AuditLogsService', () => {
  let service: AuditLogsService;
  let repository: jest.Mocked<AuditLogsRepository>;
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

  const member: AuthenticatedUser = {
    ...admin,
    userId: 'user-2',
    role: 'member',
  };

  const log: AuditLog = {
    id: 'log-1',
    actorId: 'user-1',
    entityType: 'WALLETS',
    entityId: 'wallet-1',
    action: 'CREATE_WALLET',
    beforeData: null,
    afterData: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const repositoryMock: Partial<jest.Mocked<AuditLogsRepository>> = {
      Create: jest.fn(),
      ListByActorIds: jest.fn(),
      ListByActor: jest.fn(),
    };
    const householdsServiceMock: Partial<jest.Mocked<HouseholdsService>> = {
      ListMembers: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogsService,
        { provide: AuditLogsRepository, useValue: repositoryMock },
        { provide: HouseholdsService, useValue: householdsServiceMock },
      ],
    }).compile();

    service = module.get(AuditLogsService);
    repository = module.get(AuditLogsRepository);
    householdsService = module.get(HouseholdsService);
  });

  describe('log', () => {
    it('writes an audit entry', async () => {
      repository.Create.mockResolvedValue(log);

      await service.log('user-1', 'WALLETS', 'wallet-1', 'CREATE_WALLET');

      expect(repository.Create).toHaveBeenCalledWith({
        actorId: 'user-1',
        entityType: 'WALLETS',
        entityId: 'wallet-1',
        action: 'CREATE_WALLET',
        beforeData: null,
        afterData: null,
      });
    });

    it('swallows repository errors instead of throwing', async () => {
      repository.Create.mockRejectedValue(new Error('db down'));

      await expect(
        service.log('user-1', 'WALLETS', 'wallet-1', 'CREATE_WALLET'),
      ).resolves.toBeUndefined();
    });
  });

  describe('listForHousehold', () => {
    it('throws ForbiddenException for non-admin users', async () => {
      await expect(service.listForHousehold(member)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('lists logs for all household members', async () => {
      householdsService.ListMembers.mockResolvedValue([
        {
          userId: 'user-1',
          householdId: 'household-1',
          role: 'admin',
          canEditOthersTransactions: true,
          user: {
            id: 'user-1',
            name: 'Bayu',
            email: 'a@a.com',
            baseCurrency: 'IDR',
          },
        },
        {
          userId: 'user-2',
          householdId: 'household-1',
          role: 'member',
          canEditOthersTransactions: false,
          user: {
            id: 'user-2',
            name: 'Annisa',
            email: 'b@b.com',
            baseCurrency: 'IDR',
          },
        },
      ]);
      repository.ListByActorIds.mockResolvedValue([log]);

      const result = await service.listForHousehold(admin);

      expect(householdsService.ListMembers).toHaveBeenCalledWith(admin);
      expect(repository.ListByActorIds).toHaveBeenCalledWith([
        'user-1',
        'user-2',
      ]);
      expect(result).toEqual([log]);
    });
  });
});
