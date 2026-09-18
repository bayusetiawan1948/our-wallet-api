import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../shared/database/database.provider';
import {
  budgets,
  Category,
  categories,
  NewCategory,
  transactions,
} from '../../shared/database/schema';

@Injectable()
export class CategoriesRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  async CreateCategory(data: NewCategory): Promise<Category> {
    const [created] = await this.db.insert(categories).values(data).returning();

    return created;
  }

  async FindByHouseholdId(householdId: string): Promise<Category[]> {
    return this.db
      .select()
      .from(categories)
      .where(eq(categories.householdId, householdId));
  }

  async FindById(id: string): Promise<Category | undefined> {
    const [found] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);

    return found;
  }

  async UpdateCategory(
    id: string,
    data: Partial<NewCategory>,
  ): Promise<Category | undefined> {
    const [updated] = await this.db
      .update(categories)
      .set(data)
      .where(eq(categories.id, id))
      .returning();

    return updated;
  }

  async DeleteCategory(id: string): Promise<void> {
    await this.db.delete(categories).where(eq(categories.id, id));
  }

  async HasTransactionReferences(categoryId: string): Promise<boolean> {
    const [found] = await this.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.categoryId, categoryId))
      .limit(1);

    return Boolean(found);
  }

  async HasBudgetReferences(categoryId: string): Promise<boolean> {
    const [found] = await this.db
      .select({ id: budgets.id })
      .from(budgets)
      .where(eq(budgets.categoryId, categoryId))
      .limit(1);

    return Boolean(found);
  }

  async HasChildren(categoryId: string): Promise<boolean> {
    const [found] = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentId, categoryId))
      .limit(1);

    return Boolean(found);
  }
}
