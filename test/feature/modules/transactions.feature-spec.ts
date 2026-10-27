import { randomUUID } from 'node:crypto';
import {
  authed,
  createAdmin,
  createMember,
  type Actor,
} from '../support/actors';
import {
  createCategory,
  createTransaction,
  createWallet,
  getWalletBalance,
  TODAY,
} from '../support/builders';
import {
  closeTestApp,
  createTestApp,
  type TestContext,
} from '../support/test-app';

describe('Transactions (feature)', () => {
  let ctx: TestContext;
  let admin: Actor;
  let member: Actor;
  let outsider: Actor;
  let category: { id: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await createAdmin(ctx, 'Admin');
    member = await createMember(ctx, admin, 'Member');
    outsider = await createAdmin(ctx, 'Outsider');
    category = await createCategory(ctx, admin, { name: 'Umum', type: 'both' });
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  describe('POST /transactions', () => {
    it('records an expense and lowers the wallet balance', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 100_000,
      });
      const res = await authed(ctx, admin).post('/transactions').send({
        wallet_id: wallet.id,
        category_id: category.id,
        type: 'expense',
        amount: 25_000,
        date: TODAY,
        note: 'Makan siang',
      });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        wallet_id: wallet.id,
        category_id: category.id,
        owner_id: admin.id,
        recorded_by: admin.id,
        type: 'expense',
        amount: 25_000,
        note: 'Makan siang',
        status: 'active',
        correction_of_id: null,
      });
      expect(await getWalletBalance(ctx, admin, wallet.id)).toBe(75_000);
    });

    it('records an income and raises the wallet balance', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 100_000,
      });

      await createTransaction(ctx, admin, wallet.id, category.id, {
        type: 'income',
        amount: 50_000,
      });

      expect(await getWalletBalance(ctx, admin, wallet.id)).toBe(150_000);
    });

    it('lets a member record on a household wallet', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 100_000,
      });
      const tx = await createTransaction(ctx, member, wallet.id, category.id, {
        amount: 1_000,
      });

      expect(tx.status).toBe('active');
    });

    it('rejects an expense bigger than the balance with 409', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 10_000,
      });
      const res = await authed(ctx, admin).post('/transactions').send({
        wallet_id: wallet.id,
        category_id: category.id,
        type: 'expense',
        amount: 10_001,
        date: TODAY,
      });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Insufficient balance/);
      expect(await getWalletBalance(ctx, admin, wallet.id)).toBe(10_000);
    });

    it('allows spending the exact balance', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 10_000,
      });

      await createTransaction(ctx, admin, wallet.id, category.id, {
        amount: 10_000,
      });

      expect(await getWalletBalance(ctx, admin, wallet.id)).toBe(0);
    });

    it('rejects a category from another household with 400', async () => {
      const wallet = await createWallet(ctx, admin);
      const foreign = await createCategory(ctx, outsider, { name: 'Asing' });
      const res = await authed(ctx, admin).post('/transactions').send({
        wallet_id: wallet.id,
        category_id: foreign.id,
        type: 'expense',
        amount: 1_000,
        date: TODAY,
      });

      expect(res.status).toBe(400);
    });

    it('forbids a wallet of another household with 403', async () => {
      const wallet = await createWallet(ctx, admin);
      const res = await authed(ctx, outsider).post('/transactions').send({
        wallet_id: wallet.id,
        category_id: category.id,
        type: 'expense',
        amount: 1_000,
        date: TODAY,
      });

      expect(res.status).toBe(403);
    });

    it('returns 404 for an unknown wallet', async () => {
      const res = await authed(ctx, admin).post('/transactions').send({
        wallet_id: randomUUID(),
        category_id: category.id,
        type: 'expense',
        amount: 1_000,
        date: TODAY,
      });

      expect(res.status).toBe(404);
    });

    it('forbids a member from recording for another owner without permission', async () => {
      const wallet = await createWallet(ctx, admin);
      const res = await authed(ctx, member).post('/transactions').send({
        wallet_id: wallet.id,
        category_id: category.id,
        owner_id: admin.id,
        type: 'expense',
        amount: 1_000,
        date: TODAY,
      });

      expect(res.status).toBe(403);
    });

    it('allows recording for another owner once the admin grants permission', async () => {
      const wallet = await createWallet(ctx, admin);

      await authed(ctx, admin)
        .patch(`/households/members/${member.id}`)
        .send({ can_edit_others_transactions: true })
        .expect(200);

      const res = await authed(ctx, member).post('/transactions').send({
        wallet_id: wallet.id,
        category_id: category.id,
        owner_id: admin.id,
        type: 'expense',
        amount: 1_000,
        date: TODAY,
      });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        owner_id: admin.id,
        recorded_by: member.id,
      });

      await authed(ctx, admin)
        .patch(`/households/members/${member.id}`)
        .send({ can_edit_others_transactions: false })
        .expect(200);
    });

    it.each([
      ['zero amount', { amount: 0 }],
      ['negative amount', { amount: -5 }],
      ['non-numeric amount', { amount: 'banyak' }],
      ['invalid type', { type: 'transfer' }],
      ['non-uuid wallet_id', { wallet_id: 'abc' }],
      ['missing date', { date: undefined }],
    ])('rejects %s with 400', async (_label, override) => {
      const wallet = await createWallet(ctx, admin);
      const res = await authed(ctx, admin)
        .post('/transactions')
        .send({
          wallet_id: wallet.id,
          category_id: category.id,
          type: 'expense',
          amount: 1_000,
          date: TODAY,
          ...override,
        });

      expect(res.status).toBe(400);
      expect(res.body.rc).toBe('01');
    });

    it('requires authentication', async () => {
      const res = await ctx.http.post('/transactions').send({});

      expect(res.status).toBe(401);
    });
  });

  describe('GET /transactions', () => {
    it('lists transactions of accessible wallets only', async () => {
      const wallet = await createWallet(ctx, admin);
      const foreignWallet = await createWallet(ctx, outsider, {
        name: 'Asing',
      });
      const foreignCategory = await createCategory(ctx, outsider, {
        name: 'Asing',
      });
      const mine = await createTransaction(ctx, admin, wallet.id, category.id);
      const theirs = await createTransaction(
        ctx,
        outsider,
        foreignWallet.id,
        foreignCategory.id,
      );

      const res = await authed(ctx, member).get('/transactions');

      expect(res.status).toBe(200);

      const ids = res.body.data.map((t: { id: string }) => t.id);

      expect(ids).toContain(mine.id);
      expect(ids).not.toContain(theirs.id);
    });

    it('filters by wallet_id and category_id', async () => {
      const walletA = await createWallet(ctx, admin, { name: 'A' });
      const walletB = await createWallet(ctx, admin, { name: 'B' });
      const otherCategory = await createCategory(ctx, admin, {
        name: 'Lain',
        type: 'both',
      });
      const inA = await createTransaction(ctx, admin, walletA.id, category.id);
      const inB = await createTransaction(
        ctx,
        admin,
        walletB.id,
        otherCategory.id,
      );

      const byWallet = await authed(ctx, admin).get(
        `/transactions?wallet_id=${walletA.id}`,
      );

      const walletIdsInA = new Set(
        byWallet.body.data.map((t: { wallet_id: string }) => t.wallet_id),
      );

      expect(byWallet.body.data.map((t: { id: string }) => t.id)).toContain(
        inA.id,
      );
      expect(byWallet.body.data.map((t: { id: string }) => t.id)).not.toContain(
        inB.id,
      );
      expect([...walletIdsInA]).toEqual([walletA.id]);

      const byCategory = await authed(ctx, admin).get(
        `/transactions?wallet_id=${walletB.id}&category_id=${otherCategory.id}`,
      );

      expect(byCategory.body.data.map((t: { id: string }) => t.id)).toContain(
        inB.id,
      );
      expect(
        byCategory.body.data.every(
          (t: { category_id: string }) => t.category_id === otherCategory.id,
        ),
      ).toBe(true);
    });

    it('filters by date range', async () => {
      const wallet = await createWallet(ctx, admin);
      const old = await createTransaction(ctx, admin, wallet.id, category.id, {
        date: '2020-01-15',
      });
      const recent = await createTransaction(
        ctx,
        admin,
        wallet.id,
        category.id,
        { date: '2020-03-15' },
      );

      const res = await authed(ctx, admin).get(
        `/transactions?wallet_id=${wallet.id}&from=2020-03-01&to=2020-03-31`,
      );
      const ids = res.body.data.map((t: { id: string }) => t.id);

      expect(ids).toContain(recent.id);
      expect(ids).not.toContain(old.id);
    });

    it('forbids filtering by a wallet of another household with 403', async () => {
      const wallet = await createWallet(ctx, admin);
      const res = await authed(ctx, outsider).get(
        `/transactions?wallet_id=${wallet.id}`,
      );

      expect(res.status).toBe(403);
    });

    it('rejects a non-uuid wallet_id with 400', async () => {
      const res = await authed(ctx, admin).get('/transactions?wallet_id=abc');

      expect(res.status).toBe(400);
    });

    it('does not include transfers (no double counting in cashflow)', async () => {
      const from = await createWallet(ctx, admin, {
        name: 'Asal',
        initial_balance: 100_000,
      });
      const to = await createWallet(ctx, admin, {
        name: 'Tujuan',
        initial_balance: 0,
      });

      await authed(ctx, admin)
        .post('/transfers')
        .send({
          from_wallet_id: from.id,
          to_wallet_id: to.id,
          amount: 20_000,
          date: TODAY,
        })
        .expect(201);

      const res = await authed(ctx, admin).get(
        `/transactions?wallet_id=${to.id}`,
      );

      expect(res.body.data).toEqual([]);
    });
  });

  describe('POST /transactions/:id/void', () => {
    it('voids a transaction, keeps the record and restores the balance', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 100_000,
      });
      const tx = await createTransaction(ctx, admin, wallet.id, category.id, {
        amount: 30_000,
      });
      const res = await authed(ctx, admin).post(`/transactions/${tx.id}/void`);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: tx.id, status: 'void' });
      expect(await getWalletBalance(ctx, admin, wallet.id)).toBe(100_000);

      const list = await authed(ctx, admin).get(
        `/transactions?wallet_id=${wallet.id}`,
      );
      const found = list.body.data.find((t: { id: string }) => t.id === tx.id);

      expect(found.status).toBe('void');
    });

    it('rejects voiding twice with 409', async () => {
      const wallet = await createWallet(ctx, admin);
      const tx = await createTransaction(ctx, admin, wallet.id, category.id);

      await authed(ctx, admin).post(`/transactions/${tx.id}/void`).expect(200);

      const res = await authed(ctx, admin).post(`/transactions/${tx.id}/void`);

      expect(res.status).toBe(409);
    });

    it('returns 404 for an unknown transaction', async () => {
      const res = await authed(ctx, admin).post(
        `/transactions/${randomUUID()}/void`,
      );

      expect(res.status).toBe(404);
    });

    it('forbids another household with 403', async () => {
      const wallet = await createWallet(ctx, admin);
      const tx = await createTransaction(ctx, admin, wallet.id, category.id);
      const res = await authed(ctx, outsider).post(
        `/transactions/${tx.id}/void`,
      );

      expect(res.status).toBe(403);
    });
  });

  describe('POST /transactions/:id/correct', () => {
    it('voids the original and creates a linked replacement', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 100_000,
      });
      const original = await createTransaction(
        ctx,
        admin,
        wallet.id,
        category.id,
        { amount: 30_000 },
      );
      const res = await authed(ctx, admin)
        .post(`/transactions/${original.id}/correct`)
        .send({
          wallet_id: wallet.id,
          category_id: category.id,
          type: 'expense',
          amount: 20_000,
          date: TODAY,
          note: 'Koreksi',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        correction_of_id: original.id,
        amount: 20_000,
        status: 'active',
      });
      expect(await getWalletBalance(ctx, admin, wallet.id)).toBe(80_000);

      const list = await authed(ctx, admin).get(
        `/transactions?wallet_id=${wallet.id}`,
      );
      const old = list.body.data.find(
        (t: { id: string }) => t.id === original.id,
      );

      expect(old.status).toBe('void');
    });

    it('rejects correcting a voided transaction with 409', async () => {
      const wallet = await createWallet(ctx, admin);
      const tx = await createTransaction(ctx, admin, wallet.id, category.id);

      await authed(ctx, admin).post(`/transactions/${tx.id}/void`).expect(200);

      const res = await authed(ctx, admin)
        .post(`/transactions/${tx.id}/correct`)
        .send({
          wallet_id: wallet.id,
          category_id: category.id,
          type: 'expense',
          amount: 1_000,
          date: TODAY,
        });

      expect(res.status).toBe(409);
    });

    it('rejects an invalid body with 400', async () => {
      const wallet = await createWallet(ctx, admin);
      const tx = await createTransaction(ctx, admin, wallet.id, category.id);
      const res = await authed(ctx, admin)
        .post(`/transactions/${tx.id}/correct`)
        .send({ amount: 0 });

      expect(res.status).toBe(400);
    });

    it('forbids another household with 403', async () => {
      const wallet = await createWallet(ctx, admin);
      const tx = await createTransaction(ctx, admin, wallet.id, category.id);
      const foreignWallet = await createWallet(ctx, outsider, {
        name: 'Asing',
      });
      const foreignCategory = await createCategory(ctx, outsider, {
        name: 'Asing',
      });
      const res = await authed(ctx, outsider)
        .post(`/transactions/${tx.id}/correct`)
        .send({
          wallet_id: foreignWallet.id,
          category_id: foreignCategory.id,
          type: 'expense',
          amount: 1_000,
          date: TODAY,
        });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /transactions/encroachment-check', () => {
    it('reports no shortfall when nothing is reserved', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 100_000,
      });
      const res = await authed(ctx, admin).get(
        `/transactions/encroachment-check?wallet_id=${wallet.id}&amount=50000`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ shortfall: 0, reserved_total: 0 });
    });

    it('reports the shortfall when the amount exceeds the free balance', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 100_000,
      });
      const res = await authed(ctx, admin).get(
        `/transactions/encroachment-check?wallet_id=${wallet.id}&amount=150000`,
      );

      expect(res.body.data.shortfall).toBe(50_000);
    });

    it.each([
      ['missing amount', (id: string) => `wallet_id=${id}`],
      ['zero amount', (id: string) => `wallet_id=${id}&amount=0`],
      ['non-uuid wallet', () => 'wallet_id=abc&amount=10'],
    ])('rejects %s with 400', async (_label, qs) => {
      const wallet = await createWallet(ctx, admin);
      const res = await authed(ctx, admin).get(
        `/transactions/encroachment-check?${qs(wallet.id)}`,
      );

      expect(res.status).toBe(400);
    });

    it('forbids a wallet of another household with 403', async () => {
      const wallet = await createWallet(ctx, admin);
      const res = await authed(ctx, outsider).get(
        `/transactions/encroachment-check?wallet_id=${wallet.id}&amount=1`,
      );

      expect(res.status).toBe(403);
    });
  });
});
