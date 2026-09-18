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
    dueDate: date('due_date', { mode: 'string' }),
    status: debtStatusEnum('status').notNull().default('active'),
    note: text('note'),
  },
  (table) => [
    check(
      'debts_owner_check',
      sql`(${table.ownerUserId} IS NOT NULL AND ${table.ownerHouseholdId} IS NULL) OR (${table.ownerUserId} IS NULL AND ${table.ownerHouseholdId} IS NOT NULL)`,
    ),
  ],
);

export type Debt = typeof debts.$inferSelect;
export type NewDebt = typeof debts.$inferInsert;
