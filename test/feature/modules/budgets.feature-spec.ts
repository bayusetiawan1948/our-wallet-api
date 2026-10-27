import { randomUUID } from 'node:crypto';
import {
  authed,
  createAdmin,
  createMember,
  registerActor,
  type Actor,
} from '../support/actors';
import {
  createBudget,
  createCategory,
  createReservation,
  createTransaction,
  createWallet,
} from '../support/builders';
import {
  closeTestApp,
  createTestApp,
  type TestContext,
} from '../support/test-app';

describe('Budgets (feature)', () => {
  let ctx: TestContext;
  let admin: Actor;
  let member: Actor;
  let outsider: Actor;
  let wallet: { id: string };
  let category: { id: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await createAdmin(ctx, 'Admin');
    member = await createMember(ctx, admin, 'Member');
    outsider = await createAdmin(ctx, 'Outsider');
    wallet = await createWallet(ctx, admin, { initial_balance: 10_000_000 });
    category = await createCategory(ctx, admin, {
      name: 'Makan',
      type: 'expense',
    });
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  const findInList = async (actor: Actor, id: string) =>
    (await authed(ctx, actor).get('/budgets')).body.data.find(
      (b: { id: string }) => b.id === id,
    );

  const spend = (amount: number, date: string, categoryId = category.id) =>
    createTransaction(ctx, admin, wallet.id, categoryId, { amount, date });

  describe('POST /budgets', () => {
    it('creates a household budget with an active first period', async () => {
      const res = await authed(ctx, admin).post('/budgets').send({
        owner_type: 'household',
        category_id: category.id,
        name: 'Makan Bulanan',
        target_amount: 500_000,
        period: 'monthly',
        start_date: '2030-01-01',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toEqual(expect.any(String));

      const budget = await findInList(admin, res.body.data.id);

      expect(budget).toMatchObject({
        owner_household_id: admin.householdId,
        owner_user_id: null,
        category_id: category.id,
        name: 'Makan Bulanan',
        target_amount: 500_000,
        period: 'monthly',
        start_date: '2030-01-01',
        carried_deficit: 0,
        effective_target: 500_000,
        spent_amount: 0,
        total_reserved: 0,
        remaining_budget: 500_000,
        deficit_amount: 0,
        is_overbudget: false,
      });
      expect(budget.current_period).toMatchObject({
        period_start: '2030-01-01',
        period_end: '2030-01-31',
        carried_deficit: 0,
      });
    });

    it.each([
      ['weekly', '2030-01-08'],
      ['monthly', '2030-01-31'],
      ['yearly', '2031-01-01'],
    ])('sets the %s period end to %s', async (period, end) => {
      const budget = await createBudget(ctx, admin, category.id, { period });
      const found = await findInList(admin, budget.id);

      expect(found.current_period.period_end).toBe(end);
    });

    it('lets a member create a personal budget', async () => {
      const res = await authed(ctx, member).post('/budgets').send({
        owner_type: 'user',
        category_id: category.id,
        name: 'Pribadi',
        target_amount: 1_000,
        period: 'weekly',
      });

      expect(res.status).toBe(201);
    });

    it('forbids a member from creating a household budget', async () => {
      const res = await authed(ctx, member).post('/budgets').send({
        owner_type: 'household',
        category_id: category.id,
        name: 'X',
        target_amount: 1_000,
        period: 'weekly',
      });

      expect(res.status).toBe(403);
    });

    it('forbids a user without a household', async () => {
      const lone = await registerActor(ctx, 'Lone');
      const res = await authed(ctx, lone).post('/budgets').send({
        owner_type: 'user',
        category_id: category.id,
        name: 'X',
        target_amount: 1_000,
        period: 'weekly',
      });

      expect(res.status).toBe(403);
    });

    it('rejects a category from another household', async () => {
      const foreign = await createCategory(ctx, outsider, { name: 'Asing' });
      const res = await authed(ctx, admin).post('/budgets').send({
        owner_type: 'household',
        category_id: foreign.id,
        name: 'X',
        target_amount: 1_000,
        period: 'monthly',
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it.each([
      ['zero target', { target_amount: 0 }],
      ['invalid period', { period: 'daily' }],
      ['non-uuid category_id', { category_id: 'abc' }],
      ['missing name', { name: undefined }],
      ['invalid owner_type', { owner_type: 'alien' }],
    ])('rejects %s with 400', async (_label, override) => {
      const res = await authed(ctx, admin)
        .post('/budgets')
        .send({
          owner_type: 'household',
          category_id: category.id,
          name: 'X',
          target_amount: 1_000,
          period: 'monthly',
          ...override,
        });

      expect(res.status).toBe(400);
      expect(res.body.rc).toBe('01');
    });

    it('requires authentication', async () => {
      const res = await ctx.http.post('/budgets').send({});

      expect(res.status).toBe(401);
    });
  });

  describe('GET /budgets', () => {
    it('shows household and own personal budgets only', async () => {
      const household = await createBudget(ctx, admin, category.id);
      const adminPersonal = await createBudget(ctx, admin, category.id, {
        owner_type: 'user',
      });
      const memberPersonal = await createBudget(ctx, member, category.id, {
        owner_type: 'user',
      });
      const foreignCategory = await createCategory(ctx, outsider, {
        name: 'Asing',
      });
      const foreign = await createBudget(ctx, outsider, foreignCategory.id);

      const res = await authed(ctx, member).get('/budgets');
      const ids = res.body.data.map((b: { id: string }) => b.id);

      expect(res.status).toBe(200);
      expect(ids).toContain(household.id);
      expect(ids).toContain(memberPersonal.id);
      expect(ids).not.toContain(adminPersonal.id);
      expect(ids).not.toContain(foreign.id);
    });
  });

  describe('spending progress', () => {
    it('counts expenses of the category inside the period only', async () => {
      const cat = await createCategory(ctx, admin, {
        name: 'Hiburan',
        type: 'expense',
      });
      const budget = await createBudget(ctx, admin, cat.id, {
        target_amount: 100_000,
      });

      await spend(30_000, '2030-01-10', cat.id);
      await spend(20_000, '2030-01-31', cat.id);
      await spend(99_000, '2029-12-31', cat.id);
      await spend(99_000, '2030-02-15', cat.id);

      const found = await findInList(admin, budget.id);

      expect(found).toMatchObject({
        spent_amount: 50_000,
        remaining_budget: 50_000,
        deficit_amount: 0,
        is_overbudget: false,
      });
    });

    it('ignores other categories, income and voided expenses', async () => {
      const cat = await createCategory(ctx, admin, {
        name: 'Pakaian',
        type: 'both',
      });
      const other = await createCategory(ctx, admin, {
        name: 'Lain',
        type: 'expense',
      });
      const budget = await createBudget(ctx, admin, cat.id);

      await spend(10_000, '2030-01-05', other.id);
      await createTransaction(ctx, admin, wallet.id, cat.id, {
        type: 'income',
        amount: 50_000,
        date: '2030-01-05',
      });

      const voidMe = await spend(40_000, '2030-01-06', cat.id);

      await spend(5_000, '2030-01-07', cat.id);
      await authed(ctx, admin)
        .post(`/transactions/${voidMe.id}/void`)
        .expect(200);

      expect((await findInList(admin, budget.id)).spent_amount).toBe(5_000);
    });

    it('flags an overspent budget and reports the deficit', async () => {
      const cat = await createCategory(ctx, admin, {
        name: 'Kopi',
        type: 'expense',
      });
      const budget = await createBudget(ctx, admin, cat.id, {
        target_amount: 100_000,
      });

      await spend(150_000, '2030-01-10', cat.id);

      expect(await findInList(admin, budget.id)).toMatchObject({
        spent_amount: 150_000,
        remaining_budget: 0,
        deficit_amount: 50_000,
        is_overbudget: true,
      });
    });

    it('includes reserved amounts in total_reserved', async () => {
      const cat = await createCategory(ctx, admin, {
        name: 'Sewa',
        type: 'expense',
      });
      const budget = await createBudget(ctx, admin, cat.id);

      await createReservation(
        ctx,
        admin,
        wallet.id,
        { budget_id: budget.id },
        25_000,
      );
      await createReservation(
        ctx,
        admin,
        wallet.id,
        { budget_id: budget.id },
        5_000,
      );

      expect((await findInList(admin, budget.id)).total_reserved).toBe(30_000);
    });
  });

  describe('PATCH /budgets/:id', () => {
    it('updates name, target and period', async () => {
      const budget = await createBudget(ctx, admin, category.id);
      const res = await authed(ctx, admin)
        .patch(`/budgets/${budget.id}`)
        .send({ name: 'Baru', target_amount: 250_000, period: 'yearly' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: budget.id,
        name: 'Baru',
        target_amount: 250_000,
        period: 'yearly',
      });
    });

    it('forbids another household with 403', async () => {
      const budget = await createBudget(ctx, admin, category.id);
      const res = await authed(ctx, outsider)
        .patch(`/budgets/${budget.id}`)
        .send({ name: 'hack' });

      expect(res.status).toBe(403);
    });

    it('returns 404 for an unknown budget', async () => {
      const res = await authed(ctx, admin)
        .patch(`/budgets/${randomUUID()}`)
        .send({ name: 'x' });

      expect(res.status).toBe(404);
    });

    it('rejects an invalid body with 400', async () => {
      const budget = await createBudget(ctx, admin, category.id);
      const res = await authed(ctx, admin)
        .patch(`/budgets/${budget.id}`)
        .send({ target_amount: 0 });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /budgets/:id', () => {
    it('deletes a budget', async () => {
      const budget = await createBudget(ctx, admin, category.id);
      const res = await authed(ctx, admin).delete(`/budgets/${budget.id}`);

      expect(res.status).toBe(200);
      expect(await findInList(admin, budget.id)).toBeUndefined();
    });

    it('forbids another household with 403', async () => {
      const budget = await createBudget(ctx, admin, category.id);
      const res = await authed(ctx, outsider).delete(`/budgets/${budget.id}`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /budgets/:id/close-period', () => {
    it('carries the deficit into a new period with a higher effective target', async () => {
      const cat = await createCategory(ctx, admin, {
        name: 'Tagihan',
        type: 'expense',
      });
      const budget = await createBudget(ctx, admin, cat.id, {
        target_amount: 100_000,
      });

      await spend(150_000, '2030-01-10', cat.id);

      const res = await authed(ctx, admin).post(
        `/budgets/${budget.id}/close-period`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        carried_deficit: 50_000,
        effective_target: 150_000,
        spent_amount: 0,
        remaining_budget: 150_000,
        deficit_amount: 0,
        is_overbudget: false,
      });
      expect(res.body.data.current_period).toMatchObject({
        period_start: '2030-01-31',
        period_end: '2030-03-02',
        carried_deficit: 50_000,
      });
    });

    it('carries nothing when the budget was not overspent', async () => {
      const cat = await createCategory(ctx, admin, {
        name: 'Air',
        type: 'expense',
      });
      const budget = await createBudget(ctx, admin, cat.id, {
        target_amount: 100_000,
      });

      await spend(40_000, '2030-01-10', cat.id);

      const res = await authed(ctx, admin).post(
        `/budgets/${budget.id}/close-period`,
      );

      expect(res.body.data).toMatchObject({
        carried_deficit: 0,
        effective_target: 100_000,
      });
    });

    it('forbids another household with 403', async () => {
      const budget = await createBudget(ctx, admin, category.id);
      const res = await authed(ctx, outsider).post(
        `/budgets/${budget.id}/close-period`,
      );

      expect(res.status).toBe(403);
    });
  });

  describe('GET /budgets/:id/reservations and /encroachments', () => {
    it('returns reservations of the budget to a household member', async () => {
      const budget = await createBudget(ctx, admin, category.id);

      await createReservation(
        ctx,
        admin,
        wallet.id,
        { budget_id: budget.id },
        12_000,
      );

      const res = await authed(ctx, member).get(
        `/budgets/${budget.id}/reservations`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        budget_id: budget.id,
        reserved_amount: 12_000,
      });
    });

    it('returns an empty list of encroachments for a fresh budget', async () => {
      const budget = await createBudget(ctx, admin, category.id);
      const res = await authed(ctx, admin).get(
        `/budgets/${budget.id}/encroachments`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('forbids another household from reading reservations', async () => {
      const budget = await createBudget(ctx, admin, category.id);

      await createReservation(
        ctx,
        admin,
        wallet.id,
        { budget_id: budget.id },
        12_000,
      );

      const res = await authed(ctx, outsider).get(
        `/budgets/${budget.id}/reservations`,
      );

      expect(res.status).toBe(403);
    });

    it('forbids another household from reading encroachments', async () => {
      const budget = await createBudget(ctx, admin, category.id);
      const res = await authed(ctx, outsider).get(
        `/budgets/${budget.id}/encroachments`,
      );

      expect(res.status).toBe(403);
    });
  });
});
