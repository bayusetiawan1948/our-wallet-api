import { pgTable, uuid, varchar, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users-schema';
import { households } from './households-schema';
import { walletTypeEnum } from './enums-schema';

export const wallets = pgTable(
  'wallets',
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
    type: walletTypeEnum('type').notNull(),
    currency: varchar('currency', { length: 10 }).notNull().default('IDR'),
  },
  (table) => [
    check(
      'wallets_owner_check',
      sql`(${table.ownerUserId} IS NOT NULL AND ${table.ownerHouseholdId} IS NULL) OR (${table.ownerUserId} IS NULL AND ${table.ownerHouseholdId} IS NOT NULL)`,
    ),
  ],
);

export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;
