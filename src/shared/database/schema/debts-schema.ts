import {
  pgTable,
  uuid,
  varchar,
  numeric,
  date,
  text,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users-schema';
import { households } from './households-schema';
import { wallets } from './wallets-schema';
import { debtTypeEnum, debtStatusEnum } from './enums-schema';

export const debts = pgTable(
  'debts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ownerHouseholdId: uuid('owner_household_id').references(
      () => households.id,
      { onDelete: 'cascade' },
    ),
    // Dompet tempat dana pokok masuk/keluar. Null berarti debt lama (opening)
    // yang sudah ada sebelum memakai aplikasi, sehingga tidak menggerakkan saldo.
    walletId: uuid('wallet_id').references(() => wallets.id, {
      onDelete: 'restrict',
    }),
    type: debtTypeEnum('type').notNull(),
    counterparty: varchar('counterparty', { length: 255 }).notNull(),
    principal: numeric('principal', { precision: 15, scale: 2 }).notNull(),
    portionAdmin: numeric('portion_admin', {
      precision: 15,
      scale: 2,
    })
      .notNull()
      .default('0'),
    portionMember: numeric('portion_member', {
      precision: 15,
      scale: 2,
    })
      .notNull()
      .default('0'),
    // Jumlah yang sudah dibayar sebelum debt dicatat (hanya untuk opening).
    openingPaid: numeric('opening_paid', { precision: 15, scale: 2 })
      .notNull()
      .default('0'),
    dueDate: date('due_date', { mode: 'string' }),
    status: debtStatusEnum('status').notNull().default('active'),
    note: text('note'),
  },
  (table) => [
    check(
      'debts_owner_check',
      sql`(${table.ownerUserId} IS NOT NULL AND ${table.ownerHouseholdId} IS NULL) OR (${table.ownerUserId} IS NULL AND ${table.ownerHouseholdId} IS NOT NULL)`,
    ),
    check(
      'debts_opening_paid_check',
      sql`${table.openingPaid} >= 0 AND ${table.openingPaid} <= ${table.principal} AND (${table.walletId} IS NULL OR ${table.openingPaid} = 0)`,
    ),
  ],
);

export type Debt = typeof debts.$inferSelect;
export type NewDebt = typeof debts.$inferInsert;
