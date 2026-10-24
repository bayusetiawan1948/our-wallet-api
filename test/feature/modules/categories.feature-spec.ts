import { randomUUID } from 'node:crypto';
import { authed, createAdmin, createMember, registerActor, type Actor } from '../support/actors';
import { createCategory, createTransaction, createWallet } from '../support/builders';
import { closeTestApp, createTestApp, type TestContext } from '../support/test-app';

describe('Categories (feature)', () => {
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

  describe('POST /categories', () => {
    it('lets an admin create a category', async () => {
      const res = await authed(ctx, admin)
        .post('/categories')
        .send({ name: 'Transport', type: 'expense', icon: 'car' });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        name: 'Transport',
        type: 'expense',
        icon: 'car',
        household_id: admin.householdId,
        parent_id: null,
        is_system: false,
        is_hidden: false,
      });
    });

    it('creates a sub-category under a parent', async () => {
      const parent = await createCategory(ctx, admin, { name: 'Induk' });
      const res = await authed(ctx, admin)
        .post('/categories')
        .send({ name: 'Anak', type: 'expense', parent_id: parent.id });

      expect(res.status).toBe(201);
      expect(res.body.data.parent_id).toBe(parent.id);
    });

    it('rejects a parent from another household with 404', async () => {
      const foreign = await createCategory(ctx, outsider, { name: 'Asing' });
      const res = await authed(ctx, admin)
        .post('/categories')
        .send({ name: 'Anak', type: 'expense', parent_id: foreign.id });

      expect(res.status).toBe(404);
    });

    it('forbids a member with 403', async () => {
      const res = await authed(ctx, member)
        .post('/categories')
        .send({ name: 'Nope', type: 'expense' });

      expect(res.status).toBe(403);
    });

    it('forbids a user without a household with 403', async () => {
      const lone = await registerActor(ctx, 'Lone');
      const res = await authed(ctx, lone).post('/categories').send({ name: 'Nope', type: 'expense' });

      expect(res.status).toBe(403);
    });

    it.each([
      ['missing name', { type: 'expense' }],
      ['invalid type', { name: 'X', type: 'transfer' }],
      ['non-uuid parent_id', { name: 'X', type: 'expense', parent_id: 'abc' }],
    ])('rejects %s with 400', async (_label, body) => {
      const res = await authed(ctx, admin).post('/categories').send(body);

      expect(res.status).toBe(400);
    });
  });

  describe('GET /categories', () => {
    it('lets a member read the household categories only', async () => {
      const mine = await createCategory(ctx, admin, { name: 'Milik Kami' });
      const foreign = await createCategory(ctx, outsider, { name: 'Milik Asing' });
      const res = await authed(ctx, member).get('/categories');

      expect(res.status).toBe(200);

      const ids = res.body.data.map((c: { id: string }) => c.id);

      expect(ids).toContain(mine.id);
      expect(ids).not.toContain(foreign.id);
    });

    it('requires authentication', async () => {
      const res = await ctx.http.get('/categories');

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /categories/:id', () => {
    it('lets an admin update fields', async () => {
      const category = await createCategory(ctx, admin, { name: 'Lama' });
      const res = await authed(ctx, admin)
        .patch(`/categories/${category.id}`)
        .send({ name: 'Baru', type: 'both', is_hidden: true });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ name: 'Baru', type: 'both', is_hidden: true });
    });

    it('forbids a member', async () => {
      const category = await createCategory(ctx, admin);
      const res = await authed(ctx, member).patch(`/categories/${category.id}`).send({ name: 'Hack' });

      expect(res.status).toBe(403);
    });

    it('returns 404 for a category of another household', async () => {
      const category = await createCategory(ctx, admin);
      const res = await authed(ctx, outsider).patch(`/categories/${category.id}`).send({ name: 'Hack' });

      expect(res.status).toBe(404);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await authed(ctx, admin).patch(`/categories/${randomUUID()}`).send({ name: 'X' });

      expect(res.status).toBe(404);
    });

    it('rejects an invalid type with 400', async () => {
      const category = await createCategory(ctx, admin);
      const res = await authed(ctx, admin).patch(`/categories/${category.id}`).send({ type: 'x' });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /categories/:id/toggle-status', () => {
    it('flips the hidden flag back and forth', async () => {
      const category = await createCategory(ctx, admin);
      const hidden = await authed(ctx, admin).patch(`/categories/${category.id}/toggle-status`);

      expect(hidden.status).toBe(200);
      expect(hidden.body.data.is_hidden).toBe(true);

      const shown = await authed(ctx, admin).patch(`/categories/${category.id}/toggle-status`);

      expect(shown.body.data.is_hidden).toBe(false);
    });

    it('forbids a member', async () => {
      const category = await createCategory(ctx, admin);
      const res = await authed(ctx, member).patch(`/categories/${category.id}/toggle-status`);

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /categories/:id', () => {
    it('deletes an unused category', async () => {
      const category = await createCategory(ctx, admin, { name: 'Sementara' });
      const res = await authed(ctx, admin).delete(`/categories/${category.id}`);

      expect(res.status).toBe(200);

      const list = await authed(ctx, admin).get('/categories');

      expect(list.body.data.map((c: { id: string }) => c.id)).not.toContain(category.id);
    });

    it('refuses to delete a category that has sub-categories with 409', async () => {
      const parent = await createCategory(ctx, admin, { name: 'Induk' });

      await createCategory(ctx, admin, { name: 'Anak', parent_id: parent.id });

      const res = await authed(ctx, admin).delete(`/categories/${parent.id}`);

      expect(res.status).toBe(409);
    });

    it('refuses to delete a category used by a transaction with 409', async () => {
      const wallet = await createWallet(ctx, admin);
      const category = await createCategory(ctx, admin, { name: 'Terpakai' });

      await createTransaction(ctx, admin, wallet.id, category.id);

      const res = await authed(ctx, admin).delete(`/categories/${category.id}`);

      expect(res.status).toBe(409);
    });

    it('forbids a member', async () => {
      const category = await createCategory(ctx, admin);
      const res = await authed(ctx, member).delete(`/categories/${category.id}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 for a category of another household', async () => {
      const category = await createCategory(ctx, admin);
      const res = await authed(ctx, outsider).delete(`/categories/${category.id}`);

      expect(res.status).toBe(404);
    });
  });
});
