import { authed, createAdmin, type Actor } from '../support/actors';
import {
  createCategory,
  createWallet,
  getWalletBalance,
  TODAY,
} from '../support/builders';
import {
  closeTestApp,
  createTestApp,
  type TestContext,
} from '../support/test-app';

interface LedgerRow {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  note: string;
  source: string | null;
  investment_transaction_id: string | null;
}

describe('Investment ledger entries (feature)', () => {
  let ctx: TestContext;
  let admin: Actor;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await createAdmin(ctx, 'Admin');
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  const balance = (walletId: string) => getWalletBalance(ctx, admin, walletId);

  const ledger = async (walletId: string) =>
    (
      (
        await authed(ctx, admin)
          .get('/transactions')
          .query({ wallet_id: walletId })
          .expect(200)
      ).body.data as LedgerRow[]
    ).filter((row) => row.source !== null);

  const createInvestment = async () =>
    (
      await authed(ctx, admin)
        .post('/investments')
        .send({
          owner_type: 'household',
          asset_type: 'emas',
          asset_name: 'Emas Antam',
          unit: 'gram',
        })
        .expect(201)
    ).body.data as { id: string };

  const trade = (
    investmentId: string,
    walletId: string,
    type: 'buy' | 'sell',
    quantity: number,
    price: number,
  ) =>
    authed(ctx, admin).post(`/investments/${investmentId}/transactions`).send({
      wallet_id: walletId,
      type,
      quantity,
      price,
      date: TODAY,
    });

  it('records an expense entry referencing the buy and deducts the wallet', async () => {
    const wallet = await createWallet(ctx, admin, {
      initial_balance: 5_000_000,
    });
    const investment = await createInvestment();
    const buy = await trade(investment.id, wallet.id, 'buy', 2, 1_000_000);

    expect(buy.status).toBe(201);
    expect(await balance(wallet.id)).toBe(3_000_000);
    expect(await ledger(wallet.id)).toEqual([
      expect.objectContaining({
        type: 'expense',
        amount: 2_000_000,
        note: 'Pembelian investasi · Emas Antam',
        source: 'investment_buy',
        investment_transaction_id: buy.body.data.id,
      }),
    ]);
  });

  it('records an income entry for a sale and credits the wallet', async () => {
    const wallet = await createWallet(ctx, admin, {
      initial_balance: 5_000_000,
    });
    const investment = await createInvestment();

    await trade(investment.id, wallet.id, 'buy', 2, 1_000_000).expect(201);
    await trade(investment.id, wallet.id, 'sell', 1, 1_200_000).expect(201);

    expect(await balance(wallet.id)).toBe(4_200_000);
    expect(
      (await ledger(wallet.id)).find((r) => r.source === 'investment_sell'),
    ).toMatchObject({
      type: 'income',
      amount: 1_200_000,
      note: 'Penjualan investasi · Emas Antam',
    });
  });

  it('does not create any entry or move the balance for an opening holding', async () => {
    const wallet = await createWallet(ctx, admin, {
      initial_balance: 1_000_000,
    });
    const investment = await createInvestment();

    await authed(ctx, admin)
      .post(`/investments/${investment.id}/transactions`)
      .send({ type: 'opening', quantity: 3, price: 900_000, date: TODAY })
      .expect(201);

    expect(await balance(wallet.id)).toBe(1_000_000);
    expect(await ledger(wallet.id)).toEqual([]);
  });

  it('adds a reversing entry when a buy is voided and keeps the original', async () => {
    const wallet = await createWallet(ctx, admin, {
      initial_balance: 5_000_000,
    });
    const investment = await createInvestment();
    const buy = await trade(investment.id, wallet.id, 'buy', 2, 1_000_000);

    await authed(ctx, admin)
      .post(
        `/investments/${investment.id}/transactions/${buy.body.data.id}/void`,
      )
      .expect(200);

    expect(await balance(wallet.id)).toBe(5_000_000);

    const rows = await ledger(wallet.id);

    expect(rows.map((r) => r.source).sort()).toEqual(
      ['investment_buy', 'investment_void'].sort(),
    );
    expect(rows.find((r) => r.source === 'investment_void')).toMatchObject({
      type: 'income',
      amount: 2_000_000,
      note: 'Pembatalan pembelian investasi · Emas Antam',
      investment_transaction_id: buy.body.data.id,
    });
  });

  it('adds an expense reversal when a sale is voided', async () => {
    const wallet = await createWallet(ctx, admin, {
      initial_balance: 5_000_000,
    });
    const investment = await createInvestment();

    await trade(investment.id, wallet.id, 'buy', 2, 1_000_000).expect(201);

    const sell = await trade(investment.id, wallet.id, 'sell', 1, 1_200_000);

    await authed(ctx, admin)
      .post(
        `/investments/${investment.id}/transactions/${sell.body.data.id}/void`,
      )
      .expect(200);

    expect(await balance(wallet.id)).toBe(3_000_000);
    expect(
      (await ledger(wallet.id)).find((r) => r.source === 'investment_void'),
    ).toMatchObject({
      type: 'expense',
      note: 'Pembatalan penjualan investasi · Emas Antam',
    });
  });

  it('refuses to void or correct an investment entry from the transactions menu', async () => {
    const wallet = await createWallet(ctx, admin, {
      initial_balance: 5_000_000,
    });
    const category = await createCategory(ctx, admin, { type: 'both' });
    const investment = await createInvestment();

    await trade(investment.id, wallet.id, 'buy', 1, 1_000_000).expect(201);

    const [entry] = await ledger(wallet.id);
    const voided = await authed(ctx, admin).post(
      `/transactions/${entry.id}/void`,
    );
    const corrected = await authed(ctx, admin)
      .post(`/transactions/${entry.id}/correct`)
      .send({
        wallet_id: wallet.id,
        category_id: category.id,
        type: 'expense',
        amount: 1,
        date: TODAY,
      });

    expect(voided.status).toBe(409);
    expect(voided.body.message).toMatch(/Investasi/);
    expect(corrected.status).toBe(409);
    expect(await balance(wallet.id)).toBe(4_000_000);
  });
});
