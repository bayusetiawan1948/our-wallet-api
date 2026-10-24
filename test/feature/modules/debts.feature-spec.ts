import { randomUUID } from 'node:crypto';
import { authed, createAdmin, createMember, registerActor, type Actor } from '../support/actors';
import { createWallet, TODAY } from '../support/builders';
import { closeTestApp, createTestApp, type TestContext } from '../support/test-app';

describe('Debts (feature)', () => {
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
    wallet = await createWallet(ctx, admin, { initial_balance: 5_000_000 });
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  const createDebt = async (actor: Actor, overrides: Record<string, unknown> = {}) => {
    const res = await authed(ctx, actor)
      .post('/debts')
      .send({
        owner_type: 'household',
        type: 'utang',
        counterparty: 'Bank ABC',
        principal: 100_000,
        ...overrides,
      })
      .expect(201);

    return res.body.data as { id: string; status: string };
  };

  const pay = (actor: Actor, debtId: string, amount: number, walletId = wallet.id) =>
    authed(ctx, actor)
      .post(`/debts/${debtId}/payments`)
      .send({ wallet_id: walletId, amount, date: TODAY });

  describe('POST /debts', () => {
    it('lets an admin create a household debt with defaults', async () => {
      const res = await authed(ctx, admin).post('/debts').send({
        owner_type: 'household',
        type: 'utang',
        counterparty: 'Bank ABC',
        principal: 250_000,
        due_date: '2030-12-31',
        note: 'KPR',
      });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        owner_household_id: admin.householdId,
        owner_user_id: null,
        type: 'utang',
        counterparty: 'Bank ABC',
        principal: 250_000,
        portion_admin: 0,
        portion_member: 0,
        due_date: '2030-12-31',
        status: 'active',
        note: 'KPR',
      });
    });

    it('stores portions for admin and member', async () => {
      const debt = await authed(ctx, admin).post('/debts').send({
        owner_type: 'household',
        type: 'piutang',
        counterparty: 'Teman',
        principal: 100_000,
        portion_admin: 60_000,
        portion_member: 40_000,
      });

      expect(debt.body.data).toMatchObject({ portion_admin: 60_000, portion_member: 40_000 });
    });

    it('lets a member create a personal debt', async () => {
      const res = await authed(ctx, member).post('/debts').send({
        owner_type: 'user',
        type: 'piutang',
        counterparty: 'Rekan',
        principal: 50_000,
      });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ owner_user_id: member.id, owner_household_id: null });
    });

    it('forbids a member from creating a household debt', async () => {
      const res = await authed(ctx, member).post('/debts').send({
        owner_type: 'household',
        type: 'utang',
        counterparty: 'X',
        principal: 1,
      });

      expect(res.status).toBe(403);
    });

    it('forbids a user without a household', async () => {
      const lone = await registerActor(ctx, 'Lone');
      const res = await authed(ctx, lone).post('/debts').send({
        owner_type: 'user',
        type: 'utang',
        counterparty: 'X',
        principal: 1,
      });

      expect(res.status).toBe(403);
    });

    it.each([
      ['invalid type', { type: 'hibah' }],
      ['invalid owner_type', { owner_type: 'alien' }],
      ['zero principal', { principal: 0 }],
      ['negative portion', { portion_admin: -1 }],
      ['missing counterparty', { counterparty: undefined }],
      ['non-numeric principal', { principal: 'banyak' }],
    ])('rejects %s with 400', async (_label, override) => {
      const res = await authed(ctx, admin)
        .post('/debts')
        .send({
          owner_type: 'household',
          type: 'utang',
          counterparty: 'X',
          principal: 1_000,
          ...override,
        });

      expect(res.status).toBe(400);
      expect(res.body.rc).toBe('01');
    });

    it('requires authentication', async () => {
      const res = await ctx.http.post('/debts').send({});

      expect(res.status).toBe(401);
    });
  });

  describe('GET /debts', () => {
    it('shows household debts and own personal debts only', async () => {
      const household = await createDebt(admin, { counterparty: 'Rumah Tangga' });
      const adminPersonal = await createDebt(admin, { owner_type: 'user', counterparty: 'Pribadi Admin' });
      const memberPersonal = await createDebt(member, { owner_type: 'user', counterparty: 'Pribadi Member' });
      const foreign = await createDebt(outsider, { counterparty: 'Asing' });

      const res = await authed(ctx, member).get('/debts');
      const ids = res.body.data.map((d: { id: string }) => d.id);

      expect(res.status).toBe(200);
      expect(ids).toContain(household.id);
      expect(ids).toContain(memberPersonal.id);
      expect(ids).not.toContain(adminPersonal.id);
      expect(ids).not.toContain(foreign.id);
    });

    it('requires authentication', async () => {
      const res = await ctx.http.get('/debts');

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /debts/:id', () => {
    it('updates fields', async () => {
      const debt = await createDebt(admin);
      const res = await authed(ctx, admin)
        .patch(`/debts/${debt.id}`)
        .send({ counterparty: 'Bank XYZ', principal: 300_000, note: 'diperbarui' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        counterparty: 'Bank XYZ',
        principal: 300_000,
        note: 'diperbarui',
      });
    });

    it('allows a manual cancel and keeps it cancelled', async () => {
      const debt = await createDebt(admin);
      const res = await authed(ctx, admin).patch(`/debts/${debt.id}`).send({ status: 'cancelled' });

      expect(res.body.data.status).toBe('cancelled');
    });

    it('rejects any manual status other than cancelled with 400', async () => {
      const debt = await createDebt(admin);
      const res = await authed(ctx, admin).patch(`/debts/${debt.id}`).send({ status: 'paid' });

      expect(res.status).toBe(400);
    });

    it('recalculates the status when the principal drops to the paid amount', async () => {
      const debt = await createDebt(admin, { principal: 100_000 });

      await pay(admin, debt.id, 40_000).expect(201);

      const res = await authed(ctx, admin).patch(`/debts/${debt.id}`).send({ principal: 40_000 });

      expect(res.body.data.status).toBe('paid');
    });

    it('forbids another household with 403', async () => {
      const debt = await createDebt(admin);
      const res = await authed(ctx, outsider).patch(`/debts/${debt.id}`).send({ note: 'hack' });

      expect(res.status).toBe(403);
    });

    it('forbids a member on an admin personal debt with 403', async () => {
      const debt = await createDebt(admin, { owner_type: 'user' });
      const res = await authed(ctx, member).patch(`/debts/${debt.id}`).send({ note: 'hack' });

      expect(res.status).toBe(403);
    });

    it('returns 404 for an unknown debt', async () => {
      const res = await authed(ctx, admin).patch(`/debts/${randomUUID()}`).send({ note: 'x' });

      expect(res.status).toBe(404);
    });

    it('rejects an invalid body with 400', async () => {
      const debt = await createDebt(admin);
      const res = await authed(ctx, admin).patch(`/debts/${debt.id}`).send({ principal: 0 });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /debts/:id', () => {
    it('deletes a debt without payments', async () => {
      const debt = await createDebt(admin);
      const res = await authed(ctx, admin).delete(`/debts/${debt.id}`);

      expect(res.status).toBe(200);

      const list = await authed(ctx, admin).get('/debts');

      expect(list.body.data.map((d: { id: string }) => d.id)).not.toContain(debt.id);
    });

    it('refuses while an active payment exists, then allows after voiding it', async () => {
      const debt = await createDebt(admin);
      const payment = await pay(admin, debt.id, 10_000).expect(201);
      const blocked = await authed(ctx, admin).delete(`/debts/${debt.id}`);

      expect(blocked.status).toBe(409);

      await authed(ctx, admin)
        .post(`/debts/${debt.id}/payments/${payment.body.data.id}/void`)
        .expect(200);

      const allowed = await authed(ctx, admin).delete(`/debts/${debt.id}`);

      expect(allowed.status).toBe(200);
    });

    it('forbids another household with 403', async () => {
      const debt = await createDebt(admin);
      const res = await authed(ctx, outsider).delete(`/debts/${debt.id}`);

      expect(res.status).toBe(403);
    });
  });

  describe('payments', () => {
    it('moves the status active → partial → paid as payments arrive', async () => {
      const debt = await createDebt(admin, { principal: 100_000 });
      const first = await pay(admin, debt.id, 40_000);

      expect(first.status).toBe(201);
      expect(first.body.data).toMatchObject({
        debt_id: debt.id,
        wallet_id: wallet.id,
        amount: 40_000,
        status: 'active',
        correction_of_id: null,
      });

      let list = await authed(ctx, admin).get('/debts');

      expect(list.body.data.find((d: { id: string }) => d.id === debt.id).status).toBe('partial');

      await pay(admin, debt.id, 60_000).expect(201);

      list = await authed(ctx, admin).get('/debts');

      expect(list.body.data.find((d: { id: string }) => d.id === debt.id).status).toBe('paid');
    });

    it('goes back to partial and active when payments are voided', async () => {
      const debt = await createDebt(admin, { principal: 100_000 });
      const a = await pay(admin, debt.id, 40_000);
      const b = await pay(admin, debt.id, 60_000);
      const statusOf = async () =>
        (await authed(ctx, admin).get('/debts')).body.data.find(
          (d: { id: string }) => d.id === debt.id,
        ).status;

      expect(await statusOf()).toBe('paid');

      const voided = await authed(ctx, admin).post(
        `/debts/${debt.id}/payments/${b.body.data.id}/void`,
      );

      expect(voided.status).toBe(200);
      expect(voided.body.data.status).toBe('void');
      expect(await statusOf()).toBe('partial');

      await authed(ctx, admin).post(`/debts/${debt.id}/payments/${a.body.data.id}/void`).expect(200);

      expect(await statusOf()).toBe('active');
    });

    it('rejects voiding the same payment twice with 409', async () => {
      const debt = await createDebt(admin);
      const payment = await pay(admin, debt.id, 1_000);

      await authed(ctx, admin)
        .post(`/debts/${debt.id}/payments/${payment.body.data.id}/void`)
        .expect(200);

      const res = await authed(ctx, admin).post(
        `/debts/${debt.id}/payments/${payment.body.data.id}/void`,
      );

      expect(res.status).toBe(409);
    });

    it('returns 404 when the payment belongs to another debt', async () => {
      const debtA = await createDebt(admin);
      const debtB = await createDebt(admin);
      const payment = await pay(admin, debtA.id, 1_000);
      const res = await authed(ctx, admin).post(
        `/debts/${debtB.id}/payments/${payment.body.data.id}/void`,
      );

      expect(res.status).toBe(404);
    });

    it('rejects paying a utang with more than the wallet balance with 409', async () => {
      const poor = await createWallet(ctx, admin, { name: 'Miskin', initial_balance: 1_000 });
      const debt = await createDebt(admin, { type: 'utang' });
      const res = await pay(admin, debt.id, 5_000, poor.id);

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Insufficient balance/);
    });

    it('accepts receiving a piutang payment into a low-balance wallet', async () => {
      const poor = await createWallet(ctx, admin, { name: 'Miskin', initial_balance: 1_000 });
      const debt = await createDebt(admin, { type: 'piutang' });
      const res = await pay(admin, debt.id, 5_000, poor.id);

      expect(res.status).toBe(201);
    });

    it('forbids paying from a wallet of another household with 403', async () => {
      const foreignWallet = await createWallet(ctx, outsider, { name: 'Asing' });
      const debt = await createDebt(admin);
      const res = await pay(admin, debt.id, 1_000, foreignWallet.id);

      expect(res.status).toBe(403);
    });

    it('forbids another household from paying or listing with 403', async () => {
      const debt = await createDebt(admin);
      const foreignWallet = await createWallet(ctx, outsider, { name: 'Asing' });

      expect((await pay(outsider, debt.id, 1_000, foreignWallet.id)).status).toBe(403);
      expect((await authed(ctx, outsider).get(`/debts/${debt.id}/payments`)).status).toBe(403);
    });

    it('lists payments of a debt', async () => {
      const debt = await createDebt(admin);

      await pay(admin, debt.id, 1_000).expect(201);
      await pay(admin, debt.id, 2_000).expect(201);

      const res = await authed(ctx, member).get(`/debts/${debt.id}/payments`);

      expect(res.status).toBe(200);
      expect(res.body.data.map((p: { amount: number }) => p.amount).sort()).toEqual([1_000, 2_000]);
    });

    it.each([
      ['zero amount', { amount: 0 }],
      ['non-uuid wallet_id', { wallet_id: 'abc' }],
      ['missing date', { date: undefined }],
    ])('rejects %s with 400', async (_label, override) => {
      const debt = await createDebt(admin);
      const res = await authed(ctx, admin)
        .post(`/debts/${debt.id}/payments`)
        .send({ wallet_id: wallet.id, amount: 1_000, date: TODAY, ...override });

      expect(res.status).toBe(400);
    });

    it('returns 404 for a payment on an unknown debt', async () => {
      const res = await pay(admin, randomUUID(), 1_000);

      expect(res.status).toBe(404);
    });
  });
});
