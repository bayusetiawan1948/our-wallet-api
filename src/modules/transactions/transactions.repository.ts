import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lte, SQL } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../shared/database/database.provider';
import {
  categories,
  NewTransaction,
  Transaction,
  transactions,
} from '../../shared/database/schema';

export interface TransactionFilter {
  walletId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class TransactionsRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  async CreateTransaction(data: NewTransaction): Promise<Transaction> {
    const [created] = await this.db
      .insert(transactions)
      .values(data)
      .returning();

    return created;
  }

  async FindById(id: string): Promise<Transaction | undefined> {
    const [found] = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1);

    return found;
  }

  async FindByWalletIds(
    walletIds: string[],
    filter: TransactionFilter,
  ): Promise<Transaction[]> {
    if (walletIds.length === 0) {
      return [];
    }

    const walletCondition = inArray(transactions.walletId, walletIds);

    const clauses: SQL[] = [];

    if (filter.categoryId) {
      clauses.push(eq(transactions.categoryId, filter.categoryId));
    }

    if (filter.from) {
      clauses.push(gte(transactions.date, filter.from));
    }

    if (filter.to) {
      clauses.push(lte(transactions.date, filter.to));
    }

    return this.db
      .select()
      .from(transactions)
      .where(and(walletCondition, ...clauses));
  }

  async UpdateStatus(
    id: string,
    status: 'active' | 'void',
  ): Promise<Transaction | undefined> {
    const [updated] = await this.db
      .update(transactions)
      .set({ status })
      .where(eq(transactions.id, id))
      .returning();

    return updated;
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
}
