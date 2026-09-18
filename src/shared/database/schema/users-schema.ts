import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 32 }),
  baseCurrency: varchar('base_currency', { length: 10 })
    .notNull()
    .default('IDR'),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
