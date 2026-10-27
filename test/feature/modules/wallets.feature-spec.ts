import { randomUUID } from 'node:crypto';
import {
  authed,
  createAdmin,
  createMember,
  registerActor,
  type Actor,
} from '../support/actors';
import {
  createCategory,
  createTransaction,
  createWallet,
} from '../support/builders';
import {
  closeTestApp,
  createTestApp,
  type TestContext,
} from '../support/test-app';

describe('Wallets (feature)', () => {
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

  describe('GET /wallets/health', () => {
    it('is public', async () => {
      const res = await ctx.http.get('/wallets/health');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ok');
    });
  });

  describe('POST /wallets', () => {
    it('creates a household wallet with an initial balance', async () => {
      const res = await authed(ctx, admin).post('/wallets').send({
        owner_type: 'household',
        name: 'Tabungan',
        type: 'bank',
        initial_balance: 500_000,
      });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        name: 'Tabungan',
        type: 'bank',
        currency: 'IDR',
        balance: 500_000,
        owner_household_id: admin.householdId,
        owner_user_id: null,
      });
    });

    it('creates a personal wallet owned by the caller by default', async () => {
      const res = await authed(ctx, admin)
        .post('/wallets')
        .send({ owner_type: 'user', name: 'Pribadi', type: 'cash' });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        owner_user_id: admin.id,
        owner_household_id: null,
        balance: 0,
      });
    });

    it('forbids a member with 403', async () => {
      const res = await authed(ctx, member)
        .post('/wallets')
        .send({ owner_type: 'household', name: 'Nope', type: 'cash' });

      expect(res.status).toBe(403);
      expect(res.body.rc).toBe('03');
    });

    it('forbids a user without a household with 403', async () => {
      const lone = await registerActor(ctx, 'Lone');
      const res = await authed(ctx, lone)
        .post('/wallets')
        .send({ owner_type: 'user', name: 'Nope', type: 'cash' });

      expect(res.status).toBe(403);
    });

    it.each([
      ['missing name', { owner_type: 'household', type: 'bank' }],
      ['invalid type', { owner_type: 'household', name: 'X', type: 'crypto' }],
      ['invalid owner_type', { owner_type: 'alien', name: 'X', type: 'bank' }],
      [
        'negative initial balance',
        {
          owner_type: 'household',
          name: 'X',
          type: 'bank',
          initial_balance: -1,
        },
      ],
      [
        'non-numeric initial balance',
        {
          owner_type: 'household',
          name: 'X',
          type: 'bank',
          initial_balance: 'banyak',
        },
      ],
    ])('rejects %s with 400', async (_label, body) => {
      const res = await authed(ctx, admin).post('/wallets').send(body);

      expect(res.status).toBe(400);
      expect(res.body.rc).toBe('01');
    });

    it('requires authentication', async () => {
      const res = await ctx.http.post('/wallets').send({});

      expect(res.status).toBe(401);
    });
  });

  describe('GET /wallets and GET /wallets/:id', () => {
    it('lets a member see household wallets', async () => {
      const wallet = await createWallet(ctx, admin, { name: 'Dapur' });
      const res = await authed(ctx, member).get('/wallets');

      expect(res.status).toBe(200);
      expect(res.body.data.map((w: { id: string }) => w.id)).toContain(
        wallet.id,
      );
    });

    it('does not leak wallets across households', async () => {
      const wallet = await createWallet(ctx, admin, { name: 'Privat Admin' });
      const list = await authed(ctx, outsider).get('/wallets');

      expect(list.body.data.map((w: { id: string }) => w.id)).not.toContain(
        wallet.id,
      );

      const detail = await authed(ctx, outsider).get(`/wallets/${wallet.id}`);

      expect(detail.status).toBe(403);
    });

    it('does not show a personal wallet to a member without access', async () => {
      const personal = await createWallet(ctx, admin, {
        owner_type: 'user',
        name: 'Rahasia',
      });
      const list = await authed(ctx, member).get('/wallets');

      expect(list.body.data.map((w: { id: string }) => w.id)).not.toContain(
        personal.id,
      );

      const detail = await authed(ctx, member).get(`/wallets/${personal.id}`);

      expect(detail.status).toBe(403);
    });

    it('returns 404 for an unknown wallet id', async () => {
      const res = await authed(ctx, admin).get(`/wallets/${randomUUID()}`);

      expect(res.status).toBe(404);
      expect(res.body.rc).toBe('04');
    });

    it('returns a 4xx for a malformed wallet id instead of a server error', async () => {
      const res = await authed(ctx, admin).get('/wallets/abc');

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('requires authentication', async () => {
      const res = await ctx.http.get('/wallets');

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /wallets/:id', () => {
    it('lets an admin rename a wallet', async () => {
      const wallet = await createWallet(ctx, admin, { name: 'Lama' });
      const res = await authed(ctx, admin)
        .patch(`/wallets/${wallet.id}`)
        .send({ name: 'Baru' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Baru');
    });

    it('forbids a member who is not the owner of a household wallet', async () => {
      const wallet = await createWallet(ctx, admin);
      const res = await authed(ctx, member)
        .patch(`/wallets/${wallet.id}`)
        .send({ name: 'Hack' });

      expect(res.status).toBe(403);
    });

    it('lets a member rename a personal wallet they own', async () => {
      const wallet = await createWallet(ctx, admin, {
        owner_type: 'user',
        owner_user_id: member.id,
        name: 'Punya Member',
      });
      const res = await authed(ctx, member)
        .patch(`/wallets/${wallet.id}`)
        .send({ name: 'Punya Member Baru' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Punya Member Baru');
    });

    it('rejects an invalid type with 400', async () => {
      const wallet = await createWallet(ctx, admin);
      const res = await authed(ctx, admin)
        .patch(`/wallets/${wallet.id}`)
        .send({ type: 'crypto' });

      expect(res.status).toBe(400);
    });

    it('forbids another household', async () => {
      const wallet = await createWallet(ctx, admin);
      const res = await authed(ctx, outsider)
        .patch(`/wallets/${wallet.id}`)
        .send({ name: 'Hack' });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /wallets/:id', () => {
    it('deletes an empty wallet', async () => {
      const wallet = await createWallet(ctx, admin, { initial_balance: 0 });
      const res = await authed(ctx, admin).delete(`/wallets/${wallet.id}`);

      expect(res.status).toBe(200);

      const after = await authed(ctx, admin).get(`/wallets/${wallet.id}`);

      expect(after.status).toBe(404);
    });

    it('refuses to delete a wallet that has money movement with 409', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 100_000,
      });
      const res = await authed(ctx, admin).delete(`/wallets/${wallet.id}`);

      expect(res.status).toBe(409);
    });

    it('forbids a member', async () => {
      const wallet = await createWallet(ctx, admin, { initial_balance: 0 });
      const res = await authed(ctx, member).delete(`/wallets/${wallet.id}`);

      expect(res.status).toBe(403);
    });
  });

  describe('wallet access', () => {
    it('grants and revokes access to a personal wallet', async () => {
      const personal = await createWallet(ctx, admin, {
        owner_type: 'user',
        name: 'Shared',
      });

      const grant = await authed(ctx, admin)
        .post(`/wallets/${personal.id}/access`)
        .send({ user_id: member.id });

      expect(grant.status).toBe(201);

      const visible = await authed(ctx, member).get(`/wallets/${personal.id}`);

      expect(visible.status).toBe(200);

      const revoke = await authed(ctx, admin).delete(
        `/wallets/${personal.id}/access/${member.id}`,
      );

      expect(revoke.status).toBe(200);

      const hidden = await authed(ctx, member).get(`/wallets/${personal.id}`);

      expect(hidden.status).toBe(403);
    });

    it('rejects granting access twice with 409', async () => {
      const personal = await createWallet(ctx, admin, {
        owner_type: 'user',
        name: 'Twice',
      });

      await authed(ctx, admin)
        .post(`/wallets/${personal.id}/access`)
        .send({ user_id: member.id })
        .expect(201);

      const again = await authed(ctx, admin)
        .post(`/wallets/${personal.id}/access`)
        .send({ user_id: member.id });

      expect(again.status).toBe(409);
    });

    it('forbids a member from granting access', async () => {
      const wallet = await createWallet(ctx, admin);
      const res = await authed(ctx, member)
        .post(`/wallets/${wallet.id}/access`)
        .send({ user_id: member.id });

      expect(res.status).toBe(403);
    });

    it('rejects a non-uuid user_id with 400', async () => {
      const wallet = await createWallet(ctx, admin);
      const res = await authed(ctx, admin)
        .post(`/wallets/${wallet.id}/access`)
        .send({ user_id: 'bukan-uuid' });

      expect(res.status).toBe(400);
    });
  });

  describe('reconciliations and snapshots', () => {
    it('records a reconciliation with the recorded and actual balance', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 300_000,
      });
      const res = await authed(ctx, admin)
        .post(`/wallets/${wallet.id}/reconciliations`)
        .send({ actual_balance: 250_000 });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        wallet_id: wallet.id,
        recorded_balance: 300_000,
        actual_balance: 250_000,
      });

      const list = await authed(ctx, member).get(
        `/wallets/${wallet.id}/reconciliations`,
      );

      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);
    });

    it('rejects a non-numeric actual_balance with 400', async () => {
      const wallet = await createWallet(ctx, admin);
      const res = await authed(ctx, admin)
        .post(`/wallets/${wallet.id}/reconciliations`)
        .send({ actual_balance: 'banyak' });

      expect(res.status).toBe(400);
    });

    it('forbids another household from reconciling', async () => {
      const wallet = await createWallet(ctx, admin);
      const res = await authed(ctx, outsider)
        .post(`/wallets/${wallet.id}/reconciliations`)
        .send({ actual_balance: 1 });

      expect(res.status).toBe(403);
    });

    it('lists snapshots as an array', async () => {
      const wallet = await createWallet(ctx, admin);
      const res = await authed(ctx, admin).get(
        `/wallets/${wallet.id}/snapshots`,
      );

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('balance', () => {
    it('reflects active transactions only', async () => {
      const wallet = await createWallet(ctx, admin, {
        initial_balance: 100_000,
      });
      const category = await createCategory(ctx, admin, {
        name: 'Saldo',
        type: 'both',
      });
      const tx = await createTransaction(ctx, admin, wallet.id, category.id, {
        amount: 40_000,
      });

      let res = await authed(ctx, admin).get(`/wallets/${wallet.id}`);

      expect(res.body.data.balance).toBe(60_000);

      await authed(ctx, admin).post(`/transactions/${tx.id}/void`).expect(200);

      res = await authed(ctx, admin).get(`/wallets/${wallet.id}`);

      expect(res.body.data.balance).toBe(100_000);
    });
  });
});
