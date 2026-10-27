import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../shared/database/database.provider';
import {
  BudgetEncroachment,
  budgetEncroachments,
  NewBudgetEncroachment,
} from '../../shared/database/schema';

@Injectable()
export class BudgetEncroachmentsRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  async Create(data: NewBudgetEncroachment): Promise<BudgetEncroachment> {
    const [created] = await this.db
      .insert(budgetEncroachments)
      .values(data)
      .returning();

    return created;
  }

  async ListByTransaction(
    transactionId: string,
  ): Promise<BudgetEncroachment[]> {
    return this.db
      .select()
      .from(budgetEncroachments)
      .where(eq(budgetEncroachments.transactionId, transactionId));
  }

  async ListByBudget(budgetId: string): Promise<BudgetEncroachment[]> {
    return this.db
      .select()
      .from(budgetEncroachments)
      .where(eq(budgetEncroachments.budgetId, budgetId));
  }

  async ListByGoal(goalId: string): Promise<BudgetEncroachment[]> {
    return this.db
      .select()
      .from(budgetEncroachments)
      .where(eq(budgetEncroachments.goalId, goalId));
  }
}
