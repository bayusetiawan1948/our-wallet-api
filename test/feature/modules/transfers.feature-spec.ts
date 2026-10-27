import { randomUUID } from 'node:crypto';
import {
  authed,
  createAdmin,
  createMember,
  type Actor,
} from '../support/actors';
import { createWallet, getWalletBalance, TODAY } from '../support/builders';
import {
  closeTestApp,
  createTestApp,
  type TestContext,
} from '../support/test-app';

describe('Transfers (feature)', () => {
  let ctx: TestContext;
  let admin: Actor;
  let member: Actor;
  let outsider: Actor;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await createAdmin(ctx, 'Admin');
    member = await createMember(ctx, admin, 'Member');
    outsider = await createAdmin(ctx, 'Outsider');
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  const transfer = (actor: Actor, body: Record<string, unknown>) =>
    authed(ctx, actor)
      .post('/transfers')
      .send({ date: TODAY, ...body });

  describe('POST /transfers', () => {
    it('moves money between wallets of the same household', async () => {
      const from = await createWallet(ctx, admin, {
        name: 'Asal',
        initial_balance: 100_000,
      });
      const to = await createWallet(ctx, admin, {
        name: 'Tujuan',
        initial_balance: 10_000,
      });
      const res = await transfer(admin, {
        from_wallet_id: from.id,
        to_wallet_id: to.id,
        amount: 40_000,
      });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        from_wallet_id: from.id,
        to_wallet_id: to.id,
        amount: 40_000,
        fee: 0,
        status: 'active',
        correction_of_id: null,
      });
      expect(await getWalletBalance(ctx, admin, from.id)).toBe(60_000);
      expect(await getWalletBalance(ctx, admin, to.id)).toBe(50_000);
    });

    it('charges the fee to the source wallet only', async () => {
      const from = await createWallet(ctx, admin, {
        name: 'Asal',
        initial_balance: 100_000,
      });
      const to = await createWallet(ctx, admin, {
        name: 'Tujuan',
        initial_balance: 0,
      });

      await transfer(admin, {
        from_wallet_id: from.id,
        to_wallet_id: to.id,
        amount: 40_000,
        fee: 2_500,
      }).expect(201);

      expect(await getWalletBalance(ctx, admin, from.id)).toBe(57_500);
      expect(await getWalletBalance(ctx, admin, to.id)).toBe(40_000);
    });

    it('rejects when amount plus fee exceeds the balance with 409', async () => {
      const from = await createWallet(ctx, admin, {
        name: 'Asal',
        initial_balance: 10_000,
      });
      const to = await createWallet(ctx, admin, {
        name: 'Tujuan',
        initial_balance: 0,
      });
      const res = await transfer(admin, {
        from_wallet_id: from.id,
        to_wallet_id: to.id,
        amount: 10_000,
        fee: 1,
      });

      expect(res.status).toBe(409);
      expect(await getWalletBalance(ctx, admin, from.id)).toBe(10_000);
      expect(await getWalletBalance(ctx, admin, to.id)).toBe(0);
    });

    it('rejects the same source and destination with 400', async () => {
      const wallet = await createWallet(ctx, admin);
      const res = await transfer(admin, {
        from_wallet_id: wallet.id,
        to_wallet_id: wallet.id,
        amount: 1_000,
      });

      expect(res.status).toBe(400);
    });

    it('rejects a destination wallet of another household with 403', async () => {
      const from = await createWallet(ctx, admin, { name: 'Asal' });
      const foreign = await createWallet(ctx, outsider, { name: 'Asing' });
      const res = await transfer(admin, {
        from_wallet_id: from.id,
        to_wallet_id: foreign.id,
        amount: 1_000,
      });

      expect(res.status).toBe(403);
    });

    it('forbids a source wallet of another household with 403', async () => {
      const mine = await createWallet(ctx, admin, { name: 'Milik Kami' });
      const foreign = await createWallet(ctx, outsider, { name: 'Asing' });
      const res = await transfer(outsider, {
        from_wallet_id: mine.id,
        to_wallet_id: foreign.id,
        amount: 1_000,
      });

      expect(res.status).toBe(403);
    });

    it('returns 404 for an unknown destination wallet', async () => {
      const from = await createWallet(ctx, admin, { name: 'Asal' });
      const res = await transfer(admin, {
        from_wallet_id: from.id,
        to_wallet_id: randomUUID(),
        amount: 1_000,
      });

      expect(res.status).toBe(404);
    });

    it('lets a member transfer between household wallets', async () => {
      const from = await createWallet(ctx, admin, {
        name: 'Asal',
        initial_balance: 50_000,
      });
      const to = await createWallet(ctx, admin, {
        name: 'Tujuan',
        initial_balance: 0,
      });
      const res = await transfer(member, {
        from_wallet_id: from.id,
        to_wallet_id: to.id,
        amount: 5_000,
      });

      expect(res.status).toBe(201);
    });

    it.each([
      ['zero amount', { amount: 0 }],
      ['negative amount', { amount: -1 }],
      ['negative fee', { fee: -1 }],
      ['non-uuid from_wallet_id', { from_wallet_id: 'abc' }],
      ['missing date', { date: undefined }],
    ])('rejects %s with 400', async (_label, override) => {
      const from = await createWallet(ctx, admin, { name: 'Asal' });
      const to = await createWallet(ctx, admin, { name: 'Tujuan' });
      const res = await authed(ctx, admin)
        .post('/transfers')
        .send({
          from_wallet_id: from.id,
          to_wallet_id: to.id,
          amount: 1_000,
          date: TODAY,
          ...override,
        });

      expect(res.status).toBe(400);
      expect(res.body.rc).toBe('01');
    });

    it('requires authentication', async () => {
      const res = await ctx.http.post('/transfers').send({});

      expect(res.status).toBe(401);
    });
  });

  describe('GET /transfers', () => {
    it('lists transfers touching accessible wallets only', async () => {
      const from = await createWallet(ctx, admin, {
        name: 'Asal',
        initial_balance: 100_000,
      });
      const to = await createWallet(ctx, admin, { name: 'Tujuan' });
      const foreignFrom = await createWallet(ctx, outsider, {
        name: 'A',
        initial_balance: 100_000,
      });
      const foreignTo = await createWallet(ctx, outsider, { name: 'B' });
      const mine = await transfer(admin, {
        from_wallet_id: from.id,
        to_wallet_id: to.id,
        amount: 1_000,
      });
      const theirs = await transfer(outsider, {
        from_wallet_id: foreignFrom.id,
        to_wallet_id: foreignTo.id,
        amount: 1_000,
      });

      const res = await authed(ctx, member).get('/transfers');

      expect(res.status).toBe(200);

      const ids = res.body.data.map((t: { id: string }) => t.id);

      expect(ids).toContain(mine.body.data.id);
      expect(ids).not.toContain(theirs.body.data.id);
    });

    it('filters by wallet_id', async () => {
      const a = await createWallet(ctx, admin, {
        name: 'A',
        initial_balance: 100_000,
      });
      const b = await createWallet(ctx, admin, { name: 'B' });
      const c = await createWallet(ctx, admin, { name: 'C' });
      const ab = await transfer(admin, {
        from_wallet_id: a.id,
        to_wallet_id: b.id,
        amount: 1_000,
      });

      await transfer(admin, {
        from_wallet_id: a.id,
        to_wallet_id: c.id,
        amount: 1_000,
      }).expect(201);

      const res = await authed(ctx, admin).get(`/transfers?wallet_id=${b.id}`);

      expect(res.body.data.map((t: { id: string }) => t.id)).toEqual([
        ab.body.data.id,
      ]);
    });

    it('forbids filtering by a wallet of another household with 403', async () => {
      const wallet = await createWallet(ctx, admin);
      const res = await authed(ctx, outsider).get(
        `/transfers?wallet_id=${wallet.id}`,
      );

      expect(res.status).toBe(403);
    });

    it('rejects a non-uuid wallet_id with 400', async () => {
      const res = await authed(ctx, admin).get('/transfers?wallet_id=abc');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /transfers/:id/void', () => {
    it('voids a transfer and restores both balances', async () => {
      const from = await createWallet(ctx, admin, {
        name: 'Asal',
        initial_balance: 100_000,
      });
      const to = await createWallet(ctx, admin, {
        name: 'Tujuan',
        initial_balance: 0,
      });
      const created = await transfer(admin, {
        from_wallet_id: from.id,
        to_wallet_id: to.id,
        amount: 30_000,
        fee: 1_000,
      });

      const res = await authed(ctx, admin).post(
        `/transfers/${created.body.data.id}/void`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('void');
      expect(await getWalletBalance(ctx, admin, from.id)).toBe(100_000);
      expect(await getWalletBalance(ctx, admin, to.id)).toBe(0);
    });

    it('rejects voiding twice with 409', async () => {
      const from = await createWallet(ctx, admin, {
        name: 'Asal',
        initial_balance: 10_000,
      });
      const to = await createWallet(ctx, admin, { name: 'Tujuan' });
      const created = await transfer(admin, {
        from_wallet_id: from.id,
        to_wallet_id: to.id,
        amount: 1_000,
      });

      await authed(ctx, admin)
        .post(`/transfers/${created.body.data.id}/void`)
        .expect(200);

      const res = await authed(ctx, admin).post(
        `/transfers/${created.body.data.id}/void`,
      );

      expect(res.status).toBe(409);
    });

    it('returns 404 for an unknown transfer', async () => {
      const res = await authed(ctx, admin).post(
        `/transfers/${randomUUID()}/void`,
      );

      expect(res.status).toBe(404);
    });

    it('forbids another household with 403', async () => {
      const from = await createWallet(ctx, admin, {
        name: 'Asal',
        initial_balance: 10_000,
      });
      const to = await createWallet(ctx, admin, { name: 'Tujuan' });
      const created = await transfer(admin, {
        from_wallet_id: from.id,
        to_wallet_id: to.id,
        amount: 1_000,
      });
      const res = await authed(ctx, outsider).post(
        `/transfers/${created.body.data.id}/void`,
      );

      expect(res.status).toBe(403);
    });
  });
});
