import {
  pgTable,
  uuid,
  numeric,
  date,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { debts } from './debts-schema';
import { wallets } from './wallets-schema';
import { transactionStatusEnum } from './enums-schema';

export const debtPayments = pgTable('debt_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  debtId: uuid('debt_id')
    .notNull()
    .references(() => debts.id, { onDelete: 'cascade' }),
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'restrict' }),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  status: transactionStatusEnum('status').notNull().default('active'),
  correctionOfId: uuid('correction_of_id').references(
    (): AnyPgColumn => debtPayments.id,
    { onDelete: 'set null' },
  ),
});

export type DebtPayment = typeof debtPayments.$inferSelect;
export type NewDebtPayment = typeof debtPayments.$inferInsert;
