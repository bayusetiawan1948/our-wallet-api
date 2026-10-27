import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../shared/database/database.provider';
import {
  DbTx,
  ensureSystemCategory,
} from '../../shared/database/system-category';
import {
  Debt,
  DebtPayment,
  debtPayments,
  debts,
  NewDebt,
  NewDebtPayment,
  NewTransaction,
  transactions,
} from '../../shared/database/schema';

export const DEBT_CATEGORY_NAME = 'Utang/Piutang';

type Tx = DbTx;

// Membangun entri transaksi dari record yang baru tersimpan di dalam DB transaction yang sama.
export type LedgerEntryBuilder<T> = (
  record: T,
  categoryId: string,
) => NewTransaction[];

@Injectable()
export class DebtsRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  private ensureDebtCategory(tx: Tx, householdId: string): Promise<string> {
    return ensureSystemCategory(tx, householdId, DEBT_CATEGORY_NAME);
  }

  private async insertEntries(
    tx: Tx,
    entries: NewTransaction[],
  ): Promise<void> {
    if (entries.length > 0) {
      await tx.insert(transactions).values(entries);
    }
  }

  async CreateDebtWithEntries(
    householdId: string,
    data: NewDebt,
    buildEntries: LedgerEntryBuilder<Debt>,
  ): Promise<Debt> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx.insert(debts).values(data).returning();
      const categoryId = await this.ensureDebtCategory(tx, householdId);

      await this.insertEntries(tx, buildEntries(created, categoryId));

      return created;
    });
  }

  async UpdateDebtWithEntries(
    householdId: string,
    id: string,
    data: Partial<NewDebt>,
    buildEntries: LedgerEntryBuilder<Debt>,
  ): Promise<Debt | undefined> {
    return this.db.transaction(async (tx) => {
      const [updated] =
        Object.keys(data).length > 0
          ? await tx.update(debts).set(data).where(eq(debts.id, id)).returning()
          : await tx.select().from(debts).where(eq(debts.id, id)).limit(1);

      if (!updated) {
        return undefined;
      }

      const categoryId = await this.ensureDebtCategory(tx, householdId);

      await this.insertEntries(tx, buildEntries(updated, categoryId));

      return updated;
    });
  }

  async CreatePaymentWithEntry(
    householdId: string,
    data: NewDebtPayment,
    buildEntries: LedgerEntryBuilder<DebtPayment>,
  ): Promise<DebtPayment> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx.insert(debtPayments).values(data).returning();
      const categoryId = await this.ensureDebtCategory(tx, householdId);

      await this.insertEntries(tx, buildEntries(created, categoryId));

      return created;
    });
  }

  async VoidPaymentWithEntry(
    householdId: string,
    paymentId: string,
    buildEntries: LedgerEntryBuilder<DebtPayment>,
  ): Promise<DebtPayment | undefined> {
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(debtPayments)
        .set({ status: 'void' })
        .where(eq(debtPayments.id, paymentId))
        .returning();

      if (!updated) {
        return undefined;
      }

      const categoryId = await this.ensureDebtCategory(tx, householdId);

      await this.insertEntries(tx, buildEntries(updated, categoryId));

      return updated;
    });
  }

  async CreateDebt(data: NewDebt): Promise<Debt> {
    const [created] = await this.db.insert(debts).values(data).returning();

    return created;
  }

  async FindById(id: string): Promise<Debt | undefined> {
    const [found] = await this.db
      .select()
      .from(debts)
      .where(eq(debts.id, id))
      .limit(1);

    return found;
  }

  async FindAccessible(
    userId: string,
    householdId: string | null,
  ): Promise<Debt[]> {
    const conditions = [eq(debts.ownerUserId, userId)];

    if (householdId) {
      conditions.push(eq(debts.ownerHouseholdId, householdId));
    }

    return this.db
      .select()
      .from(debts)
      .where(or(...conditions));
  }

  async UpdateDebt(
    id: string,
    data: Partial<NewDebt>,
  ): Promise<Debt | undefined> {
    const [updated] = await this.db
      .update(debts)
      .set(data)
      .where(eq(debts.id, id))
      .returning();

    return updated;
  }

  async DeleteDebt(id: string): Promise<void> {
    await this.db.delete(debts).where(eq(debts.id, id));
  }

  async CreatePayment(data: NewDebtPayment): Promise<DebtPayment> {
    const [created] = await this.db
      .insert(debtPayments)
      .values(data)
      .returning();

    return created;
  }

  async FindPaymentById(id: string): Promise<DebtPayment | undefined> {
    const [found] = await this.db
      .select()
      .from(debtPayments)
      .where(eq(debtPayments.id, id))
      .limit(1);

    return found;
  }

  async ListPaymentsByDebt(debtId: string): Promise<DebtPayment[]> {
    return this.db
      .select()
      .from(debtPayments)
      .where(eq(debtPayments.debtId, debtId));
  }

  async UpdatePaymentStatus(
    id: string,
    status: 'active' | 'void',
  ): Promise<DebtPayment | undefined> {
    const [updated] = await this.db
      .update(debtPayments)
      .set({ status })
      .where(eq(debtPayments.id, id))
      .returning();

    return updated;
  }

  async SumActivePayments(debtId: string): Promise<number> {
    const payments = await this.db
      .select()
      .from(debtPayments)
      .where(
        and(eq(debtPayments.debtId, debtId), eq(debtPayments.status, 'active')),
      );

    return payments.reduce((sum, p) => sum + Number(p.amount), 0);
  }

  async HasActivePayments(debtId: string): Promise<boolean> {
    const [found] = await this.db
      .select({ id: debtPayments.id })
      .from(debtPayments)
      .where(
        and(eq(debtPayments.debtId, debtId), eq(debtPayments.status, 'active')),
      )
      .limit(1);

    return Boolean(found);
  }
}
