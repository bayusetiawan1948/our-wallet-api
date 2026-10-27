import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { Category } from '../../shared/database/schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CategoriesRepository } from './categories.repository';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let repository: jest.Mocked<CategoriesRepository>;

  const currentUser: AuthenticatedUser = {
    userId: 'user-1',
    email: 'bayu@example.com',
    fullName: 'Bayu',
    householdId: 'household-1',
    role: 'admin',
    sessionId: 'session-1',
    deviceId: 'device-1',
  };

  const category: Category = {
    id: 'category-1',
    householdId: 'household-1',
    parentId: null,
    name: 'Makanan',
    type: 'expense',
    icon: 'ForkKnife',
    isSystem: false,
    isHidden: false,
  };

  beforeEach(async () => {
    const repositoryMock: Partial<jest.Mocked<CategoriesRepository>> = {
      CreateCategory: jest.fn(),
      FindByHouseholdId: jest.fn(),
      FindById: jest.fn(),
      UpdateCategory: jest.fn(),
      DeleteCategory: jest.fn(),
      HasTransactionReferences: jest.fn(),
      HasBudgetReferences: jest.fn(),
      HasChildren: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: CategoriesRepository, useValue: repositoryMock },
        { provide: AuditLogsService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get(CategoriesService);
    repository = module.get(CategoriesRepository);
  });

  describe('CreateCategory', () => {
    it('throws when user has no household', async () => {
      await expect(
        service.CreateCategory(
          { ...currentUser, householdId: null },
          'Makanan',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('creates a category scoped to the current household', async () => {
      repository.CreateCategory.mockResolvedValue(category);

      const result = await service.CreateCategory(
        currentUser,
        'Makanan',
        'expense',
        'ForkKnife',
      );

      expect(repository.CreateCategory).toHaveBeenCalledWith({
        householdId: 'household-1',
        parentId: null,
        name: 'Makanan',
        type: 'expense',
        icon: 'ForkKnife',
        isSystem: false,
        isHidden: false,
      });
      expect(result).toEqual(category);
    });
  });

  describe('DeleteCategory', () => {
    it('throws NotFoundException when category belongs to another household', async () => {
      repository.FindById.mockResolvedValue({
        ...category,
        householdId: 'other-household',
      });

      await expect(
        service.DeleteCategory(currentUser, category.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when category is a system category', async () => {
      repository.FindById.mockResolvedValue({ ...category, isSystem: true });

      await expect(
        service.DeleteCategory(currentUser, category.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ConflictException when category is still referenced', async () => {
      repository.FindById.mockResolvedValue(category);
      repository.HasTransactionReferences.mockResolvedValue(true);
      repository.HasBudgetReferences.mockResolvedValue(false);
      repository.HasChildren.mockResolvedValue(false);

      await expect(
        service.DeleteCategory(currentUser, category.id),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('deletes the category when unreferenced', async () => {
      repository.FindById.mockResolvedValue(category);
      repository.HasTransactionReferences.mockResolvedValue(false);
      repository.HasBudgetReferences.mockResolvedValue(false);
      repository.HasChildren.mockResolvedValue(false);

      await service.DeleteCategory(currentUser, category.id);

      expect(repository.DeleteCategory).toHaveBeenCalledWith(category.id);
    });
  });

  describe('ToggleStatus', () => {
    it('flips is_hidden', async () => {
      repository.FindById.mockResolvedValue(category);
      repository.UpdateCategory.mockResolvedValue({
        ...category,
        isHidden: true,
      });

      const result = await service.ToggleStatus(currentUser, category.id);

      expect(repository.UpdateCategory).toHaveBeenCalledWith(category.id, {
        isHidden: true,
      });
      expect(result.isHidden).toBe(true);
    });
  });
});
