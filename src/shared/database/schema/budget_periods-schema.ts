import { pgTable, uuid, numeric, date } from 'drizzle-orm/pg-core';
import { budgets } from './budgets-schema';
import { budgetPeriodStatusEnum } from './enums-schema';

export const budgetPeriods = pgTable('budget_periods', {
  id: uuid('id').primaryKey().defaultRandom(),
  budgetId: uuid('budget_id')
    .notNull()
    .references(() => budgets.id, { onDelete: 'cascade' }),
  periodStart: date('period_start', { mode: 'string' }).notNull(),
  periodEnd: date('period_end', { mode: 'string' }).notNull(),
  targetAmount: numeric('target_amount', {
    precision: 15,
    scale: 2,
  }).notNull(),
  carriedDeficit: numeric('carried_deficit', {
    precision: 15,
    scale: 2,
  })
    .notNull()
    .default('0'),
  status: budgetPeriodStatusEnum('status').notNull().default('active'),
});

export type BudgetPeriod = typeof budgetPeriods.$inferSelect;
export type NewBudgetPeriod = typeof budgetPeriods.$inferInsert;
