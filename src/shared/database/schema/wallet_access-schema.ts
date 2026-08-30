import { pgTable, uuid, primaryKey } from 'drizzle-orm/pg-core';
import { wallets } from './wallets-schema';
import { users } from './users-schema';

export const walletAccess = pgTable(
  'wallet_access',
  {
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assignedBy: uuid('assigned_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({
      name: 'wallet_access_pkey',
      columns: [table.walletId, table.userId],
    }),
  ],
);

export type WalletAccess = typeof walletAccess.$inferSelect;
export type NewWalletAccess = typeof walletAccess.$inferInsert;
