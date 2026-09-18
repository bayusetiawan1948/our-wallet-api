import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { Goal, Reservation } from '../../shared/database/schema';
import { ReservationsService } from '../reservations/reservations.service';
import { GoalsRepository } from './goals.repository';
import { GoalsService } from './goals.service';

describe('GoalsService', () => {
  let service: GoalsService;
  let repository: jest.Mocked<GoalsRepository>;
  let reservationsService: jest.Mocked<ReservationsService>;

  const admin: AuthenticatedUser = {
    userId: 'user-1',
    email: 'bayu@example.com',
    fullName: 'Bayu',
    householdId: 'household-1',
    role: 'admin',
    sessionId: 'session-1',
    deviceId: 'device-1',
  };

  const member: AuthenticatedUser = { ...admin, userId: 'user-2', role: 'member' };

  const goal: Goal = {
    id: 'goal-1',
    ownerUserId: null,
    ownerHouseholdId: 'household-1',
    name: 'Dana Nikah',
    targetAmount: '10000000',
    targetDate: '2027-01-01',
    status: 'active',
  };

  beforeEach(async () => {
    const repositoryMock: Partial<jest.Mocked<GoalsRepository>> = {
      Create: jest.fn(),
      FindById: jest.fn(),
      FindAccessible: jest.fn(),
      Update: jest.fn(),
      Delete: jest.fn(),
    };
    const reservationsServiceMock: Partial<jest.Mocked<ReservationsService>> = {
      listByGoal: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoalsService,
        { provide: GoalsRepository, useValue: repositoryMock },
        { provide: ReservationsService, useValue: reservationsServiceMock },
      ],
    }).compile();

    service = module.get(GoalsService);
    repository = module.get(GoalsRepository);
    reservationsService = module.get(ReservationsService);
  });

  describe('create', () => {
    it('throws ForbiddenException when member creates a household-owned goal', async () => {
      await expect(
        service.create(member, {
          owner_type: 'household',
          name: 'Dana Nikah',
          target_amount: 10000000,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('list / progress', () => {
    it('computes progress percent from active reservations', async () => {
      repository.FindAccessible.mockResolvedValue([goal]);
      reservationsService.listByGoal.mockResolvedValue([
        { reservedAmount: '2500000' } as Reservation,
        { reservedAmount: '2500000' } as Reservation,
      ]);

      const [progress] = await service.list(admin);

      expect(progress.total_reserved).toBe(5000000);
      expect(progress.progress_percent).toBe(50);
      expect(progress.is_completed).toBe(false);
    });

    it('marks the goal as completed once reserved amount reaches the target', async () => {
      repository.FindAccessible.mockResolvedValue([goal]);
      reservationsService.listByGoal.mockResolvedValue([
        { reservedAmount: '10000000' } as Reservation,
      ]);

      const [progress] = await service.list(admin);

      expect(progress.is_completed).toBe(true);
      expect(progress.remaining_amount).toBe(0);
    });
  });
});
