import {
  pgTable,
  uuid,
  varchar,
  boolean,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { households } from './households-schema';

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, {
    onDelete: 'set null',
  }),
  name: varchar('name', { length: 255 }).notNull(),
  isSystem: boolean('is_system').notNull().default(false),
  isHidden: boolean('is_hidden').notNull().default(false),
});

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
