import { pgTable, uuid, numeric, date, timestamp } from 'drizzle-orm/pg-core';
import { investments } from './investments-schema';
import { investmentValuationSourceEnum } from './enums-schema';

export const investmentValuations = pgTable('investment_valuations', {
  id: uuid('id').primaryKey().defaultRandom(),
  investmentId: uuid('investment_id')
    .notNull()
    .references(() => investments.id, { onDelete: 'cascade' }),
  pricePerUnit: numeric('price_per_unit', {
    precision: 15,
    scale: 2,
  }).notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  source: investmentValuationSourceEnum('source').notNull().default('manual'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type InvestmentValuation = typeof investmentValuations.$inferSelect;
export type NewInvestmentValuation = typeof investmentValuations.$inferInsert;
