import { randomUUID } from 'node:crypto';
import {
  authed,
  createAdmin,
  createMember,
  registerActor,
  type Actor,
} from '../support/actors';
import { createWallet, TODAY } from '../support/builders';
import {
  closeTestApp,
  createTestApp,
  type TestContext,
} from '../support/test-app';

describe('Investments (feature)', () => {
  let ctx: TestContext;
  let admin: Actor;
  let member: Actor;
  let outsider: Actor;
  let wallet: { id: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await createAdmin(ctx, 'Admin');
    member = await createMember(ctx, admin, 'Member');
    outsider = await createAdmin(ctx, 'Outsider');
    // Pembelian sekarang memotong saldo wallet, jadi saldo harus cukup untuk seluruh test.
    wallet = await createWallet(ctx, admin, { initial_balance: 1_000_000_000 });
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  const createInvestment = async (
    actor: Actor,
    overrides: Record<string, unknown> = {},
  ) => {
    const res = await authed(ctx, actor)
      .post('/investments')
      .send({
        owner_type: 'household',
        asset_type: 'emas',
        asset_name: 'Emas Antam',
        unit: 'gram',
        ...overrides,
      })
      .expect(201);

    return res.body.data as { id: string };
  };

  const trade = (
    actor: Actor,
    investmentId: string,
    body: Record<string, unknown>,
    walletId = wallet.id,
  ) =>
    authed(ctx, actor)
      .post(`/investments/${investmentId}/transactions`)
      .send({ wallet_id: walletId, date: TODAY, ...body });

  const findInList = async (actor: Actor, id: string) =>
    (await authed(ctx, actor).get('/investments')).body.data.find(
      (i: { id: string }) => i.id === id,
    );

  describe('POST /investments', () => {
    it('creates a household investment with no holding and no price', async () => {
      const res = await authed(ctx, admin).post('/investments').send({
        owner_type: 'household',
        asset_type: 'emas',
        asset_name: 'Emas Antam',
        unit: 'gram',
      });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        owner_household_id: admin.householdId,
        owner_user_id: null,
        asset_type: 'emas',
        asset_name: 'Emas Antam',
        unit: 'gram',
        latest_price_per_unit: null,
        quantity_held: 0,
      });
    });

    it('records the initial price as the first valuation', async () => {
      const inv = await createInvestment(admin, { initial_price: 1_000_000 });

      expect((await findInList(admin, inv.id)).latest_price_per_unit).toBe(
        1_000_000,
      );
    });

    it('lets a member create a personal investment', async () => {
      const res = await authed(ctx, member).post('/investments').send({
        owner_type: 'user',
        asset_type: 'crypto',
        asset_name: 'BTC',
        unit: 'btc',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.owner_user_id).toBe(member.id);
    });

    it('forbids a member from creating a household investment', async () => {
      const res = await authed(ctx, member).post('/investments').send({
        owner_type: 'household',
        asset_type: 'emas',
        asset_name: 'X',
        unit: 'gram',
      });

      expect(res.status).toBe(403);
    });

    it('forbids a user without a household', async () => {
      const lone = await registerActor(ctx, 'Lone');
      const res = await authed(ctx, lone).post('/investments').send({
        owner_type: 'user',
        asset_type: 'emas',
        asset_name: 'X',
        unit: 'gram',
      });

      expect(res.status).toBe(403);
    });

    it.each([
      ['invalid asset_type', { asset_type: 'tanah' }],
      ['missing asset_name', { asset_name: undefined }],
      ['missing unit', { unit: undefined }],
      ['negative initial_price', { initial_price: -1 }],
      ['invalid owner_type', { owner_type: 'alien' }],
    ])('rejects %s with 400', async (_label, override) => {
      const res = await authed(ctx, admin)
        .post('/investments')
        .send({
          owner_type: 'household',
          asset_type: 'emas',
          asset_name: 'X',
          unit: 'gram',
          ...override,
        });

      expect(res.status).toBe(400);
      expect(res.body.rc).toBe('01');
    });

    it('requires authentication', async () => {
      const res = await ctx.http.post('/investments').send({});

      expect(res.status).toBe(401);
    });
  });

  describe('GET /investments', () => {
    it('shows household and own personal investments only', async () => {
      const household = await createInvestment(admin);
      const adminPersonal = await createInvestment(admin, {
        owner_type: 'user',
      });
      const memberPersonal = await createInvestment(member, {
        owner_type: 'user',
      });
      const foreign = await createInvestment(outsider);

      const res = await authed(ctx, member).get('/investments');
      const ids = res.body.data.map((i: { id: string }) => i.id);

      expect(res.status).toBe(200);
      expect(ids).toContain(household.id);
      expect(ids).toContain(memberPersonal.id);
      expect(ids).not.toContain(adminPersonal.id);
      expect(ids).not.toContain(foreign.id);
    });
  });

  describe('transactions', () => {
    it('records a buy and raises the quantity held', async () => {
      const inv = await createInvestment(admin);
      const res = await trade(admin, inv.id, {
        type: 'buy',
        quantity: 10,
        price: 1_000_000,
      });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        investment_id: inv.id,
        wallet_id: wallet.id,
        type: 'buy',
        quantity: 10,
        price: 1_000_000,
        status: 'active',
        correction_of_id: null,
      });
      expect((await findInList(admin, inv.id)).quantity_held).toBe(10);
    });

    it('records a sell and lowers the quantity held', async () => {
      const inv = await createInvestment(admin);

      await trade(admin, inv.id, {
        type: 'buy',
        quantity: 10,
        price: 100_000,
      }).expect(201);
      await trade(admin, inv.id, {
        type: 'sell',
        quantity: 4,
        price: 120_000,
      }).expect(201);

      expect((await findInList(admin, inv.id)).quantity_held).toBe(6);
    });

    it('supports fractional quantities', async () => {
      const inv = await createInvestment(admin, {
        asset_type: 'crypto',
        unit: 'btc',
      });

      await trade(admin, inv.id, {
        type: 'buy',
        quantity: 0.5,
        price: 100_000,
      }).expect(201);
      await trade(admin, inv.id, {
        type: 'sell',
        quantity: 0.25,
        price: 100_000,
      }).expect(201);

      expect((await findInList(admin, inv.id)).quantity_held).toBeCloseTo(
        0.25,
        8,
      );
    });

    it('rejects selling more than is held with 409', async () => {
      const inv = await createInvestment(admin);

      await trade(admin, inv.id, {
        type: 'buy',
        quantity: 2,
        price: 100_000,
      }).expect(201);

      const res = await trade(admin, inv.id, {
        type: 'sell',
        quantity: 3,
        price: 100_000,
      });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Insufficient holding/);
    });

    it('rejects selling something never bought with 409', async () => {
      const inv = await createInvestment(admin);
      const res = await trade(admin, inv.id, {
        type: 'sell',
        quantity: 1,
        price: 100_000,
      });

      expect(res.status).toBe(409);
    });

    it('rejects a buy larger than the wallet balance with 409', async () => {
      const poor = await createWallet(ctx, admin, {
        name: 'Miskin',
        initial_balance: 1_000,
      });
      const inv = await createInvestment(admin);
      const res = await trade(
        admin,
        inv.id,
        { type: 'buy', quantity: 1, price: 5_000 },
        poor.id,
      );

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Insufficient balance/);
    });

    it('forbids a wallet of another household with 403', async () => {
      const foreignWallet = await createWallet(ctx, outsider, {
        name: 'Asing',
      });
      const inv = await createInvestment(admin);
      const res = await trade(
        admin,
        inv.id,
        { type: 'buy', quantity: 1, price: 1_000 },
        foreignWallet.id,
      );

      expect(res.status).toBe(403);
    });

    it('forbids another household from trading or listing with 403', async () => {
      const inv = await createInvestment(admin);
      const foreignWallet = await createWallet(ctx, outsider, {
        name: 'Asing',
      });

      expect(
        (
          await trade(
            outsider,
            inv.id,
            { type: 'buy', quantity: 1, price: 1_000 },
            foreignWallet.id,
          )
        ).status,
      ).toBe(403);
      expect(
        (await authed(ctx, outsider).get(`/investments/${inv.id}/transactions`))
          .status,
      ).toBe(403);
    });

    it('lists transactions of an investment', async () => {
      const inv = await createInvestment(admin);

      await trade(admin, inv.id, {
        type: 'buy',
        quantity: 1,
        price: 1_000,
      }).expect(201);
      await trade(admin, inv.id, {
        type: 'buy',
        quantity: 2,
        price: 1_000,
      }).expect(201);

      const res = await authed(ctx, member).get(
        `/investments/${inv.id}/transactions`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('returns 404 for an unknown investment', async () => {
      const res = await trade(admin, randomUUID(), {
        type: 'buy',
        quantity: 1,
        price: 1_000,
      });

      expect(res.status).toBe(404);
    });

    it.each([
      ['invalid type', { type: 'hold' }],
      ['zero quantity', { quantity: 0 }],
      ['zero price', { price: 0 }],
      ['non-numeric quantity', { quantity: 'banyak' }],
      ['missing date', { date: undefined }],
    ])('rejects %s with 400', async (_label, override) => {
      const inv = await createInvestment(admin);
      const res = await authed(ctx, admin)
        .post(`/investments/${inv.id}/transactions`)
        .send({
          wallet_id: wallet.id,
          type: 'buy',
          quantity: 1,
          price: 1_000,
          date: TODAY,
          ...override,
        });

      expect(res.status).toBe(400);
    });
  });

  describe('valuations', () => {
    it('adds a valuation and lists it', async () => {
      const inv = await createInvestment(admin);
      const res = await authed(ctx, admin)
        .post(`/investments/${inv.id}/valuations`)
        .send({ price_per_unit: 1_250_000 });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        investment_id: inv.id,
        price_per_unit: 1_250_000,
        source: 'manual',
      });

      const list = await authed(ctx, member).get(
        `/investments/${inv.id}/valuations`,
      );

      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);
    });

    it('reflects the newest valuation as the latest price', async () => {
      const inv = await createInvestment(admin, { initial_price: 100 });

      await authed(ctx, admin)
        .post(`/investments/${inv.id}/valuations`)
        .send({ price_per_unit: 150 })
        .expect(201);

      expect((await findInList(admin, inv.id)).latest_price_per_unit).toBe(150);
    });

    it('rejects a negative price with 400', async () => {
      const inv = await createInvestment(admin);
      const res = await authed(ctx, admin)
        .post(`/investments/${inv.id}/valuations`)
        .send({ price_per_unit: -1 });

      expect(res.status).toBe(400);
    });

    it('forbids another household with 403', async () => {
      const inv = await createInvestment(admin);
      const post = await authed(ctx, outsider)
        .post(`/investments/${inv.id}/valuations`)
        .send({ price_per_unit: 1 });
      const get = await authed(ctx, outsider).get(
        `/investments/${inv.id}/valuations`,
      );

      expect(post.status).toBe(403);
      expect(get.status).toBe(403);
    });
  });
});
