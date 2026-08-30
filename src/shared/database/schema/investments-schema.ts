import { pgTable, uuid, varchar, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users-schema';
import { households } from './households-schema';
import { investmentAssetTypeEnum } from './enums-schema';

export const investments = pgTable(
  'investments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ownerHouseholdId: uuid('owner_household_id').references(
      () => households.id,
      { onDelete: 'cascade' },
    ),
    assetType: investmentAssetTypeEnum('asset_type').notNull(),
    assetName: varchar('asset_name', { length: 255 }).notNull(),
    unit: varchar('unit', { length: 50 }).notNull(),
  },
  (table) => [
    check(
      'investments_owner_check',
      sql`(${table.ownerUserId} IS NOT NULL AND ${table.ownerHouseholdId} IS NULL) OR (${table.ownerUserId} IS NULL AND ${table.ownerHouseholdId} IS NOT NULL)`,
    ),
  ],
);

export type Investment = typeof investments.$inferSelect;
export type NewInvestment = typeof investments.$inferInsert;
