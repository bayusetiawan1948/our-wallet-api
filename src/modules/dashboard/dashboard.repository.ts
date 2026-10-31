import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, lte, ne, or, sql, SQL } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../shared/database/database.provider';
import {
  debtPayments,
  debts,
  investments,
  investmentTransactions,
  investmentValuations,
  transactions,
  transfers,
} from '../../shared/database/schema';
import {
  DatedAmount,
  DebtPaymentRecord,
  DebtRecord,
  InvestmentEvent,
  InvestmentValuationPoint,
} from './dashboard.type';

// Sama dengan filter tanggal di TransactionsRepository: transaksi disimpan
// sebagai timestamptz tetapi dibaca per hari kalender WIB.
const JAKARTA_DATE = sql<string>`(${transactions.date} AT TIME ZONE 'Asia/Jakarta')::date`;

@Injectable()
export class DashboardRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  // Pergerakan saldo per hari untuk sekumpulan wallet. Rumusnya sama dengan
  // WalletsRepository.ComputeBalance, hanya dikelompokkan per tanggal.
  async ListWalletDeltas(
    walletIds: string[],
    to: string,
  ): Promise<DatedAmount[]> {
    if (walletIds.length === 0) {
      return [];
    }

    const [ledger, transfersIn, transfersOut] = await Promise.all([
      this.db
        .select({
          date: sql<string>`${JAKARTA_DATE}::text`,
          amount: sql<string>`SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE -${transactions.amount} END)`,
        })
        .from(transactions)
        .where(
          and(
            inArray(transactions.walletId, walletIds),
            eq(transactions.status, 'active'),
            lte(JAKARTA_DATE, to),
          ),
        )
        .groupBy(JAKARTA_DATE),
      this.db
        .select({
          date: sql<string>`${transfers.date}::text`,
          amount: sql<string>`SUM(${transfers.amount})`,
        })
        .from(transfers)
        .where(
          and(
            inArray(transfers.toWalletId, walletIds),
            eq(transfers.status, 'active'),
            lte(transfers.date, to),
          ),
        )
        .groupBy(transfers.date),
      this.db
        .select({
          date: sql<string>`${transfers.date}::text`,
          amount: sql<string>`-SUM(${transfers.amount} + ${transfers.fee})`,
        })
        .from(transfers)
        .where(
          and(
            inArray(transfers.fromWalletId, walletIds),
            eq(transfers.status, 'active'),
            lte(transfers.date, to),
          ),
        )
        .groupBy(transfers.date),
    ]);

    return [...ledger, ...transfersIn, ...transfersOut].map((row) => ({
      date: row.date,
      amount: Number(row.amount),
    }));
  }

  async ListInvestmentEvents(
    userId: string,
    householdId: string | null,
    to: string,
  ): Promise<InvestmentEvent[]> {
    const rows = await this.db
      .select({
        investmentId: investmentTransactions.investmentId,
        type: investmentTransactions.type,
        quantity: investmentTransactions.quantity,
        price: investmentTransactions.price,
        date: investmentTransactions.date,
      })
      .from(investmentTransactions)
      .innerJoin(
        investments,
        eq(investments.id, investmentTransactions.investmentId),
      )
      .where(
        and(
          this.ownedInvestment(userId, householdId),
          eq(investmentTransactions.status, 'active'),
          lte(investmentTransactions.date, to),
        ),
      );

    return rows.map((row) => ({
      investmentId: row.investmentId,
      type: row.type,
      quantity: Number(row.quantity),
      price: Number(row.price),
      date: row.date,
    }));
  }

  // Urutan naik (tanggal, waktu input) supaya valuasi terakhir pada tanggal
  // yang sama menang, sama seperti FindLatestValuation.
  async ListValuations(
    userId: string,
    householdId: string | null,
    to: string,
  ): Promise<InvestmentValuationPoint[]> {
    const rows = await this.db
      .select({
        investmentId: investmentValuations.investmentId,
        pricePerUnit: investmentValuations.pricePerUnit,
        date: investmentValuations.date,
      })
      .from(investmentValuations)
      .innerJoin(
        investments,
        eq(investments.id, investmentValuations.investmentId),
      )
      .where(
        and(
          this.ownedInvestment(userId, householdId),
          lte(investmentValuations.date, to),
        ),
      )
      .orderBy(
        asc(investmentValuations.date),
        asc(investmentValuations.createdAt),
      );

    return rows.map((row) => ({
      investmentId: row.investmentId,
      pricePerUnit: Number(row.pricePerUnit),
      date: row.date,
    }));
  }

  // Hanya utang (liabilitas) yang belum dibatalkan, sama dengan kartu
  // Liabilities. Tanggal terima pinjaman diambil dari entri ledger
  // `debt_create`; debt lama (opening) tidak punya entri sehingga null.
  async ListLiabilityDebts(
    userId: string,
    householdId: string | null,
  ): Promise<DebtRecord[]> {
    const origins = this.db
      .select({
        debtId: transactions.debtId,
        originDate: sql<string>`MIN(${JAKARTA_DATE})::text`.as('origin_date'),
      })
      .from(transactions)
      .where(eq(transactions.source, 'debt_create'))
      .groupBy(transactions.debtId)
      .as('debt_origins');

    const rows = await this.db
      .select({
        id: debts.id,
        principal: debts.principal,
        openingPaid: debts.openingPaid,
        originDate: origins.originDate,
      })
      .from(debts)
      .leftJoin(origins, eq(origins.debtId, debts.id))
      .where(
        and(
          this.ownedDebt(userId, householdId),
          eq(debts.type, 'utang'),
          ne(debts.status, 'cancelled'),
        ),
      );

    return rows.map((row) => ({
      id: row.id,
      principal: Number(row.principal),
      openingPaid: Number(row.openingPaid),
      originDate: row.originDate,
    }));
  }

  async ListLiabilityPayments(
    userId: string,
    householdId: string | null,
    to: string,
  ): Promise<DebtPaymentRecord[]> {
    const rows = await this.db
      .select({
        debtId: debtPayments.debtId,
        amount: debtPayments.amount,
        date: debtPayments.date,
      })
      .from(debtPayments)
      .innerJoin(debts, eq(debts.id, debtPayments.debtId))
      .where(
        and(
          this.ownedDebt(userId, householdId),
          eq(debts.type, 'utang'),
          ne(debts.status, 'cancelled'),
          eq(debtPayments.status, 'active'),
          lte(debtPayments.date, to),
        ),
      );

    return rows.map((row) => ({
      debtId: row.debtId,
      amount: Number(row.amount),
      date: row.date,
    }));
  }

  private ownedInvestment(userId: string, householdId: string | null): SQL {
    const owned = [eq(investments.ownerUserId, userId)];

    if (householdId) {
      owned.push(eq(investments.ownerHouseholdId, householdId));
    }

    return or(...owned) as SQL;
  }

  private ownedDebt(userId: string, householdId: string | null): SQL {
    const owned = [eq(debts.ownerUserId, userId)];

    if (householdId) {
      owned.push(eq(debts.ownerHouseholdId, householdId));
    }

    return or(...owned) as SQL;
  }
}
