import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lte, sql, SQL } from 'drizzle-orm';
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

  // Menyimpan batch dalam satu transaksi database. Baris yang import_hash-nya
  // sudah ada di wallet yang sama dilewati tanpa error; hasilnya hanya berisi
  // baris yang benar-benar masuk.
  async BulkCreateTransactions(rows: NewTransaction[]): Promise<Transaction[]> {
    const CHUNK_SIZE = 500;

    return this.db.transaction(async (tx) => {
      const inserted: Transaction[] = [];

      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = await tx
          .insert(transactions)
          .values(rows.slice(i, i + CHUNK_SIZE))
          .onConflictDoNothing({
            target: [transactions.walletId, transactions.importHash],
          })
          .returning();

        inserted.push(...chunk);
      }

      return inserted;
    });
  }

  async FindExistingImportHashes(
    walletId: string,
    hashes: string[],
  ): Promise<Set<string>> {
    if (hashes.length === 0) {
      return new Set();
    }

    const found = await this.db
      .select({ importHash: transactions.importHash })
      .from(transactions)
      .where(
        and(
          eq(transactions.walletId, walletId),
          inArray(transactions.importHash, hashes),
        ),
      );

    return new Set(found.map((row) => row.importHash as string));
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
      clauses.push(
        gte(sql`(${transactions.date} AT TIME ZONE 'Asia/Jakarta')::date`, filter.from),
      );
    }

    if (filter.to) {
      clauses.push(
        lte(sql`(${transactions.date} AT TIME ZONE 'Asia/Jakarta')::date`, filter.to),
      );
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
