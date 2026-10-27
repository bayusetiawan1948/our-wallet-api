import { authed, createAdmin, type Actor } from '../support/actors';
import { createWallet, getWalletBalance, TODAY } from '../support/builders';
import {
  closeTestApp,
  createTestApp,
  type TestContext,
} from '../support/test-app';

describe('Wallet balance across modules (feature)', () => {
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

  describe('debt payments', () => {
    const createDebt = async (type: 'utang' | 'piutang', principal = 100_000) =>
      (
        await authed(ctx, admin)
          .post('/debts')
          .send({
            owner_type: 'household',
            type,
            counterparty: 'Pihak Lain',
            principal,
            is_opening: true,
          })
          .expect(201)
      ).body.data.id as string;

    const pay = (debtId: string, walletId: string, amount: number) =>
      authed(ctx, admin)
        .post(`/debts/${debtId}/payments`)
        .send({ wallet_id: walletId, amount, date: TODAY });

    it('lowers the wallet balance when paying an utang', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 500_000,
      });
      const debtId = await createDebt('utang');

      await pay(debtId, wallet.id, 40_000).expect(201);

      expect(await balance(wallet.id)).toBe(460_000);
    });

    it('raises the wallet balance when receiving a piutang payment', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 500_000,
      });
      const debtId = await createDebt('piutang');

      await pay(debtId, wallet.id, 25_000).expect(201);

      expect(await balance(wallet.id)).toBe(525_000);
    });

    it('restores the balance when the payment is voided', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 500_000,
      });
      const debtId = await createDebt('utang');
      const payment = await pay(debtId, wallet.id, 40_000).expect(201);

      await authed(ctx, admin)
        .post(`/debts/${debtId}/payments/${payment.body.data.id}/void`)
        .expect(200);

      expect(await balance(wallet.id)).toBe(500_000);
    });

    it('stops accepting utang payments once the balance is used up', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 50_000,
      });
      const debtId = await createDebt('utang', 500_000);

      await pay(debtId, wallet.id, 30_000).expect(201);

      const res = await pay(debtId, wallet.id, 30_000);

      expect(res.status).toBe(409);
      expect(await balance(wallet.id)).toBe(20_000);
    });

    it('lets an expense see the balance already spent on an utang', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 100_000,
      });
      const debtId = await createDebt('utang');
      const category = (
        await authed(ctx, admin)
          .post('/categories')
          .send({ name: 'Umum', type: 'both' })
          .expect(201)
      ).body.data.id;

      await pay(debtId, wallet.id, 80_000).expect(201);

      const res = await authed(ctx, admin).post('/transactions').send({
        wallet_id: wallet.id,
        category_id: category,
        type: 'expense',
        amount: 30_000,
        date: TODAY,
      });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Insufficient balance/);
    });
  });

  describe('investment transactions', () => {
    const createInvestment = async () =>
      (
        await authed(ctx, admin)
          .post('/investments')
          .send({
            owner_type: 'household',
            asset_type: 'emas',
            asset_name: 'Emas',
            unit: 'gram',
          })
          .expect(201)
      ).body.data.id as string;

    const trade = (
      investmentId: string,
      walletId: string,
      type: 'buy' | 'sell',
      quantity: number,
      price: number,
    ) =>
      authed(ctx, admin)
        .post(`/investments/${investmentId}/transactions`)
        .send({ wallet_id: walletId, type, quantity, price, date: TODAY });

    it('lowers the wallet balance on a buy', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 1_000_000,
      });
      const investmentId = await createInvestment();

      await trade(investmentId, wallet.id, 'buy', 2, 100_000).expect(201);

      expect(await balance(wallet.id)).toBe(800_000);
    });

    it('raises the wallet balance on a sell', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 1_000_000,
      });
      const investmentId = await createInvestment();

      await trade(investmentId, wallet.id, 'buy', 2, 100_000).expect(201);
      await trade(investmentId, wallet.id, 'sell', 1, 150_000).expect(201);

      expect(await balance(wallet.id)).toBe(950_000);
    });

    it('supports fractional quantities in the balance', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 1_000_000,
      });
      const investmentId = await createInvestment();

      await trade(investmentId, wallet.id, 'buy', 0.5, 200_000).expect(201);

      expect(await balance(wallet.id)).toBe(900_000);
    });

    it('restores the balance when a buy is voided', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 1_000_000,
      });
      const investmentId = await createInvestment();
      const buy = await trade(
        investmentId,
        wallet.id,
        'buy',
        2,
        100_000,
      ).expect(201);

      await authed(ctx, admin)
        .post(
          `/investments/${investmentId}/transactions/${buy.body.data.id}/void`,
        )
        .expect(200);

      expect(await balance(wallet.id)).toBe(1_000_000);
    });

    it('rejects a buy that no longer fits the remaining balance with 409', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 300_000,
      });
      const investmentId = await createInvestment();

      await trade(investmentId, wallet.id, 'buy', 2, 100_000).expect(201);

      const res = await trade(investmentId, wallet.id, 'buy', 2, 100_000);

      expect(res.status).toBe(409);
      expect(await balance(wallet.id)).toBe(100_000);
    });

    it('does not touch any wallet for an opening holding', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 1_000_000,
      });
      const res = await authed(ctx, admin).post('/investments').send({
        owner_type: 'household',
        asset_type: 'emas',
        asset_name: 'Emas Lama',
        unit: 'gram',
        opening_quantity: 15,
        opening_price: 1_000_000,
      });

      expect(res.status).toBe(201);
      expect(await balance(wallet.id)).toBe(1_000_000);
    });
  });
});
