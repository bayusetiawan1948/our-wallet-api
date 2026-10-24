import { randomUUID } from 'node:crypto';
import { authed, createAdmin, createMember, refreshActor, registerActor } from '../support/actors';
import { execSql } from '../support/db';
import { closeTestApp, createTestApp, type TestContext } from '../support/test-app';

describe('Households (feature)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  describe('POST /households', () => {
    it('creates a household and makes the creator its admin', async () => {
      const user = await registerActor(ctx);
      const res = await authed(ctx, user).post('/households').send({ name: 'Keluarga Budi' });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ name: 'Keluarga Budi' });

      const refreshed = await refreshActor(ctx, user);

      expect(refreshed.role).toBe('admin');
      expect(refreshed.householdId).toBe(res.body.data.id);
    });

    it('rejects a second household for a user who already has one with 409', async () => {
      const admin = await createAdmin(ctx);
      const res = await authed(ctx, admin).post('/households').send({ name: 'Kedua' });

      expect(res.status).toBe(409);
    });

    it('rejects an empty name with 400', async () => {
      const user = await registerActor(ctx);
      const res = await authed(ctx, user).post('/households').send({ name: '' });

      expect(res.status).toBe(400);
    });

    it('requires authentication', async () => {
      const res = await ctx.http.post('/households').send({ name: 'X' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /households/me', () => {
    it('returns 404 for a user without a household', async () => {
      const user = await registerActor(ctx);
      const res = await authed(ctx, user).get('/households/me');

      expect(res.status).toBe(404);
    });

    it('returns admin role and edit permission for the household creator', async () => {
      const admin = await createAdmin(ctx);
      const res = await authed(ctx, admin).get('/households/me');

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: admin.householdId,
        role: 'admin',
        can_edit_others_transactions: true,
      });
    });

    it('returns member role without edit permission for an invited member', async () => {
      const admin = await createAdmin(ctx);
      const member = await createMember(ctx, admin);
      const res = await authed(ctx, member).get('/households/me');

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: admin.householdId,
        role: 'member',
        can_edit_others_transactions: false,
      });
    });
  });

  describe('GET /households/members', () => {
    it('lists every member of the caller household and nobody else', async () => {
      const admin = await createAdmin(ctx);
      const member = await createMember(ctx, admin);
      const otherAdmin = await createAdmin(ctx, 'Other Admin');

      const res = await authed(ctx, member).get('/households/members');

      expect(res.status).toBe(200);
      expect(res.body.data.map((m: { user_id: string }) => m.user_id).sort()).toEqual(
        [admin.id, member.id].sort(),
      );
      expect(res.body.data.map((m: { user_id: string }) => m.user_id)).not.toContain(
        otherAdmin.id,
      );
    });

    it('returns 403 for a user without a household', async () => {
      const user = await registerActor(ctx);
      const res = await authed(ctx, user).get('/households/members');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /households/invites', () => {
    it('lets an admin generate an invite code', async () => {
      const admin = await createAdmin(ctx);
      const res = await authed(ctx, admin).post('/households/invites');

      expect(res.status).toBe(201);
      expect(res.body.data.code).toEqual(expect.any(String));
    });

    it('forbids a member from generating an invite', async () => {
      const admin = await createAdmin(ctx);
      const member = await createMember(ctx, admin);
      const res = await authed(ctx, member).post('/households/invites');

      expect(res.status).toBe(403);
      expect(res.body.rc).toBe('03');
    });

    it('forbids a user without a household', async () => {
      const user = await registerActor(ctx);
      const res = await authed(ctx, user).post('/households/invites');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /households/invites/accept', () => {
    it('adds the user to the household as a member', async () => {
      const admin = await createAdmin(ctx);
      const invitee = await registerActor(ctx, 'Invitee');
      const invite = await authed(ctx, admin).post('/households/invites');

      const res = await authed(ctx, invitee)
        .post('/households/invites/accept')
        .send({ code: invite.body.data.code });

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(admin.householdId);
    });

    it('rejects a code that was already used with 404', async () => {
      const admin = await createAdmin(ctx);
      const first = await registerActor(ctx, 'First');
      const second = await registerActor(ctx, 'Second');
      const invite = await authed(ctx, admin).post('/households/invites');
      const code = invite.body.data.code;

      await authed(ctx, first).post('/households/invites/accept').send({ code }).expect(200);

      const res = await authed(ctx, second).post('/households/invites/accept').send({ code });

      expect(res.status).toBe(404);
    });

    it('rejects an unknown code with 404', async () => {
      const user = await registerActor(ctx);
      const res = await authed(ctx, user)
        .post('/households/invites/accept')
        .send({ code: 'tidak-ada' });

      expect(res.status).toBe(404);
    });

    it('rejects an expired code with 409', async () => {
      const admin = await createAdmin(ctx);
      const invitee = await registerActor(ctx, 'Late');
      const invite = await authed(ctx, admin).post('/households/invites');
      const code = invite.body.data.code;

      await execSql(
        `UPDATE household_invites SET expires_at = now() - interval '1 day' WHERE code = $1`,
        [code],
      );

      const res = await authed(ctx, invitee).post('/households/invites/accept').send({ code });

      expect(res.status).toBe(409);
    });

    it('rejects a user who already belongs to a household with 409', async () => {
      const admin = await createAdmin(ctx);
      const otherAdmin = await createAdmin(ctx, 'Other Admin');
      const invite = await authed(ctx, admin).post('/households/invites');

      const res = await authed(ctx, otherAdmin)
        .post('/households/invites/accept')
        .send({ code: invite.body.data.code });

      expect(res.status).toBe(409);
    });

    it('rejects a missing code with 400', async () => {
      const user = await registerActor(ctx);
      const res = await authed(ctx, user).post('/households/invites/accept').send({});

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /households/members/:userId', () => {
    it('lets an admin grant and revoke edit-others permission', async () => {
      const admin = await createAdmin(ctx);
      const member = await createMember(ctx, admin);

      const grant = await authed(ctx, admin)
        .patch(`/households/members/${member.id}`)
        .send({ can_edit_others_transactions: true });

      expect(grant.status).toBe(200);
      expect(grant.body.data).toEqual({
        user_id: member.id,
        can_edit_others_transactions: true,
      });

      const me = await authed(ctx, member).get('/households/me');

      expect(me.body.data.can_edit_others_transactions).toBe(true);

      await authed(ctx, admin)
        .patch(`/households/members/${member.id}`)
        .send({ can_edit_others_transactions: false })
        .expect(200);

      const after = await authed(ctx, member).get('/households/me');

      expect(after.body.data.can_edit_others_transactions).toBe(false);
    });

    it('forbids a member from changing permissions', async () => {
      const admin = await createAdmin(ctx);
      const member = await createMember(ctx, admin);
      const res = await authed(ctx, member)
        .patch(`/households/members/${member.id}`)
        .send({ can_edit_others_transactions: true });

      expect(res.status).toBe(403);
    });

    it('forbids changing the permission of an admin with 403', async () => {
      const admin = await createAdmin(ctx);
      const res = await authed(ctx, admin)
        .patch(`/households/members/${admin.id}`)
        .send({ can_edit_others_transactions: false });

      expect(res.status).toBe(403);
    });

    it('returns 404 for a member of another household', async () => {
      const admin = await createAdmin(ctx);
      const otherAdmin = await createAdmin(ctx, 'Other Admin');
      const otherMember = await createMember(ctx, otherAdmin, 'Other Member');
      const res = await authed(ctx, admin)
        .patch(`/households/members/${otherMember.id}`)
        .send({ can_edit_others_transactions: true });

      expect(res.status).toBe(404);
    });

    it('returns 404 for an unknown user id', async () => {
      const admin = await createAdmin(ctx);
      const res = await authed(ctx, admin)
        .patch(`/households/members/${randomUUID()}`)
        .send({ can_edit_others_transactions: true });

      expect(res.status).toBe(404);
    });

    it('rejects a non-boolean body with 400', async () => {
      const admin = await createAdmin(ctx);
      const member = await createMember(ctx, admin);
      const res = await authed(ctx, admin)
        .patch(`/households/members/${member.id}`)
        .send({ can_edit_others_transactions: 'yes' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /households/members/:userId', () => {
    it('lets an admin remove a member', async () => {
      const admin = await createAdmin(ctx);
      const member = await createMember(ctx, admin);

      const res = await authed(ctx, admin).delete(`/households/members/${member.id}`);

      expect(res.status).toBe(200);

      const members = await authed(ctx, admin).get('/households/members');

      expect(members.body.data.map((m: { user_id: string }) => m.user_id)).toEqual([admin.id]);
    });

    it('forbids an admin from removing themselves', async () => {
      const admin = await createAdmin(ctx);
      const res = await authed(ctx, admin).delete(`/households/members/${admin.id}`);

      expect(res.status).toBe(403);
    });

    it('forbids a member from removing anyone', async () => {
      const admin = await createAdmin(ctx);
      const member = await createMember(ctx, admin);
      const res = await authed(ctx, member).delete(`/households/members/${admin.id}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 for a member of another household', async () => {
      const admin = await createAdmin(ctx);
      const otherAdmin = await createAdmin(ctx, 'Other Admin');
      const otherMember = await createMember(ctx, otherAdmin, 'Other Member');
      const res = await authed(ctx, admin).delete(`/households/members/${otherMember.id}`);

      expect(res.status).toBe(404);
    });
  });
});
