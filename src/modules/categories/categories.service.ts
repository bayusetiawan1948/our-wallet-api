import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { Category } from '../../shared/database/schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CategoriesRepository } from './categories.repository';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly categoriesRepository: CategoriesRepository,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async CreateCategory(
    currentUser: AuthenticatedUser,
    name: string,
    type: 'income' | 'expense' | 'both',
    icon?: string,
    parentId?: string,
  ): Promise<Category> {
    this.assertHasHousehold(currentUser);

    if (parentId) {
      await this.assertCategoryInHousehold(
        parentId,
        currentUser.householdId as string,
      );
    }

    const category = await this.categoriesRepository.CreateCategory({
      householdId: currentUser.householdId as string,
      parentId: parentId ?? null,
      name,
      type,
      icon: icon ?? null,
      isSystem: false,
      isHidden: false,
    });

    await this.auditLogsService.log(
      currentUser.userId,
      'CATEGORIES',
      category.id,
      'CREATE_CATEGORY',
    );

    return category;
  }

  async ListCategories(currentUser: AuthenticatedUser): Promise<Category[]> {
    this.assertHasHousehold(currentUser);

    return this.categoriesRepository.FindByHouseholdId(
      currentUser.householdId as string,
    );
  }

  async UpdateCategory(
    currentUser: AuthenticatedUser,
    categoryId: string,
    data: {
      name?: string;
      type?: 'income' | 'expense' | 'both';
      icon?: string;
      parentId?: string;
      isHidden?: boolean;
    },
  ): Promise<Category> {
    const category = await this.assertCategoryInHousehold(
      categoryId,
      currentUser.householdId as string,
    );

    if (data.parentId) {
      await this.assertCategoryInHousehold(
        data.parentId,
        currentUser.householdId as string,
      );
    }

    const updated = await this.categoriesRepository.UpdateCategory(
      category.id,
      {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.icon !== undefined ? { icon: data.icon } : {}),
        ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
        ...(data.isHidden !== undefined ? { isHidden: data.isHidden } : {}),
      },
    );

    if (!updated) {
      throw new NotFoundException('Category not found');
    }

    return updated;
  }

  async ToggleStatus(
    currentUser: AuthenticatedUser,
    categoryId: string,
  ): Promise<Category> {
    const category = await this.assertCategoryInHousehold(
      categoryId,
      currentUser.householdId as string,
    );

    const updated = await this.categoriesRepository.UpdateCategory(
      category.id,
      { isHidden: !category.isHidden },
    );

    if (!updated) {
      throw new NotFoundException('Category not found');
    }

    return updated;
  }

  async DeleteCategory(
    currentUser: AuthenticatedUser,
    categoryId: string,
  ): Promise<void> {
    const category = await this.assertCategoryInHousehold(
      categoryId,
      currentUser.householdId as string,
    );

    if (category.isSystem) {
      throw new ForbiddenException(
        'System categories cannot be deleted, hide them instead',
      );
    }

    const [hasTransactions, hasBudgets, hasChildren] = await Promise.all([
      this.categoriesRepository.HasTransactionReferences(category.id),
      this.categoriesRepository.HasBudgetReferences(category.id),
      this.categoriesRepository.HasChildren(category.id),
    ]);

    if (hasTransactions || hasBudgets || hasChildren) {
      throw new ConflictException(
        'Category is still in use by transactions, budgets, or sub-categories',
      );
    }

    await this.categoriesRepository.DeleteCategory(category.id);
    await this.auditLogsService.log(
      currentUser.userId,
      'CATEGORIES',
      category.id,
      'DELETE_CATEGORY',
    );
  }

  private async assertCategoryInHousehold(
    categoryId: string,
    householdId: string,
  ): Promise<Category> {
    const category = await this.categoriesRepository.FindById(categoryId);

    if (!category || category.householdId !== householdId) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  private assertHasHousehold(currentUser: AuthenticatedUser): void {
    if (!currentUser.householdId) {
      throw new ForbiddenException('You do not belong to a household yet');
    }
  }
}
