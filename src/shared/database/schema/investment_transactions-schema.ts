import {
  pgTable,
  uuid,
  numeric,
  date,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { investments } from './investments-schema';
import { wallets } from './wallets-schema';
import {
  investmentTransactionTypeEnum,
  investmentTransactionStatusEnum,
} from './enums-schema';

export const investmentTransactions = pgTable('investment_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  investmentId: uuid('investment_id')
    .notNull()
    .references(() => investments.id, { onDelete: 'cascade' }),
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'restrict' }),
  type: investmentTransactionTypeEnum('type').notNull(),
  quantity: numeric('quantity', { precision: 18, scale: 8 }).notNull(),
  price: numeric('price', { precision: 15, scale: 2 }).notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  status: investmentTransactionStatusEnum('status').notNull().default('active'),
  correctionOfId: uuid('correction_of_id').references(
    (): AnyPgColumn => investmentTransactions.id,
    { onDelete: 'set null' },
  ),
});

export type InvestmentTransaction = typeof investmentTransactions.$inferSelect;
export type NewInvestmentTransaction =
  typeof investmentTransactions.$inferInsert;
