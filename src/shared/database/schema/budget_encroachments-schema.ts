import { pgTable, uuid, numeric, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { transactions } from './transactions-schema';
import { wallets } from './wallets-schema';
import { budgets } from './budgets-schema';
import { goals } from './goals-schema';

export const budgetEncroachments = pgTable(
  'budget_encroachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    budgetId: uuid('budget_id').references(() => budgets.id, {
      onDelete: 'cascade',
    }),
    goalId: uuid('goal_id').references(() => goals.id, {
      onDelete: 'cascade',
    }),
    amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'budget_encroachments_target_check',
      sql`(${table.budgetId} IS NOT NULL AND ${table.goalId} IS NULL) OR (${table.budgetId} IS NULL AND ${table.goalId} IS NOT NULL)`,
    ),
  ],
);

export type BudgetEncroachment = typeof budgetEncroachments.$inferSelect;
export type NewBudgetEncroachment = typeof budgetEncroachments.$inferInsert;
