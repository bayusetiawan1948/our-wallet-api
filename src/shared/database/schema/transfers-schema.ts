import {
  pgTable,
  uuid,
  numeric,
  date,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { wallets } from './wallets-schema';
import { transactionStatusEnum } from './enums-schema';

export const transfers = pgTable('transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromWalletId: uuid('from_wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'restrict' }),
  toWalletId: uuid('to_wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'restrict' }),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  fee: numeric('fee', { precision: 15, scale: 2 }).notNull().default('0'),
  date: date('date', { mode: 'string' }).notNull(),
  status: transactionStatusEnum('status').notNull().default('active'),
  correctionOfId: uuid('correction_of_id').references(
    (): AnyPgColumn => transfers.id,
    { onDelete: 'set null' },
  ),
});

export type Transfer = typeof transfers.$inferSelect;
export type NewTransfer = typeof transfers.$inferInsert;
