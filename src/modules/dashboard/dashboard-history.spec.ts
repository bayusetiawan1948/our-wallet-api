import {
  buildBucketDates,
  buildHistoryPoints,
  resolveGranularity,
} from './dashboard-history';
import { HistoryLedger } from './dashboard.type';

const emptyLedger: HistoryLedger = {
  walletDeltas: [],
  investmentEvents: [],
  valuations: [],
  debts: [],
  debtPayments: [],
};

describe('resolveGranularity', () => {
  it.each([
    ['2026-10-31', '2026-10-31', 'day'],
    ['2026-10-01', '2026-10-31', 'day'],
    ['2026-08-01', '2026-10-31', 'week'],
    ['2026-04-30', '2026-10-31', 'week'],
    ['2025-10-31', '2026-10-31', 'month'],
  ])('%s → %s is %s', (from, to, expected) => {
    expect(resolveGranularity(from, to)).toBe(expected);
  });
});

describe('buildBucketDates', () => {
  it('returns a single point when from equals to', () => {
    expect(buildBucketDates('2026-10-31', '2026-10-31', 'day')).toEqual([
      '2026-10-31',
    ]);
  });

  it('steps daily and ends on `to`', () => {
    expect(buildBucketDates('2026-10-29', '2026-10-31', 'day')).toEqual([
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
    ]);
  });

  it('steps weekly from `from` and always appends `to`', () => {
    expect(buildBucketDates('2026-10-01', '2026-10-20', 'week')).toEqual([
      '2026-10-01',
      '2026-10-08',
      '2026-10-15',
      '2026-10-20',
    ]);
  });

  it('does not duplicate `to` when it lands on a step', () => {
    expect(buildBucketDates('2026-10-01', '2026-10-15', 'week')).toEqual([
      '2026-10-01',
      '2026-10-08',
      '2026-10-15',
    ]);
  });

  it('steps monthly without drifting after a short month', () => {
    expect(buildBucketDates('2026-01-31', '2026-04-30', 'month')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });
});

describe('buildHistoryPoints', () => {
  it('returns zeros when there is no data', () => {
    const [point] = buildHistoryPoints(['2026-10-31'], emptyLedger);

    expect(point).toEqual({
      date: '2026-10-31',
      walletBalance: 0,
      investmentValue: 0,
      investedCapital: 0,
      totalAssets: 0,
      liabilities: 0,
      netWorth: 0,
    });
  });

  it('accumulates wallet movements up to each date, including history before `from`', () => {
    const points = buildHistoryPoints(['2026-10-10', '2026-10-20'], {
      ...emptyLedger,
      walletDeltas: [
        { date: '2026-09-01', amount: 1_000_000 },
        { date: '2026-10-10', amount: -200_000 },
        { date: '2026-10-15', amount: 500_000 },
        { date: '2026-10-21', amount: 9_999_999 },
      ],
    });

    expect(points.map((p) => p.walletBalance)).toEqual([800_000, 1_300_000]);
  });

  it('values holdings with the latest valuation on or before each date', () => {
    const points = buildHistoryPoints(
      ['2026-10-01', '2026-10-10', '2026-10-20'],
      {
        ...emptyLedger,
        investmentEvents: [
          {
            investmentId: 'inv-1',
            type: 'buy',
            quantity: 10,
            price: 100,
            date: '2026-10-05',
          },
          {
            investmentId: 'inv-1',
            type: 'sell',
            quantity: 4,
            price: 150,
            date: '2026-10-15',
          },
        ],
        valuations: [
          { investmentId: 'inv-1', pricePerUnit: 100, date: '2026-10-05' },
          { investmentId: 'inv-1', pricePerUnit: 120, date: '2026-10-08' },
          { investmentId: 'inv-1', pricePerUnit: 130, date: '2026-10-18' },
        ],
      },
    );

    expect(points.map((p) => p.investmentValue)).toEqual([0, 1_200, 780]);
    // Modal: beli 10 × 100 = 1000; setelah jual 4 × 150 modal menjadi 400.
    expect(points.map((p) => p.investedCapital)).toEqual([0, 1_000, 400]);
  });

  it('counts opening holdings as capital, like the investments page', () => {
    const [point] = buildHistoryPoints(['2026-10-31'], {
      ...emptyLedger,
      investmentEvents: [
        {
          investmentId: 'inv-1',
          type: 'opening',
          quantity: 2,
          price: 500,
          date: '2026-01-01',
        },
      ],
      valuations: [
        { investmentId: 'inv-1', pricePerUnit: 600, date: '2026-10-01' },
      ],
    });

    expect(point.investedCapital).toBe(1_000);
    expect(point.investmentValue).toBe(1_200);
  });

  it('values a holding at zero when it has no valuation yet', () => {
    const [point] = buildHistoryPoints(['2026-10-31'], {
      ...emptyLedger,
      investmentEvents: [
        {
          investmentId: 'inv-1',
          type: 'buy',
          quantity: 1,
          price: 100,
          date: '2026-10-01',
        },
      ],
    });

    expect(point.investmentValue).toBe(0);
    expect(point.investedCapital).toBe(100);
  });

  it('reduces liabilities as payments are made and ignores debts not yet taken', () => {
    const points = buildHistoryPoints(
      ['2026-09-30', '2026-10-10', '2026-10-31'],
      {
        ...emptyLedger,
        debts: [
          {
            id: 'opening',
            principal: 1_000,
            openingPaid: 200,
            originDate: null,
          },
          {
            id: 'new',
            principal: 500,
            openingPaid: 0,
            originDate: '2026-10-05',
          },
        ],
        debtPayments: [
          { debtId: 'opening', amount: 300, date: '2026-10-20' },
          { debtId: 'new', amount: 500, date: '2026-10-25' },
        ],
      },
    );

    expect(points.map((p) => p.liabilities)).toEqual([800, 1_300, 500]);
  });

  it('never reports a negative outstanding amount for a debt', () => {
    const [point] = buildHistoryPoints(['2026-10-31'], {
      ...emptyLedger,
      debts: [{ id: 'd', principal: 100, openingPaid: 0, originDate: null }],
      debtPayments: [{ debtId: 'd', amount: 150, date: '2026-10-01' }],
    });

    expect(point.liabilities).toBe(0);
  });

  it('derives net worth as wallets + investments − liabilities', () => {
    const [point] = buildHistoryPoints(['2026-10-31'], {
      walletDeltas: [{ date: '2026-10-01', amount: 2_000 }],
      investmentEvents: [
        {
          investmentId: 'inv-1',
          type: 'buy',
          quantity: 5,
          price: 100,
          date: '2026-10-02',
        },
      ],
      valuations: [
        { investmentId: 'inv-1', pricePerUnit: 120, date: '2026-10-03' },
      ],
      debts: [{ id: 'd', principal: 700, openingPaid: 0, originDate: null }],
      debtPayments: [],
    });

    expect(point.totalAssets).toBe(2_600);
    expect(point.netWorth).toBe(1_900);
  });
});
