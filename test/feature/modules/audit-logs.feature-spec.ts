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
  TODAY,
} from '../support/builders';
import {
  closeTestApp,
  createTestApp,
  type TestContext,
} from '../support/test-app';

interface LogEntry {
  id: string;
  actor_id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  created_at: string;
}

describe('Audit logs (feature)', () => {
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

  const logs = async (actor: Actor): Promise<LogEntry[]> =>
    (await authed(ctx, actor).get('/audit-logs').expect(200)).body.data;

  describe('GET /audit-logs', () => {
    it('lets an admin read the household log', async () => {
      const res = await authed(ctx, admin).get('/audit-logs');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('forbids a member with 403', async () => {
      const res = await authed(ctx, member).get('/audit-logs');

      expect(res.status).toBe(403);
      expect(res.body.rc).toBe('03');
    });

    it('forbids a user without a household with 403', async () => {
      const lone = await registerActor(ctx, 'Lone');
      const res = await authed(ctx, lone).get('/audit-logs');

      expect(res.status).toBe(403);
    });

    it('requires authentication', async () => {
      const res = await ctx.http.get('/audit-logs');

      expect(res.status).toBe(401);
    });
  });

  describe('what gets recorded', () => {
    it('records wallet, category and transaction mutations with the actor and entity', async () => {
      const wallet = await createWallet(ctx, admin, { name: 'Dilog' });
      const category = await createCategory(ctx, admin, {
        name: 'Dilog',
        type: 'both',
      });
      const tx = await createTransaction(ctx, member, wallet.id, category.id);

      await authed(ctx, member).post(`/transactions/${tx.id}/void`).expect(200);

      const entries = await logs(admin);
      const find = (action: string, entityId: string) =>
        entries.find((l) => l.action === action && l.entity_id === entityId);

      expect(find('CREATE_WALLET', wallet.id)).toMatchObject({
        actor_id: admin.id,
        entity_type: 'WALLETS',
      });
      expect(find('CREATE_CATEGORY', category.id)).toMatchObject({
        actor_id: admin.id,
        entity_type: 'CATEGORIES',
      });
      expect(find('CREATE_TRANSACTION', tx.id)).toMatchObject({
        actor_id: member.id,
        entity_type: 'TRANSACTIONS',
      });
      expect(find('VOID_TRANSACTION', tx.id)).toMatchObject({
        actor_id: member.id,
      });
    });

    it('records debt creation', async () => {
      const res = await authed(ctx, admin).post('/debts').send({
        owner_type: 'household',
        type: 'utang',
        counterparty: 'Bank',
        principal: 1_000,
        is_opening: true,
      });
      const entry = (await logs(admin)).find(
        (l) => l.action === 'CREATE_DEBT' && l.entity_id === res.body.data.id,
      );

      expect(entry).toMatchObject({ actor_id: admin.id, entity_type: 'DEBTS' });
    });

    it('records deletions', async () => {
      const wallet = await createWallet(ctx, admin, {
        name: 'Dihapus',
        initial_balance: 0,
      });

      await authed(ctx, admin).delete(`/wallets/${wallet.id}`).expect(200);

      const entry = (await logs(admin)).find(
        (l) => l.action === 'DELETE_WALLET' && l.entity_id === wallet.id,
      );

      expect(entry).toBeDefined();
    });

    it('records corrections', async () => {
      const wallet = await createWallet(ctx, admin, { name: 'Koreksi' });
      const category = await createCategory(ctx, admin, {
        name: 'Koreksi',
        type: 'both',
      });
      const tx = await createTransaction(ctx, admin, wallet.id, category.id);
      const corrected = await authed(ctx, admin)
        .post(`/transactions/${tx.id}/correct`)
        .send({
          wallet_id: wallet.id,
          category_id: category.id,
          type: 'expense',
          amount: 5_000,
          date: TODAY,
        });
      const entry = (await logs(admin)).find(
        (l) =>
          l.action === 'CORRECT_TRANSACTION' &&
          l.entity_id === corrected.body.data.id,
      );

      expect(entry).toBeDefined();
    });

    it('does not record failed requests', async () => {
      const before = (await logs(admin)).length;

      await authed(ctx, admin)
        .post('/wallets')
        .send({ owner_type: 'household', name: '', type: 'bank' })
        .expect(400);

      expect((await logs(admin)).length).toBe(before);
    });
  });

  describe('ordering and scope', () => {
    it('returns the newest entries first', async () => {
      const entries = await logs(admin);
      const times = entries.map((l) => new Date(l.created_at).getTime());

      expect(times).toEqual([...times].sort((a, b) => b - a));
    });

    it('does not expose the log of another household', async () => {
      const foreignWallet = await createWallet(ctx, outsider, {
        name: 'Rahasia Asing',
      });
      const mine = await logs(admin);

      expect(mine.map((l) => l.entity_id)).not.toContain(foreignWallet.id);

      const theirs = await logs(outsider);

      expect(theirs.map((l) => l.entity_id)).toContain(foreignWallet.id);
      expect(theirs.every((l) => l.actor_id === outsider.id)).toBe(true);
    });
  });
});
