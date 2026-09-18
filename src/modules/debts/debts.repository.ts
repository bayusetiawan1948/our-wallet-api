import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../shared/database/database.provider';
import {
  Debt,
  DebtPayment,
  debtPayments,
  debts,
  NewDebt,
  NewDebtPayment,
} from '../../shared/database/schema';

@Injectable()
export class DebtsRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

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
