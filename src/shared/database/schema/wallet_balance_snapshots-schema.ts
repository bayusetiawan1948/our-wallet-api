import { pgTable, uuid, numeric, date } from 'drizzle-orm/pg-core';
import { wallets } from './wallets-schema';

export const walletBalanceSnapshots = pgTable('wallet_balance_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'cascade' }),
  balance: numeric('balance', { precision: 15, scale: 2 }).notNull(),
  snapshotDate: date('snapshot_date', { mode: 'string' }).notNull(),
});

export type WalletBalanceSnapshot = typeof walletBalanceSnapshots.$inferSelect;
export type NewWalletBalanceSnapshot =
  typeof walletBalanceSnapshots.$inferInsert;
