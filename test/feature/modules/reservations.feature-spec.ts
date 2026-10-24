import { randomUUID } from 'node:crypto';
import { authed, createAdmin, createMember, type Actor } from '../support/actors';
import {
  createBudget,
  createCategory,
  createGoal,
  createReservation,
  createWallet,
  getWalletBalance,
  TODAY,
} from '../support/builders';
import { closeTestApp, createTestApp, type TestContext } from '../support/test-app';

describe('Reservations (feature)', () => {
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

  describe('POST /reservations', () => {
    it('reserves wallet money for a budget with manual allocation by default', async () => {
      const wallet = await createWallet(ctx, admin);
      const budget = await createBudget(ctx, admin, category.id);
      const res = await authed(ctx, admin)
        .post('/reservations')
        .send({ wallet_id: wallet.id, budget_id: budget.id, reserved_amount: 200_000 });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        wallet_id: wallet.id,
        budget_id: budget.id,
        goal_id: null,
        reserved_amount: 200_000,
        allocation_method: 'manual',
        allocation_config: null,
      });
    });

    it('reserves wallet money for a goal with a custom allocation', async () => {
      const wallet = await createWallet(ctx, admin);
      const goal = await createGoal(ctx, admin);
      const res = await authed(ctx, admin).post('/reservations').send({
        wallet_id: wallet.id,
        goal_id: goal.id,
        reserved_amount: 50_000,
        allocation_method: 'percentage',
        allocation_config: { percent: 10 },
      });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        goal_id: goal.id,
        budget_id: null,
        allocation_method: 'percentage',
        allocation_config: { percent: 10 },
      });
    });

    it('lets a member reserve on a household wallet', async () => {
      const wallet = await createWallet(ctx, admin);
      const goal = await createGoal(ctx, admin);
      const res = await authed(ctx, member)
        .post('/reservations')
        .send({ wallet_id: wallet.id, goal_id: goal.id, reserved_amount: 1_000 });

      expect(res.status).toBe(201);
    });

    it('forbids a wallet of another household with 403', async () => {
      const foreignWallet = await createWallet(ctx, outsider, { name: 'Asing' });
      const goal = await createGoal(ctx, admin);
      const res = await authed(ctx, admin)
        .post('/reservations')
        .send({ wallet_id: foreignWallet.id, goal_id: goal.id, reserved_amount: 1_000 });

      expect(res.status).toBe(403);
    });

    it('returns 404 for an unknown wallet', async () => {
      const goal = await createGoal(ctx, admin);
      const res = await authed(ctx, admin)
        .post('/reservations')
        .send({ wallet_id: randomUUID(), goal_id: goal.id, reserved_amount: 1_000 });

      expect(res.status).toBe(404);
    });

    it('rejects a goal from another household', async () => {
      const wallet = await createWallet(ctx, admin);
      const foreignGoal = await createGoal(ctx, outsider);
      const res = await authed(ctx, admin)
        .post('/reservations')
        .send({ wallet_id: wallet.id, goal_id: foreignGoal.id, reserved_amount: 1_000 });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it.each([
      ['neither budget_id nor goal_id', {}],
      ['negative amount', { reserved_amount: -1 }],
      ['non-numeric amount', { reserved_amount: 'banyak' }],
      ['invalid allocation_method', { allocation_method: 'random' }],
      ['non-object allocation_config', { allocation_config: 'x' }],
      ['non-uuid goal_id', { goal_id: 'abc' }],
    ])('rejects %s with 400', async (_label, override) => {
      const wallet = await createWallet(ctx, admin);
      const goal = await createGoal(ctx, admin);
      const body: Record<string, unknown> = {
        wallet_id: wallet.id,
        goal_id: goal.id,
        reserved_amount: 1_000,
        ...override,
      };

      if (_label === 'neither budget_id nor goal_id') {
        delete body.goal_id;
      }

      const res = await authed(ctx, admin).post('/reservations').send(body);

      expect(res.status).toBe(400);
      expect(res.body.rc).toBe('01');
    });

    it('requires authentication', async () => {
      const res = await ctx.http.post('/reservations').send({});

      expect(res.status).toBe(401);
    });
  });

  describe('GET /reservations', () => {
    it('lists the reservations of a wallet', async () => {
      const wallet = await createWallet(ctx, admin);
      const otherWallet = await createWallet(ctx, admin, { name: 'Lain' });
      const goal = await createGoal(ctx, admin);

      await createReservation(ctx, admin, wallet.id, { goal_id: goal.id }, 1_000);
      await createReservation(ctx, admin, otherWallet.id, { goal_id: goal.id }, 2_000);

      const res = await authed(ctx, member).get(`/reservations?wallet_id=${wallet.id}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].reserved_amount).toBe(1_000);
    });

    it('forbids a wallet of another household with 403', async () => {
      const wallet = await createWallet(ctx, admin);
      const res = await authed(ctx, outsider).get(`/reservations?wallet_id=${wallet.id}`);

      expect(res.status).toBe(403);
    });

    it('rejects a missing wallet_id with a 4xx instead of a server error', async () => {
      const res = await authed(ctx, admin).get('/reservations');

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects a non-uuid wallet_id with a 4xx instead of a server error', async () => {
      const res = await authed(ctx, admin).get('/reservations?wallet_id=abc');

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('DELETE /reservations/:id', () => {
    it('removes a reservation', async () => {
      const wallet = await createWallet(ctx, admin);
      const goal = await createGoal(ctx, admin);
      const reservation = await createReservation(ctx, admin, wallet.id, { goal_id: goal.id });
      const res = await authed(ctx, admin).delete(`/reservations/${reservation.id}`);

      expect(res.status).toBe(200);

      const list = await authed(ctx, admin).get(`/reservations?wallet_id=${wallet.id}`);

      expect(list.body.data).toEqual([]);
    });

    it('returns 404 for an unknown reservation', async () => {
      const res = await authed(ctx, admin).delete(`/reservations/${randomUUID()}`);

      expect(res.status).toBe(404);
    });

    it('forbids another household with 403', async () => {
      const wallet = await createWallet(ctx, admin);
      const goal = await createGoal(ctx, admin);
      const reservation = await createReservation(ctx, admin, wallet.id, { goal_id: goal.id });
      const res = await authed(ctx, outsider).delete(`/reservations/${reservation.id}`);

      expect(res.status).toBe(403);
    });
  });

  describe('free balance and encroachment', () => {
    const setup = async () => {
      const wallet = await createWallet(ctx, admin, { initial_balance: 1_000_000 });
      const budget = await createBudget(ctx, admin, category.id);
      const reservation = await createReservation(
        ctx,
        admin,
        wallet.id,
        { budget_id: budget.id },
        600_000,
      );

      return { wallet, budget, reservation };
    };

    const expense = (walletId: string, amount: number, extra: Record<string, unknown> = {}) =>
      authed(ctx, admin)
        .post('/transactions')
        .send({
          wallet_id: walletId,
          category_id: category.id,
          type: 'expense',
          amount,
          date: TODAY,
          ...extra,
        });

    it('reports reserved total and shortfall in encroachment-check', async () => {
      const { wallet } = await setup();
      const within = await authed(ctx, admin).get(
        `/transactions/encroachment-check?wallet_id=${wallet.id}&amount=300000`,
      );
      const over = await authed(ctx, admin).get(
        `/transactions/encroachment-check?wallet_id=${wallet.id}&amount=500000`,
      );

      expect(within.body.data).toEqual({ shortfall: 0, reserved_total: 600_000 });
      expect(over.body.data).toEqual({ shortfall: 100_000, reserved_total: 600_000 });
    });

    it('lets an expense through when it fits in the free balance', async () => {
      const { wallet } = await setup();
      const res = await expense(wallet.id, 400_000);

      expect(res.status).toBe(201);
    });

    it('demands an encroachment allocation when the free balance is exceeded', async () => {
      const { wallet } = await setup();
      const res = await expense(wallet.id, 500_000);

      expect(res.status).toBe(409);
      expect(res.body.message).toBe('ENCROACHMENT_REQUIRED');
      expect(await getWalletBalance(ctx, admin, wallet.id)).toBe(1_000_000);
    });

    it('applies the encroachment, shrinks the reservation and records the audit trail', async () => {
      const { wallet, budget, reservation } = await setup();
      const res = await expense(wallet.id, 500_000, {
        encroachments: [{ budget_id: budget.id, amount: 100_000 }],
      });

      expect(res.status).toBe(201);
      expect(await getWalletBalance(ctx, admin, wallet.id)).toBe(500_000);

      const reservations = await authed(ctx, admin).get(`/reservations?wallet_id=${wallet.id}`);
      const updated = reservations.body.data.find((r: { id: string }) => r.id === reservation.id);

      expect(updated.reserved_amount).toBe(500_000);

      const encroachments = await authed(ctx, admin).get(`/budgets/${budget.id}/encroachments`);

      expect(encroachments.body.data).toHaveLength(1);
      expect(encroachments.body.data[0]).toMatchObject({
        transaction_id: res.body.data.id,
        wallet_id: wallet.id,
        budget_id: budget.id,
        goal_id: null,
        amount: 100_000,
      });
    });

    it('splits an encroachment across a budget and a goal', async () => {
      const { wallet, budget } = await setup();
      const goal = await createGoal(ctx, admin);

      await createReservation(ctx, admin, wallet.id, { goal_id: goal.id }, 100_000);

      // free = 1_000_000 - 700_000 = 300_000; expense 450_000 → shortfall 150_000
      const res = await expense(wallet.id, 450_000, {
        encroachments: [
          { budget_id: budget.id, amount: 100_000 },
          { goal_id: goal.id, amount: 50_000 },
        ],
      });

      expect(res.status).toBe(201);

      const goalEncroachments = await authed(ctx, admin).get(`/goals/${goal.id}/encroachments`);

      expect(goalEncroachments.body.data).toHaveLength(1);
      expect(goalEncroachments.body.data[0].amount).toBe(50_000);
    });

    it('rejects an allocation that does not match the shortfall with 400', async () => {
      const { wallet, budget } = await setup();
      const res = await expense(wallet.id, 500_000, {
        encroachments: [{ budget_id: budget.id, amount: 50_000 }],
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/must exactly match/);
      expect(await getWalletBalance(ctx, admin, wallet.id)).toBe(1_000_000);
    });

    it('does not leave a transaction behind when the allocation target is invalid', async () => {
      const { wallet } = await setup();
      const unreserved = await createBudget(ctx, admin, category.id, { name: 'Tanpa Reservasi' });
      const res = await expense(wallet.id, 500_000, {
        encroachments: [{ budget_id: unreserved.id, amount: 100_000 }],
      });

      expect(res.status).toBe(400);
      expect(await getWalletBalance(ctx, admin, wallet.id)).toBe(1_000_000);
    });

    it('rejects an invalid allocation item with 400', async () => {
      const { wallet } = await setup();
      const res = await expense(wallet.id, 500_000, {
        encroachments: [{ amount: 100_000 }],
      });

      expect(res.status).toBe(400);
    });
  });
});
