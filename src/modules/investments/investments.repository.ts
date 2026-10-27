import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, or } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../shared/database/database.provider';
import {
  Investment,
  investments,
  InvestmentTransaction,
  investmentTransactions,
  InvestmentValuation,
  investmentValuations,
  NewInvestment,
  NewInvestmentTransaction,
  NewInvestmentValuation,
  transactions,
} from '../../shared/database/schema';
import { ensureSystemCategory } from '../../shared/database/system-category';
import { LedgerEntryBuilder } from '../debts/debts.repository';

export const INVESTMENT_CATEGORY_NAME = 'Investasi';

@Injectable()
export class InvestmentsRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  async CreateInvestment(data: NewInvestment): Promise<Investment> {
    const [created] = await this.db
      .insert(investments)
      .values(data)
      .returning();

    return created;
  }

  async FindById(id: string): Promise<Investment | undefined> {
    const [found] = await this.db
      .select()
      .from(investments)
      .where(eq(investments.id, id))
      .limit(1);

    return found;
  }

  async FindAccessible(
    userId: string,
    householdId: string | null,
  ): Promise<Investment[]> {
    const conditions = [eq(investments.ownerUserId, userId)];

    if (householdId) {
      conditions.push(eq(investments.ownerHouseholdId, householdId));
    }

    return this.db
      .select()
      .from(investments)
      .where(or(...conditions));
  }

  async CreateTransaction(
    data: NewInvestmentTransaction,
  ): Promise<InvestmentTransaction> {
    const [created] = await this.db
      .insert(investmentTransactions)
      .values(data)
      .returning();

    return created;
  }

  // Transaksi investasi dan entri transaksinya disimpan atomik supaya saldo
  // dompet (yang dihitung dari tabel transactions) tidak pernah setengah jalan.
  async CreateTransactionWithEntry(
    householdId: string,
    data: NewInvestmentTransaction,
    buildEntries: LedgerEntryBuilder<InvestmentTransaction>,
  ): Promise<InvestmentTransaction> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(investmentTransactions)
        .values(data)
        .returning();
      const categoryId = await ensureSystemCategory(
        tx,
        householdId,
        INVESTMENT_CATEGORY_NAME,
      );

      await tx.insert(transactions).values(buildEntries(created, categoryId));

      return created;
    });
  }

  async VoidTransactionWithEntry(
    householdId: string,
    id: string,
    buildEntries: LedgerEntryBuilder<InvestmentTransaction>,
  ): Promise<InvestmentTransaction | undefined> {
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(investmentTransactions)
        .set({ status: 'void' })
        .where(eq(investmentTransactions.id, id))
        .returning();

      if (!updated) {
        return undefined;
      }

      const categoryId = await ensureSystemCategory(
        tx,
        householdId,
        INVESTMENT_CATEGORY_NAME,
      );

      await tx.insert(transactions).values(buildEntries(updated, categoryId));

      return updated;
    });
  }

  async UpdateInvestment(
    id: string,
    data: Partial<NewInvestment>,
  ): Promise<Investment | undefined> {
    if (Object.keys(data).length === 0) {
      return this.FindById(id);
    }

    const [updated] = await this.db
      .update(investments)
      .set(data)
      .where(eq(investments.id, id))
      .returning();

    return updated;
  }

  async DeleteInvestment(id: string): Promise<void> {
    await this.db.delete(investments).where(eq(investments.id, id));
  }

  async FindTransactionById(
    id: string,
  ): Promise<InvestmentTransaction | undefined> {
    const [found] = await this.db
      .select()
      .from(investmentTransactions)
      .where(eq(investmentTransactions.id, id))
      .limit(1);

    return found;
  }

  async UpdateTransactionStatus(
    id: string,
    status: 'active' | 'void',
  ): Promise<InvestmentTransaction | undefined> {
    const [updated] = await this.db
      .update(investmentTransactions)
      .set({ status })
      .where(eq(investmentTransactions.id, id))
      .returning();

    return updated;
  }

  async ListTransactionsByInvestment(
    investmentId: string,
  ): Promise<InvestmentTransaction[]> {
    return this.db
      .select()
      .from(investmentTransactions)
      .where(eq(investmentTransactions.investmentId, investmentId));
  }

  async CreateValuation(
    data: NewInvestmentValuation,
  ): Promise<InvestmentValuation> {
    const [created] = await this.db
      .insert(investmentValuations)
      .values(data)
      .returning();

    return created;
  }

  async FindLatestValuation(
    investmentId: string,
  ): Promise<InvestmentValuation | undefined> {
    const [found] = await this.db
      .select()
      .from(investmentValuations)
      .where(eq(investmentValuations.investmentId, investmentId))
      .orderBy(
        desc(investmentValuations.date),
        desc(investmentValuations.createdAt),
      )
      .limit(1);

    return found;
  }

  async ListValuationsByInvestment(
    investmentId: string,
  ): Promise<InvestmentValuation[]> {
    return this.db
      .select()
      .from(investmentValuations)
      .where(eq(investmentValuations.investmentId, investmentId))
      .orderBy(
        desc(investmentValuations.date),
        desc(investmentValuations.createdAt),
      );
  }

  async HasActiveTransactions(investmentId: string): Promise<boolean> {
    const [found] = await this.db
      .select({ id: investmentTransactions.id })
      .from(investmentTransactions)
      .where(
        and(
          eq(investmentTransactions.investmentId, investmentId),
          eq(investmentTransactions.status, 'active'),
        ),
      )
      .limit(1);

    return Boolean(found);
  }
}
