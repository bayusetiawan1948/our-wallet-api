import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { households } from './households-schema';
import { users } from './users-schema';

export const householdInvites = pgTable('household_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  invitedBy: uuid('invited_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 100 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  expiresAt: timestamp('expires_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
});

export type HouseholdInvite = typeof householdInvites.$inferSelect;
export type NewHouseholdInvite = typeof householdInvites.$inferInsert;
