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

describe('Investments management (feature)', () => {
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
        asset_type: 'saham',
        asset_name: 'BBCA',
        unit: 'lot',
        ...overrides,
      })
      .expect(201);

    return res.body.data as { id: string };
  };

  const findInList = async (actor: Actor, id: string) =>
    (await authed(ctx, actor).get('/investments')).body.data.find(
      (i: { id: string }) => i.id === id,
    );

  const trade = (
    actor: Actor,
    investmentId: string,
    type: 'buy' | 'sell',
    quantity: number,
    price = 100_000,
  ) =>
    authed(ctx, actor)
      .post(`/investments/${investmentId}/transactions`)
      .send({ wallet_id: wallet.id, type, quantity, price, date: TODAY });

  const voidTx = (actor: Actor, investmentId: string, transactionId: string) =>
    authed(ctx, actor).post(
      `/investments/${investmentId}/transactions/${transactionId}/void`,
    );

  describe('opening holding (aset yang sudah dimiliki)', () => {
    it('creates an asset together with its opening holding', async () => {
      const res = await authed(ctx, admin).post('/investments').send({
        owner_type: 'household',
        asset_type: 'reksadana',
        asset_name: 'RDPU Sucor',
        unit: 'unit',
        initial_price: 1_500,
        opening_quantity: 1_250.5,
        opening_price: 1_480,
        opening_date: '2025-03-10',
      });

      expect(res.status).toBe(201);

      const found = await findInList(admin, res.body.data.id);

      expect(found).toMatchObject({
        quantity_held: 1_250.5,
        latest_price_per_unit: 1_500,
      });

      const txs = await authed(ctx, admin).get(
        `/investments/${res.body.data.id}/transactions`,
      );

      expect(txs.body.data).toHaveLength(1);
      expect(txs.body.data[0]).toMatchObject({
        type: 'opening',
        wallet_id: null,
        quantity: 1_250.5,
        price: 1_480,
        date: '2025-03-10',
        status: 'active',
      });
    });

    it('requires an opening price together with the quantity', async () => {
      const res = await authed(ctx, admin).post('/investments').send({
        owner_type: 'household',
        asset_type: 'emas',
        asset_name: 'Emas',
        unit: 'gram',
        opening_quantity: 10,
      });

      expect(res.status).toBe(400);
    });

    it('adds an opening holding to an existing asset without a wallet', async () => {
      const inv = await createInvestment(admin, {
        asset_type: 'emas',
        unit: 'gram',
      });
      const res = await authed(ctx, admin)
        .post(`/investments/${inv.id}/transactions`)
        .send({
          type: 'opening',
          quantity: 15,
          price: 1_100_000,
          date: '2024-01-01',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ type: 'opening', wallet_id: null });
      expect((await findInList(admin, inv.id)).quantity_held).toBe(15);
    });

    it('ignores a wallet that is sent along with an opening holding', async () => {
      const inv = await createInvestment(admin);
      const res = await authed(ctx, admin)
        .post(`/investments/${inv.id}/transactions`)
        .send({
          wallet_id: wallet.id,
          type: 'opening',
          quantity: 5,
          price: 1_000,
          date: TODAY,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.wallet_id).toBeNull();
    });

    it('allows a zero average price for an opening holding (mis. hadiah)', async () => {
      const inv = await createInvestment(admin);
      const res = await authed(ctx, admin)
        .post(`/investments/${inv.id}/transactions`)
        .send({ type: 'opening', quantity: 1, price: 0, date: TODAY });

      expect(res.status).toBe(201);
    });

    it('still rejects a zero price for buy and sell', async () => {
      const inv = await createInvestment(admin);

      expect((await trade(admin, inv.id, 'buy', 1, 0)).status).toBe(400);
    });

    it('lets a holding from an opening be sold, and blocks selling more than that', async () => {
      const inv = await createInvestment(admin);

      await authed(ctx, admin)
        .post(`/investments/${inv.id}/transactions`)
        .send({ type: 'opening', quantity: 10, price: 100_000, date: TODAY })
        .expect(201);

      await trade(admin, inv.id, 'sell', 4).expect(201);

      expect((await trade(admin, inv.id, 'sell', 7)).status).toBe(409);
      expect((await findInList(admin, inv.id)).quantity_held).toBe(6);
    });

    it('rejects an invalid transaction type with 400', async () => {
      const inv = await createInvestment(admin);
      const res = await authed(ctx, admin)
        .post(`/investments/${inv.id}/transactions`)
        .send({ type: 'hold', quantity: 1, price: 1, date: TODAY });

      expect(res.status).toBe(400);
    });

    it('still requires a wallet for buy and sell with 400', async () => {
      const inv = await createInvestment(admin);
      const res = await authed(ctx, admin)
        .post(`/investments/${inv.id}/transactions`)
        .send({ type: 'buy', quantity: 1, price: 1_000, date: TODAY });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /investments/:id', () => {
    it('renames the asset and changes its unit and category', async () => {
      const inv = await createInvestment(admin);
      const res = await authed(ctx, admin)
        .patch(`/investments/${inv.id}`)
        .send({ asset_name: 'BBRI', unit: 'lembar', asset_type: 'reksadana' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: inv.id,
        asset_name: 'BBRI',
        unit: 'lembar',
        asset_type: 'reksadana',
      });
    });

    it('keeps holdings and the latest price when editing', async () => {
      const inv = await createInvestment(admin, {
        initial_price: 9_000,
        opening_quantity: 20,
        opening_price: 8_000,
      });
      const res = await authed(ctx, admin)
        .patch(`/investments/${inv.id}`)
        .send({ asset_name: 'Nama Baru' });

      expect(res.body.data).toMatchObject({
        quantity_held: 20,
        latest_price_per_unit: 9_000,
      });
    });

    it('lets an admin move an asset from household to personal and back', async () => {
      const inv = await createInvestment(admin);
      const toUser = await authed(ctx, admin)
        .patch(`/investments/${inv.id}`)
        .send({ owner_type: 'user' });

      expect(toUser.body.data).toMatchObject({
        owner_user_id: admin.id,
        owner_household_id: null,
      });

      const hiddenFromMember = await authed(ctx, member).get('/investments');

      expect(
        hiddenFromMember.body.data.map((i: { id: string }) => i.id),
      ).not.toContain(inv.id);

      const toHousehold = await authed(ctx, admin)
        .patch(`/investments/${inv.id}`)
        .send({ owner_type: 'household' });

      expect(toHousehold.body.data).toMatchObject({
        owner_user_id: null,
        owner_household_id: admin.householdId,
      });
    });

    it('lets an admin assign the asset to another household member', async () => {
      const inv = await createInvestment(admin);
      const res = await authed(ctx, admin)
        .patch(`/investments/${inv.id}`)
        .send({ owner_type: 'user', owner_user_id: member.id });

      expect(res.status).toBe(200);
      expect(res.body.data.owner_user_id).toBe(member.id);
    });

    it('rejects an owner who is not in the household with 400', async () => {
      const inv = await createInvestment(admin);
      const res = await authed(ctx, admin)
        .patch(`/investments/${inv.id}`)
        .send({ owner_type: 'user', owner_user_id: outsider.id });

      expect(res.status).toBe(400);
    });

    it('lets a member edit their own personal asset', async () => {
      const inv = await createInvestment(member, { owner_type: 'user' });
      const res = await authed(ctx, member)
        .patch(`/investments/${inv.id}`)
        .send({ asset_name: 'Punya Member', unit: 'unit' });

      expect(res.status).toBe(200);
      expect(res.body.data.asset_name).toBe('Punya Member');
    });

    it('forbids a member from changing ownership with 403', async () => {
      const inv = await createInvestment(member, { owner_type: 'user' });
      const res = await authed(ctx, member)
        .patch(`/investments/${inv.id}`)
        .send({ owner_type: 'household' });

      expect(res.status).toBe(403);
    });

    it('forbids a member from editing a household asset with 403', async () => {
      const inv = await createInvestment(admin);
      const res = await authed(ctx, member)
        .patch(`/investments/${inv.id}`)
        .send({ asset_name: 'Hack' });

      expect(res.status).toBe(403);
    });

    it('forbids another household with 403', async () => {
      const inv = await createInvestment(admin);
      const res = await authed(ctx, outsider)
        .patch(`/investments/${inv.id}`)
        .send({ asset_name: 'Hack' });

      expect(res.status).toBe(403);
    });

    it('returns 404 for an unknown asset', async () => {
      const res = await authed(ctx, admin)
        .patch(`/investments/${randomUUID()}`)
        .send({ asset_name: 'x' });

      expect(res.status).toBe(404);
    });

    it.each([
      ['empty name', { asset_name: '' }],
      ['invalid asset_type', { asset_type: 'tanah' }],
      ['empty unit', { unit: '' }],
      ['invalid owner_type', { owner_type: 'alien' }],
      ['non-uuid owner_user_id', { owner_user_id: 'abc' }],
    ])('rejects %s with 400', async (_label, body) => {
      const inv = await createInvestment(admin);
      const res = await authed(ctx, admin)
        .patch(`/investments/${inv.id}`)
        .send(body);

      expect(res.status).toBe(400);
    });

    it('requires authentication', async () => {
      const res = await ctx.http.patch(`/investments/${randomUUID()}`).send({});

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /investments/:id', () => {
    it('deletes an asset without transactions', async () => {
      const inv = await createInvestment(admin);
      const res = await authed(ctx, admin).delete(`/investments/${inv.id}`);

      expect(res.status).toBe(200);
      expect(await findInList(admin, inv.id)).toBeUndefined();
    });

    it('refuses while an active transaction exists with 409', async () => {
      const inv = await createInvestment(admin);

      await trade(admin, inv.id, 'buy', 1).expect(201);

      const res = await authed(ctx, admin).delete(`/investments/${inv.id}`);

      expect(res.status).toBe(409);
      expect(await findInList(admin, inv.id)).toBeDefined();
    });

    it('refuses while an opening holding is still active', async () => {
      const inv = await createInvestment(admin, {
        opening_quantity: 5,
        opening_price: 1_000,
      });
      const res = await authed(ctx, admin).delete(`/investments/${inv.id}`);

      expect(res.status).toBe(409);
    });

    it('allows deleting after every transaction has been voided', async () => {
      const inv = await createInvestment(admin);
      const buy = await trade(admin, inv.id, 'buy', 1).expect(201);

      await voidTx(admin, inv.id, buy.body.data.id).expect(200);

      const res = await authed(ctx, admin).delete(`/investments/${inv.id}`);

      expect(res.status).toBe(200);
    });

    it('forbids a member on a household asset with 403', async () => {
      const inv = await createInvestment(admin);
      const res = await authed(ctx, member).delete(`/investments/${inv.id}`);

      expect(res.status).toBe(403);
    });

    it('lets a member delete their own personal asset', async () => {
      const inv = await createInvestment(member, { owner_type: 'user' });
      const res = await authed(ctx, member).delete(`/investments/${inv.id}`);

      expect(res.status).toBe(200);
    });

    it('forbids another household with 403', async () => {
      const inv = await createInvestment(admin);
      const res = await authed(ctx, outsider).delete(`/investments/${inv.id}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 for an unknown asset', async () => {
      const res = await authed(ctx, admin).delete(
        `/investments/${randomUUID()}`,
      );

      expect(res.status).toBe(404);
    });

    it('returns 400 for a malformed id', async () => {
      const res = await authed(ctx, admin).delete('/investments/abc');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /investments/:id/transactions/:transactionId/void', () => {
    it('voids a buy: keeps the record, lowers holdings, restores the wallet', async () => {
      const inv = await createInvestment(admin);
      const before = await getWalletBalance(ctx, admin, wallet.id);
      const buy = await trade(admin, inv.id, 'buy', 3, 100_000).expect(201);
      const res = await voidTx(admin, inv.id, buy.body.data.id);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: buy.body.data.id,
        status: 'void',
      });
      expect((await findInList(admin, inv.id)).quantity_held).toBe(0);
      expect(await getWalletBalance(ctx, admin, wallet.id)).toBe(before);

      const txs = await authed(ctx, admin).get(
        `/investments/${inv.id}/transactions`,
      );

      expect(txs.body.data).toHaveLength(1);
    });

    it('voids an opening holding', async () => {
      const inv = await createInvestment(admin, {
        opening_quantity: 8,
        opening_price: 1_000,
      });
      const txs = await authed(ctx, admin).get(
        `/investments/${inv.id}/transactions`,
      );
      const res = await voidTx(admin, inv.id, txs.body.data[0].id);

      expect(res.status).toBe(200);
      expect((await findInList(admin, inv.id)).quantity_held).toBe(0);
    });

    it('voids a sell and gives the holdings back', async () => {
      const inv = await createInvestment(admin);

      await trade(admin, inv.id, 'buy', 5).expect(201);

      const sell = await trade(admin, inv.id, 'sell', 2).expect(201);

      await voidTx(admin, inv.id, sell.body.data.id).expect(200);

      expect((await findInList(admin, inv.id)).quantity_held).toBe(5);
    });

    it('rejects voiding a buy that later sales depend on with 409', async () => {
      const inv = await createInvestment(admin);
      const buy = await trade(admin, inv.id, 'buy', 5).expect(201);

      await trade(admin, inv.id, 'sell', 4).expect(201);

      const res = await voidTx(admin, inv.id, buy.body.data.id);

      expect(res.status).toBe(409);
      expect((await findInList(admin, inv.id)).quantity_held).toBe(1);
    });

    it('rejects voiding a sell when the wallet can no longer return the proceeds', async () => {
      const poor = await createWallet(ctx, admin, {
        name: 'Tipis',
        initial_balance: 200_000,
      });
      const inv = await createInvestment(admin);

      await authed(ctx, admin)
        .post(`/investments/${inv.id}/transactions`)
        .send({ type: 'opening', quantity: 10, price: 100_000, date: TODAY })
        .expect(201);

      const sell = await authed(ctx, admin)
        .post(`/investments/${inv.id}/transactions`)
        .send({
          wallet_id: poor.id,
          type: 'sell',
          quantity: 5,
          price: 100_000,
          date: TODAY,
        })
        .expect(201);

      // saldo wallet naik jadi 700k; habiskan dengan pembelian aset lain
      const other = await createInvestment(admin, { asset_name: 'Lain' });

      await authed(ctx, admin)
        .post(`/investments/${other.id}/transactions`)
        .send({
          wallet_id: poor.id,
          type: 'buy',
          quantity: 6,
          price: 100_000,
          date: TODAY,
        })
        .expect(201);

      const res = await voidTx(admin, inv.id, sell.body.data.id);

      expect(res.status).toBe(409);
    });

    it('rejects voiding twice with 409', async () => {
      const inv = await createInvestment(admin);
      const buy = await trade(admin, inv.id, 'buy', 1).expect(201);

      await voidTx(admin, inv.id, buy.body.data.id).expect(200);

      expect((await voidTx(admin, inv.id, buy.body.data.id)).status).toBe(409);
    });

    it('returns 404 for an unknown transaction', async () => {
      const inv = await createInvestment(admin);
      const res = await voidTx(admin, inv.id, randomUUID());

      expect(res.status).toBe(404);
    });

    it('returns 404 when the transaction belongs to another asset', async () => {
      const a = await createInvestment(admin, { asset_name: 'A' });
      const b = await createInvestment(admin, { asset_name: 'B' });
      const buy = await trade(admin, a.id, 'buy', 1).expect(201);
      const res = await voidTx(admin, b.id, buy.body.data.id);

      expect(res.status).toBe(404);
    });

    it('forbids another household with 403', async () => {
      const inv = await createInvestment(admin);
      const buy = await trade(admin, inv.id, 'buy', 1).expect(201);
      const res = await voidTx(outsider, inv.id, buy.body.data.id);

      expect(res.status).toBe(403);
    });

    it('returns 400 for a malformed transaction id', async () => {
      const inv = await createInvestment(admin);
      const res = await voidTx(admin, inv.id, 'abc');

      expect(res.status).toBe(400);
    });
  });
});
