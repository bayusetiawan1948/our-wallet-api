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
  type: 'income' | 'expense';
  amount: number;
  note: string;
  source: string | null;
  debt_id: string | null;
  debt_payment_id: string | null;
}

describe('Debt ledger entries (feature)', () => {
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
      ).body.data as (LedgerRow & { id: string; status: string })[]
    ).filter((row) => row.source !== null);

  const createDebt = (overrides: Record<string, unknown>) =>
    authed(ctx, admin)
      .post('/debts')
      .send({
        owner_type: 'household',
        type: 'utang',
        counterparty: 'Budi',
        principal: 500_000,
        ...overrides,
      });

  const pay = (debtId: string, walletId: string, amount: number) =>
    authed(ctx, admin)
      .post(`/debts/${debtId}/payments`)
      .send({ wallet_id: walletId, amount, date: TODAY });

  describe('creating a debt', () => {
    it('adds the principal to the wallet for a new utang and records a referenced entry', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 1_000_000,
      });
      const res = await createDebt({ wallet_id: wallet.id }).expect(201);

      expect(await balance(wallet.id)).toBe(1_500_000);
      expect(await ledger(wallet.id)).toEqual([
        expect.objectContaining({
          type: 'income',
          amount: 500_000,
          note: 'Menerima pinjaman · Budi',
          source: 'debt_create',
          debt_id: res.body.data.id,
        }),
      ]);
    });

    it('deducts the principal from the wallet for a new piutang', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 1_000_000,
      });

      await createDebt({
        type: 'piutang',
        counterparty: 'Sari',
        principal: 200_000,
        wallet_id: wallet.id,
      }).expect(201);

      expect(await balance(wallet.id)).toBe(800_000);
      expect(await ledger(wallet.id)).toEqual([
        expect.objectContaining({
          type: 'expense',
          note: 'Meminjamkan dana · Sari',
        }),
      ]);
    });

    it('rejects a piutang larger than the wallet balance', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 100_000,
      });
      const res = await createDebt({
        type: 'piutang',
        principal: 200_000,
        wallet_id: wallet.id,
      });

      expect(res.status).toBe(409);
      expect(await balance(wallet.id)).toBe(100_000);
    });

    it('requires a wallet unless the debt already existed before using the app', async () => {
      const res = await createDebt({});

      expect(res.status).toBe(400);
    });

    it('leaves the balance untouched for an existing (opening) debt and tracks what was already paid', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 1_000_000,
      });
      const res = await createDebt({
        is_opening: true,
        principal: 1_000_000,
        opening_paid: 300_000,
      }).expect(201);

      expect(res.body.data).toMatchObject({
        wallet_id: null,
        is_opening: true,
        opening_paid: 300_000,
        status: 'partial',
      });
      expect(await balance(wallet.id)).toBe(1_000_000);

      // Sisa 700.000: pembayaran berikutnya menggerakkan saldo seperti biasa.
      await pay(res.body.data.id, wallet.id, 700_000).expect(201);

      expect(await balance(wallet.id)).toBe(300_000);

      const list = await authed(ctx, admin).get('/debts');

      expect(
        list.body.data.find((d: { id: string }) => d.id === res.body.data.id)
          .status,
      ).toBe('paid');
    });

    it('rejects paying more than what remains of an opening debt', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 1_000_000,
      });
      const res = await createDebt({
        is_opening: true,
        principal: 100_000,
        opening_paid: 80_000,
      }).expect(201);

      expect((await pay(res.body.data.id, wallet.id, 30_000)).status).toBe(409);
    });
  });

  describe('payments', () => {
    it('records referenced entries for a payment and its void', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 1_000_000,
      });
      const debt = await createDebt({ wallet_id: wallet.id }).expect(201);
      const payment = await pay(debt.body.data.id, wallet.id, 100_000).expect(
        201,
      );

      expect(await balance(wallet.id)).toBe(1_400_000);

      await authed(ctx, admin)
        .post(
          `/debts/${debt.body.data.id}/payments/${payment.body.data.id}/void`,
        )
        .expect(200);

      expect(await balance(wallet.id)).toBe(1_500_000);

      const rows = await ledger(wallet.id);

      expect(rows.map((r) => r.source).sort()).toEqual(
        ['debt_create', 'debt_payment', 'debt_payment_void'].sort(),
      );
      expect(rows.find((r) => r.source === 'debt_payment')).toMatchObject({
        type: 'expense',
        note: 'Pembayaran utang · Budi',
        debt_payment_id: payment.body.data.id,
      });
      expect(rows.find((r) => r.source === 'debt_payment_void')).toMatchObject({
        type: 'income',
        note: 'Pembatalan pembayaran · Budi',
        debt_payment_id: payment.body.data.id,
      });
    });

    it('credits the wallet when a piutang is repaid', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 1_000_000,
      });
      const debt = await createDebt({
        type: 'piutang',
        counterparty: 'Sari',
        principal: 200_000,
        wallet_id: wallet.id,
      }).expect(201);

      await pay(debt.body.data.id, wallet.id, 50_000).expect(201);

      expect(await balance(wallet.id)).toBe(850_000);
      expect(
        (await ledger(wallet.id)).find((r) => r.source === 'debt_payment'),
      ).toMatchObject({
        type: 'income',
        note: 'Pengembalian dana · Sari',
      });
    });

    it('rejects a payment that exceeds the remaining debt', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 1_000_000,
      });
      const debt = await createDebt({
        wallet_id: wallet.id,
        principal: 100_000,
      }).expect(201);

      expect((await pay(debt.body.data.id, wallet.id, 150_000)).status).toBe(
        409,
      );
    });
  });

  describe('revising a debt', () => {
    it('records only the difference when the principal changes', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 1_000_000,
      });
      const debt = await createDebt({ wallet_id: wallet.id }).expect(201);

      await authed(ctx, admin)
        .patch(`/debts/${debt.body.data.id}`)
        .send({ principal: 800_000 })
        .expect(200);

      expect(await balance(wallet.id)).toBe(1_800_000);
      expect(
        (await ledger(wallet.id)).find((r) => r.source === 'debt_revision'),
      ).toMatchObject({
        type: 'income',
        amount: 300_000,
        note: 'Revisi: Menerima pinjaman · Budi',
      });
    });

    it('moves the funds when the wallet changes', async () => {
      const from = await createWallet(ctx, admin, {
        name: 'Lama',
        initial_balance: 1_000_000,
      });
      const to = await createWallet(ctx, admin, {
        name: 'Baru',
        initial_balance: 1_000_000,
      });
      const debt = await createDebt({ wallet_id: from.id }).expect(201);

      await authed(ctx, admin)
        .patch(`/debts/${debt.body.data.id}`)
        .send({ wallet_id: to.id })
        .expect(200);

      expect(await balance(from.id)).toBe(1_000_000);
      expect(await balance(to.id)).toBe(1_500_000);
    });

    it('refuses to lower the principal below what has been paid', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 1_000_000,
      });
      const debt = await createDebt({ wallet_id: wallet.id }).expect(201);

      await pay(debt.body.data.id, wallet.id, 300_000).expect(201);

      const res = await authed(ctx, admin)
        .patch(`/debts/${debt.body.data.id}`)
        .send({ principal: 200_000 });

      expect(res.status).toBe(409);
    });
  });

  describe('cancelling a debt', () => {
    it('reverses the principal with a cancellation entry and keeps the debt as cancelled', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 1_000_000,
      });
      const debt = await createDebt({ wallet_id: wallet.id }).expect(201);

      await authed(ctx, admin)
        .delete(`/debts/${debt.body.data.id}`)
        .expect(200);

      expect(await balance(wallet.id)).toBe(1_000_000);
      expect(
        (await ledger(wallet.id)).find((r) => r.source === 'debt_cancel'),
      ).toMatchObject({
        type: 'expense',
        amount: 500_000,
        note: 'Pembatalan utang/piutang · Budi',
        debt_id: debt.body.data.id,
      });

      const list = await authed(ctx, admin).get('/debts');

      expect(
        list.body.data.find((d: { id: string }) => d.id === debt.body.data.id)
          .status,
      ).toBe('cancelled');
    });

    it('returns the money to the wallet when a piutang is cancelled', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 1_000_000,
      });
      const debt = await createDebt({
        type: 'piutang',
        principal: 200_000,
        wallet_id: wallet.id,
      }).expect(201);

      await authed(ctx, admin)
        .delete(`/debts/${debt.body.data.id}`)
        .expect(200);

      expect(await balance(wallet.id)).toBe(1_000_000);
    });

    it('does not accept payments on a cancelled debt', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 1_000_000,
      });
      const debt = await createDebt({ wallet_id: wallet.id }).expect(201);

      await authed(ctx, admin)
        .delete(`/debts/${debt.body.data.id}`)
        .expect(200);

      expect((await pay(debt.body.data.id, wallet.id, 1_000)).status).toBe(409);
    });
  });

  describe('transactions menu', () => {
    it('refuses to void or correct an entry that comes from a debt', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 1_000_000,
      });
      const category = await createCategory(ctx, admin, { type: 'both' });

      await createDebt({ wallet_id: wallet.id }).expect(201);

      const [entry] = await ledger(wallet.id);
      const voided = await authed(ctx, admin).post(
        `/transactions/${(entry as { id: string }).id}/void`,
      );
      const corrected = await authed(ctx, admin)
        .post(`/transactions/${(entry as { id: string }).id}/correct`)
        .send({
          wallet_id: wallet.id,
          category_id: category.id,
          type: 'income',
          amount: 1,
          date: TODAY,
        });

      expect(voided.status).toBe(409);
      expect(voided.body.message).toMatch(/Utang & Piutang/);
      expect(corrected.status).toBe(409);
      expect(await balance(wallet.id)).toBe(1_500_000);
    });
  });
});
