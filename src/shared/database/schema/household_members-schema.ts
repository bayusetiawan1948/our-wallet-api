import { pgTable, uuid, boolean, primaryKey } from 'drizzle-orm/pg-core';
import { households } from './households-schema';
import { users } from './users-schema';
import { householdMemberRoleEnum } from './enums-schema';

export const householdMembers = pgTable(
  'household_members',
  {
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: householdMemberRoleEnum('role').notNull().default('member'),
    canEditOthersTransactions: boolean('can_edit_others_transactions')
      .notNull()
      .default(false),
  },
  (table) => [
    primaryKey({
      name: 'household_members_pkey',
      columns: [table.householdId, table.userId],
    }),
  ],
);

export type HouseholdMember = typeof householdMembers.$inferSelect;
export type NewHouseholdMember = typeof householdMembers.$inferInsert;
