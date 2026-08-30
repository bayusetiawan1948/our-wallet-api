import {
  pgTable,
  uuid,
  varchar,
  numeric,
  date,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users-schema';
import { households } from './households-schema';
import { goalStatusEnum } from './enums-schema';

export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
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
    targetDate: date('target_date', { mode: 'string' }),
    status: goalStatusEnum('status').notNull().default('active'),
  },
  (table) => [
    check(
      'goals_owner_check',
      sql`(${table.ownerUserId} IS NOT NULL AND ${table.ownerHouseholdId} IS NULL) OR (${table.ownerUserId} IS NULL AND ${table.ownerHouseholdId} IS NOT NULL)`,
    ),
  ],
);

export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
