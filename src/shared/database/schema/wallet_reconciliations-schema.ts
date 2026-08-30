import { pgTable, uuid, numeric, date } from 'drizzle-orm/pg-core';
import { wallets } from './wallets-schema';
import { transactions } from './transactions-schema';

export const walletReconciliations = pgTable('wallet_reconciliations', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'cascade' }),
  recordedBalance: numeric('recorded_balance', {
    precision: 15,
    scale: 2,
  }).notNull(),
  actualBalance: numeric('actual_balance', {
    precision: 15,
    scale: 2,
  }).notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  adjustmentTransactionId: uuid('adjustment_transaction_id').references(
    () => transactions.id,
    { onDelete: 'set null' },
  ),
});

export type WalletReconciliation = typeof walletReconciliations.$inferSelect;
export type NewWalletReconciliation = typeof walletReconciliations.$inferInsert;
