import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../shared/database/database.provider';
import {
  Budget,
  budgetPeriods,
  categories,
  BudgetPeriod,
  budgets,
  NewBudget,
  NewBudgetPeriod,
  transactions,
} from '../../shared/database/schema';

@Injectable()
export class BudgetsRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  async Create(data: NewBudget): Promise<Budget> {
    const [created] = await this.db.insert(budgets).values(data).returning();

    return created;
  }

  async FindCategoryHouseholdId(
    categoryId: string,
  ): Promise<string | undefined> {
    const [found] = await this.db
      .select({ householdId: categories.householdId })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);

    return found?.householdId;
  }

  async FindById(id: string): Promise<Budget | undefined> {
    const [found] = await this.db
      .select()
      .from(budgets)
      .where(eq(budgets.id, id))
      .limit(1);

    return found;
  }

  async FindAccessible(
    userId: string,
    householdId: string | null,
  ): Promise<Budget[]> {
    const conditions = [eq(budgets.ownerUserId, userId)];

    if (householdId) {
      conditions.push(eq(budgets.ownerHouseholdId, householdId));
    }

    return this.db
      .select()
      .from(budgets)
      .where(or(...conditions));
  }

  async Update(
    id: string,
    data: Partial<NewBudget>,
  ): Promise<Budget | undefined> {
    const [updated] = await this.db
      .update(budgets)
      .set(data)
      .where(eq(budgets.id, id))
      .returning();

    return updated;
  }

  async Delete(id: string): Promise<void> {
    await this.db.delete(budgets).where(eq(budgets.id, id));
  }

  async CreatePeriod(data: NewBudgetPeriod): Promise<BudgetPeriod> {
    const [created] = await this.db
      .insert(budgetPeriods)
      .values(data)
      .returning();

    return created;
  }

  async FindActivePeriod(budgetId: string): Promise<BudgetPeriod | undefined> {
    const [found] = await this.db
      .select()
      .from(budgetPeriods)
      .where(
        and(
          eq(budgetPeriods.budgetId, budgetId),
          eq(budgetPeriods.status, 'active'),
        ),
      )
      .limit(1);

    return found;
  }

  async ListPeriods(budgetId: string): Promise<BudgetPeriod[]> {
    return this.db
      .select()
      .from(budgetPeriods)
      .where(eq(budgetPeriods.budgetId, budgetId));
  }

  async CloseActivePeriod(periodId: string): Promise<void> {
    await this.db
      .update(budgetPeriods)
      .set({ status: 'closed' })
      .where(eq(budgetPeriods.id, periodId));
  }

  async SumExpenseByCategoryInRange(
    categoryId: string,
    from: string,
    to: string,
  ): Promise<number> {
    const [row] = await this.db
      .select({
        total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.categoryId, categoryId),
          eq(transactions.type, 'expense'),
          eq(transactions.status, 'active'),
          // Pergerakan dana utang/piutang bukan pengeluaran anggaran.
          isNull(transactions.source),
          gte(transactions.date, from),
          lte(transactions.date, to),
        ),
      );

    return Number(row?.total ?? 0);
  }
}
