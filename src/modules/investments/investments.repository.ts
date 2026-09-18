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
} from '../../shared/database/schema';

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
      .orderBy(desc(investmentValuations.date))
      .limit(1);

    return found;
  }

  async ListValuationsByInvestment(
    investmentId: string,
  ): Promise<InvestmentValuation[]> {
    return this.db
      .select()
      .from(investmentValuations)
      .where(eq(investmentValuations.investmentId, investmentId));
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
