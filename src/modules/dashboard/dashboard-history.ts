import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  parseISO,
} from 'date-fns';
import {
  DebtPaymentRecord,
  HistoryGranularity,
  HistoryLedger,
  HistoryPoint,
  InvestmentEvent,
  InvestmentValuationPoint,
} from './dashboard.type';

const DATE_FORMAT = 'yyyy-MM-dd';
const DAILY_MAX_SPAN_DAYS = 45;
const WEEKLY_MAX_SPAN_DAYS = 200;
const DAYS_PER_WEEK = 7;
const CENT_FACTOR = 100;

export function resolveGranularity(
  from: string,
  to: string,
): HistoryGranularity {
  const spanDays = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;

  if (spanDays <= DAILY_MAX_SPAN_DAYS) {
    return 'day';
  }

  return spanDays <= WEEKLY_MAX_SPAN_DAYS ? 'week' : 'month';
}

// Titik dimulai dari `from` lalu melangkah per granularity; `to` selalu menjadi
// titik terakhir supaya angka akhir grafik sama dengan kondisi saat ini.
export function buildBucketDates(
  from: string,
  to: string,
  granularity: HistoryGranularity,
): string[] {
  const start = parseISO(from);
  const end = format(parseISO(to), DATE_FORMAT);
  const dates: string[] = [];

  for (let step = 0; ; step++) {
    const current = format(
      granularity === 'month'
        ? addMonths(start, step)
        : addDays(start, granularity === 'week' ? step * DAYS_PER_WEEK : step),
      DATE_FORMAT,
    );

    if (current >= end) {
      break;
    }

    dates.push(current);
  }

  dates.push(end);

  return dates;
}

export function buildHistoryPoints(
  dates: string[],
  ledger: HistoryLedger,
): HistoryPoint[] {
  const valuationsByInvestment = groupBy(
    ledger.valuations,
    (valuation) => valuation.investmentId,
  );
  const eventsByInvestment = groupBy(
    ledger.investmentEvents,
    (event) => event.investmentId,
  );
  const paymentsByDebt = groupBy(
    ledger.debtPayments,
    (payment) => payment.debtId,
  );

  return dates.map((date) => {
    const walletBalance = ledger.walletDeltas
      .filter((delta) => delta.date <= date)
      .reduce((sum, delta) => sum + delta.amount, 0);

    let investmentValue = 0;
    let investedCapital = 0;

    for (const [investmentId, events] of eventsByInvestment) {
      const held = events.filter((event) => event.date <= date);
      const quantity = held.reduce(
        (sum, event) => sum + signed(event, event.quantity),
        0,
      );
      const price = latestPriceOn(
        valuationsByInvestment.get(investmentId) ?? [],
        date,
      );

      investmentValue += quantity * price;
      investedCapital += held.reduce(
        (sum, event) => sum + signed(event, event.quantity * event.price),
        0,
      );
    }

    const liabilities = ledger.debts
      .filter((debt) => debt.originDate === null || debt.originDate <= date)
      .reduce(
        (sum, debt) =>
          sum + outstandingOn(debt, paymentsByDebt.get(debt.id) ?? [], date),
        0,
      );

    const totalAssets = walletBalance + investmentValue;

    return {
      date,
      walletBalance: round(walletBalance),
      investmentValue: round(investmentValue),
      investedCapital: round(investedCapital),
      totalAssets: round(totalAssets),
      liabilities: round(liabilities),
      netWorth: round(totalAssets - liabilities),
    };
  });
}

// Sama seperti halaman investasi: selain jual, transaksi (beli & kepemilikan
// awal) menambah kuantitas dan modal; jual menguranginya.
function signed(event: InvestmentEvent, value: number): number {
  return event.type === 'sell' ? -value : value;
}

// Tanpa valuasi pada/sebelum tanggal tersebut nilainya 0, sama dengan kartu
// Net Worth di dashboard yang memakai harga valuasi terakhir.
function latestPriceOn(
  valuations: InvestmentValuationPoint[],
  date: string,
): number {
  let price = 0;

  for (const valuation of valuations) {
    if (valuation.date > date) {
      break;
    }

    price = valuation.pricePerUnit;
  }

  return price;
}

function outstandingOn(
  debt: { principal: number; openingPaid: number },
  payments: DebtPaymentRecord[],
  date: string,
): number {
  const paid = payments
    .filter((payment) => payment.date <= date)
    .reduce((sum, payment) => sum + payment.amount, 0);

  return Math.max(debt.principal - debt.openingPaid - paid, 0);
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);

    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return groups;
}

function round(value: number): number {
  return Math.round(value * CENT_FACTOR) / CENT_FACTOR;
}
