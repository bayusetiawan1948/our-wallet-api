import { randomUUID } from 'node:crypto';
import {
  authed,
  createAdmin,
  createMember,
  registerActor,
  type Actor,
} from '../support/actors';
import {
  createGoal,
  createReservation,
  createWallet,
} from '../support/builders';
import {
  closeTestApp,
  createTestApp,
  type TestContext,
} from '../support/test-app';

describe('Goals (feature)', () => {
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
    wallet = await createWallet(ctx, admin, { initial_balance: 10_000_000 });
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  const findInList = async (actor: Actor, id: string) =>
    (await authed(ctx, actor).get('/goals')).body.data.find(
      (g: { id: string }) => g.id === id,
    );

  describe('POST /goals', () => {
    it('creates a household goal that starts active with no progress', async () => {
      const res = await authed(ctx, admin).post('/goals').send({
        owner_type: 'household',
        name: 'Liburan Bali',
        target_amount: 5_000_000,
        target_date: '2031-06-01',
      });

      expect(res.status).toBe(201);

      const goal = await findInList(admin, res.body.data.id);

      expect(goal).toMatchObject({
        owner_household_id: admin.householdId,
        owner_user_id: null,
        name: 'Liburan Bali',
        target_amount: 5_000_000,
        target_date: '2031-06-01',
        status: 'active',
        total_reserved: 0,
        progress_percent: 0,
        remaining_amount: 5_000_000,
        is_completed: false,
      });
    });

    it('lets a member create a personal goal', async () => {
      const res = await authed(ctx, member)
        .post('/goals')
        .send({ owner_type: 'user', name: 'Laptop', target_amount: 1_000 });

      expect(res.status).toBe(201);
    });

    it('forbids a member from creating a household goal', async () => {
      const res = await authed(ctx, member)
        .post('/goals')
        .send({ owner_type: 'household', name: 'X', target_amount: 1_000 });

      expect(res.status).toBe(403);
    });

    it('forbids a user without a household', async () => {
      const lone = await registerActor(ctx, 'Lone');
      const res = await authed(ctx, lone)
        .post('/goals')
        .send({ owner_type: 'user', name: 'X', target_amount: 1_000 });

      expect(res.status).toBe(403);
    });

    it.each([
      ['zero target', { target_amount: 0 }],
      ['missing name', { name: undefined }],
      ['invalid owner_type', { owner_type: 'alien' }],
      ['non-numeric target', { target_amount: 'banyak' }],
    ])('rejects %s with 400', async (_label, override) => {
      const res = await authed(ctx, admin)
        .post('/goals')
        .send({
          owner_type: 'household',
          name: 'X',
          target_amount: 1_000,
          ...override,
        });

      expect(res.status).toBe(400);
      expect(res.body.rc).toBe('01');
    });

    it('requires authentication', async () => {
      const res = await ctx.http.post('/goals').send({});

      expect(res.status).toBe(401);
    });
  });

  describe('GET /goals', () => {
    it('shows household and own personal goals only', async () => {
      const household = await createGoal(ctx, admin);
      const adminPersonal = await createGoal(ctx, admin, {
        owner_type: 'user',
      });
      const memberPersonal = await createGoal(ctx, member, {
        owner_type: 'user',
      });
      const foreign = await createGoal(ctx, outsider);

      const res = await authed(ctx, member).get('/goals');
      const ids = res.body.data.map((g: { id: string }) => g.id);

      expect(res.status).toBe(200);
      expect(ids).toContain(household.id);
      expect(ids).toContain(memberPersonal.id);
      expect(ids).not.toContain(adminPersonal.id);
      expect(ids).not.toContain(foreign.id);
    });
  });

  describe('progress', () => {
    it('derives progress from reservations', async () => {
      const goal = await createGoal(ctx, admin, { target_amount: 100_000 });

      await createReservation(
        ctx,
        admin,
        wallet.id,
        { goal_id: goal.id },
        25_000,
      );

      expect(await findInList(admin, goal.id)).toMatchObject({
        total_reserved: 25_000,
        progress_percent: 25,
        remaining_amount: 75_000,
        is_completed: false,
      });
    });

    it('sums several reservations and completes at the target', async () => {
      const goal = await createGoal(ctx, admin, { target_amount: 100_000 });

      await createReservation(
        ctx,
        admin,
        wallet.id,
        { goal_id: goal.id },
        60_000,
      );
      await createReservation(
        ctx,
        admin,
        wallet.id,
        { goal_id: goal.id },
        40_000,
      );

      expect(await findInList(admin, goal.id)).toMatchObject({
        total_reserved: 100_000,
        progress_percent: 100,
        remaining_amount: 0,
        is_completed: true,
      });
    });

    it('caps progress at 100 percent when over-reserved', async () => {
      const goal = await createGoal(ctx, admin, { target_amount: 100_000 });

      await createReservation(
        ctx,
        admin,
        wallet.id,
        { goal_id: goal.id },
        150_000,
      );

      expect(await findInList(admin, goal.id)).toMatchObject({
        progress_percent: 100,
        remaining_amount: 0,
        is_completed: true,
      });
    });
  });

  describe('PATCH /goals/:id', () => {
    it('updates name, target and date', async () => {
      const goal = await createGoal(ctx, admin);
      const res = await authed(ctx, admin).patch(`/goals/${goal.id}`).send({
        name: 'Baru',
        target_amount: 200_000,
        target_date: '2032-01-01',
      });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        name: 'Baru',
        target_amount: 200_000,
        target_date: '2032-01-01',
      });
    });

    it.each(['completed', 'cancelled', 'active'])(
      'sets the status to %s',
      async (status) => {
        const goal = await createGoal(ctx, admin);
        const res = await authed(ctx, admin)
          .patch(`/goals/${goal.id}`)
          .send({ status });

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe(status);
      },
    );

    it('marks a manually completed goal as completed even without reservations', async () => {
      const goal = await createGoal(ctx, admin);
      const res = await authed(ctx, admin)
        .patch(`/goals/${goal.id}`)
        .send({ status: 'completed' });

      expect(res.body.data.is_completed).toBe(true);
    });

    it('rejects an invalid status with 400', async () => {
      const goal = await createGoal(ctx, admin);
      const res = await authed(ctx, admin)
        .patch(`/goals/${goal.id}`)
        .send({ status: 'paused' });

      expect(res.status).toBe(400);
    });

    it('forbids another household with 403', async () => {
      const goal = await createGoal(ctx, admin);
      const res = await authed(ctx, outsider)
        .patch(`/goals/${goal.id}`)
        .send({ name: 'hack' });

      expect(res.status).toBe(403);
    });

    it('returns 404 for an unknown goal', async () => {
      const res = await authed(ctx, admin)
        .patch(`/goals/${randomUUID()}`)
        .send({ name: 'x' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /goals/:id', () => {
    it('deletes a goal', async () => {
      const goal = await createGoal(ctx, admin);
      const res = await authed(ctx, admin).delete(`/goals/${goal.id}`);

      expect(res.status).toBe(200);
      expect(await findInList(admin, goal.id)).toBeUndefined();
    });

    it('forbids another household with 403', async () => {
      const goal = await createGoal(ctx, admin);
      const res = await authed(ctx, outsider).delete(`/goals/${goal.id}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /goals/:id/reservations and /encroachments', () => {
    it('returns reservations of the goal to a household member', async () => {
      const goal = await createGoal(ctx, admin);

      await createReservation(
        ctx,
        admin,
        wallet.id,
        { goal_id: goal.id },
        8_000,
      );

      const res = await authed(ctx, member).get(
        `/goals/${goal.id}/reservations`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        goal_id: goal.id,
        reserved_amount: 8_000,
      });
    });

    it('returns an empty list of encroachments for a fresh goal', async () => {
      const goal = await createGoal(ctx, admin);
      const res = await authed(ctx, admin).get(
        `/goals/${goal.id}/encroachments`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('forbids another household from reading reservations', async () => {
      const goal = await createGoal(ctx, admin);

      await createReservation(
        ctx,
        admin,
        wallet.id,
        { goal_id: goal.id },
        8_000,
      );

      const res = await authed(ctx, outsider).get(
        `/goals/${goal.id}/reservations`,
      );

      expect(res.status).toBe(403);
    });

    it('forbids another household from reading encroachments', async () => {
      const goal = await createGoal(ctx, admin);
      const res = await authed(ctx, outsider).get(
        `/goals/${goal.id}/encroachments`,
      );

      expect(res.status).toBe(403);
    });
  });
});
