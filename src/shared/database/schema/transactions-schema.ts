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
import { debts } from './debts-schema';
import { debtPayments } from './debt_payments-schema';
import { investmentTransactions } from './investment_transactions-schema';
import {
  transactionTypeEnum,
  transactionStatusEnum,
  transactionSourceEnum,
} from './enums-schema';

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
  // Terisi hanya untuk entri yang dihasilkan otomatis oleh utang/piutang atau
  // investasi. Entri ini hanya boleh dibatalkan lewat menu asalnya.
  source: transactionSourceEnum('source'),
  debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'set null' }),
  debtPaymentId: uuid('debt_payment_id').references(() => debtPayments.id, {
    onDelete: 'set null',
  }),
  investmentTransactionId: uuid('investment_transaction_id').references(
    () => investmentTransactions.id,
    { onDelete: 'set null' },
  ),
  correctionOfId: uuid('correction_of_id').references(
    (): AnyPgColumn => transactions.id,
    { onDelete: 'set null' },
  ),
});

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
