import {
  pgTable,
  uuid,
  numeric,
  date,
  text,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { wallets } from './wallets-schema';
import { categories } from './categories-schema';
import { users } from './users-schema';
import { transactionTypeEnum, transactionStatusEnum } from './enums-schema';

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'restrict' }),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'restrict' }),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  recordedBy: uuid('recorded_by')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  type: transactionTypeEnum('type').notNull(),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  note: text('note'),
  attachmentUrl: varchar('attachment_url', { length: 500 }),
  status: transactionStatusEnum('status').notNull().default('active'),
  correctionOfId: uuid('correction_of_id').references(
    (): AnyPgColumn => transactions.id,
    { onDelete: 'set null' },
  ),
});

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
