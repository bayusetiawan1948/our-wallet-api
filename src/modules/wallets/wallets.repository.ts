import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../shared/database/database.provider';
import {
  debtPayments,
  investmentTransactions,
  NewWallet,
  NewWalletAccess,
  NewWalletReconciliation,
  transactions,
  transfers,
  Wallet,
  walletAccess,
  wallets,
  walletReconciliations,
  walletBalanceSnapshots,
  WalletAccess,
  WalletReconciliation,
  WalletBalanceSnapshot,
} from '../../shared/database/schema';

@Injectable()
export class WalletsRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  async CreateWallet(data: NewWallet): Promise<Wallet> {
    const [created] = await this.db.insert(wallets).values(data).returning();

    return created;
  }

  async FindById(id: string): Promise<Wallet | undefined> {
    const [found] = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, id))
      .limit(1);

    return found;
  }

  async FindAccessibleWallets(
    userId: string,
    householdId: string | null,
  ): Promise<Wallet[]> {
    const accessibleIds = await this.db
      .select({ walletId: walletAccess.walletId })
      .from(walletAccess)
      .where(eq(walletAccess.userId, userId));

    const conditions = [eq(wallets.ownerUserId, userId)];

    if (householdId) {
      conditions.push(eq(wallets.ownerHouseholdId, householdId));
    }

    if (accessibleIds.length > 0) {
      for (const row of accessibleIds) {
        conditions.push(eq(wallets.id, row.walletId));
      }
    }

    return this.db
      .select()
      .from(wallets)
      .where(or(...conditions));
  }

  async UpdateWallet(
    id: string,
    data: Partial<NewWallet>,
  ): Promise<Wallet | undefined> {
    const [updated] = await this.db
      .update(wallets)
      .set(data)
      .where(eq(wallets.id, id))
      .returning();

    return updated;
  }

  async DeleteWallet(id: string): Promise<void> {
    await this.db.delete(wallets).where(eq(wallets.id, id));
  }

  async ComputeBalance(walletId: string): Promise<number> {
    const [txSums] = await this.db
      .select({
        income: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE 0 END), 0)`,
        expense: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.walletId, walletId),
          eq(transactions.status, 'active'),
        ),
      );

    const [transferIn] = await this.db
      .select({
        total: sql<string>`COALESCE(SUM(${transfers.amount}), 0)`,
      })
      .from(transfers)
      .where(
        and(eq(transfers.toWalletId, walletId), eq(transfers.status, 'active')),
      );

    const [transferOut] = await this.db
      .select({
        total: sql<string>`COALESCE(SUM(${transfers.amount} + ${transfers.fee}), 0)`,
      })
      .from(transfers)
      .where(
        and(
          eq(transfers.fromWalletId, walletId),
          eq(transfers.status, 'active'),
        ),
      );

    const income = Number(txSums?.income ?? 0);
    const expense = Number(txSums?.expense ?? 0);
    const inbound = Number(transferIn?.total ?? 0);
    const outbound = Number(transferOut?.total ?? 0);

    return income - expense + inbound - outbound;
  }

  async HasAnyMoneyMovement(walletId: string): Promise<boolean> {
    const [tx] = await this.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.walletId, walletId))
      .limit(1);
    if (tx) return true;

    const [tr] = await this.db
      .select({ id: transfers.id })
      .from(transfers)
      .where(
        or(eq(transfers.fromWalletId, walletId), eq(transfers.toWalletId, walletId)),
      )
      .limit(1);
    if (tr) return true;

    const [dp] = await this.db
      .select({ id: debtPayments.id })
      .from(debtPayments)
      .where(eq(debtPayments.walletId, walletId))
      .limit(1);
    if (dp) return true;

    const [itx] = await this.db
      .select({ id: investmentTransactions.id })
      .from(investmentTransactions)
      .where(eq(investmentTransactions.walletId, walletId))
      .limit(1);
    if (itx) return true;

    const [rec] = await this.db
      .select({ id: walletReconciliations.id })
      .from(walletReconciliations)
      .where(eq(walletReconciliations.walletId, walletId))
      .limit(1);
    if (rec) return true;

    return false;
  }

  async GrantAccess(data: NewWalletAccess): Promise<WalletAccess> {
    const [created] = await this.db
      .insert(walletAccess)
      .values(data)
      .returning();

    return created;
  }

  async RevokeAccess(walletId: string, userId: string): Promise<void> {
    await this.db
      .delete(walletAccess)
      .where(
        and(
          eq(walletAccess.walletId, walletId),
          eq(walletAccess.userId, userId),
        ),
      );
  }

  async HasAccess(walletId: string, userId: string): Promise<boolean> {
    const [found] = await this.db
      .select({ userId: walletAccess.userId })
      .from(walletAccess)
      .where(
        and(
          eq(walletAccess.walletId, walletId),
          eq(walletAccess.userId, userId),
        ),
      )
      .limit(1);

    return Boolean(found);
  }

  async ListAccessByWallet(walletId: string): Promise<WalletAccess[]> {
    return this.db
      .select()
      .from(walletAccess)
      .where(eq(walletAccess.walletId, walletId));
  }

  async CreateReconciliation(
    data: NewWalletReconciliation,
  ): Promise<WalletReconciliation> {
    const [created] = await this.db
      .insert(walletReconciliations)
      .values(data)
      .returning();

    return created;
  }

  async ListReconciliationsByWallet(
    walletId: string,
  ): Promise<WalletReconciliation[]> {
    return this.db
      .select()
      .from(walletReconciliations)
      .where(eq(walletReconciliations.walletId, walletId));
  }

  async ListSnapshotsByWallet(
    walletId: string,
  ): Promise<WalletBalanceSnapshot[]> {
    return this.db
      .select()
      .from(walletBalanceSnapshots)
      .where(eq(walletBalanceSnapshots.walletId, walletId));
  }
}
