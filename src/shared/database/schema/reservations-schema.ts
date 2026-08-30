import { pgTable, uuid, numeric, jsonb, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { wallets } from './wallets-schema';
import { budgets } from './budgets-schema';
import { goals } from './goals-schema';
import { allocationMethodEnum } from './enums-schema';

export const reservations = pgTable(
  'reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    budgetId: uuid('budget_id').references(() => budgets.id, {
      onDelete: 'cascade',
    }),
    goalId: uuid('goal_id').references(() => goals.id, {
      onDelete: 'cascade',
    }),
    reservedAmount: numeric('reserved_amount', {
      precision: 15,
      scale: 2,
    })
      .notNull()
      .default('0'),
    allocationMethod: allocationMethodEnum('allocation_method')
      .notNull()
      .default('manual'),
    allocationConfig: jsonb('allocation_config'),
  },
  (table) => [
    check(
      'reservations_target_check',
      sql`(${table.budgetId} IS NOT NULL AND ${table.goalId} IS NULL) OR (${table.budgetId} IS NULL AND ${table.goalId} IS NOT NULL)`,
    ),
  ],
);

export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;
