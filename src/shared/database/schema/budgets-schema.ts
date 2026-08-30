import {
  pgTable,
  uuid,
  varchar,
  numeric,
  date,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { categories } from './categories-schema';
import { users } from './users-schema';
import { households } from './households-schema';
import { budgetPeriodEnum } from './enums-schema';

export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ownerHouseholdId: uuid('owner_household_id').references(
      () => households.id,
      { onDelete: 'cascade' },
    ),
    name: varchar('name', { length: 255 }).notNull(),
    targetAmount: numeric('target_amount', {
      precision: 15,
      scale: 2,
    }).notNull(),
    period: budgetPeriodEnum('period').notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
  },
  (table) => [
    check(
      'budgets_owner_check',
      sql`(${table.ownerUserId} IS NOT NULL AND ${table.ownerHouseholdId} IS NULL) OR (${table.ownerUserId} IS NULL AND ${table.ownerHouseholdId} IS NOT NULL)`,
    ),
  ],
);

export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
