import request from 'supertest';
import type { TestContext } from './test-app';

export const TEST_PASSWORD = 'Password123!';

export interface Actor {
  id: string;
  name: string;
  email: string;
  password: string;
  token: string;
  householdId: string | null;
  role: 'admin' | 'member' | null;
}

let counter = 0;

export function uniqueEmail(prefix = 'user'): string {
  counter += 1;

  return `${prefix}-${Date.now()}-${counter}@test.local`;
}

export async function registerActor(
  ctx: TestContext,
  name = 'Test User',
): Promise<Actor> {
  const email = uniqueEmail(name.toLowerCase().replace(/\s+/g, '-'));
  const res = await ctx.http
    .post('/auth/register')
    .send({ name, email, password: TEST_PASSWORD })
    .expect(201);

  return {
    id: res.body.data.user.id,
    name,
    email,
    password: TEST_PASSWORD,
    token: res.body.data.access_token,
    householdId: null,
    role: null,
  };
}

/** Login ulang supaya JWT memuat household dan role terbaru. */
export async function refreshActor(
  ctx: TestContext,
  actor: Actor,
): Promise<Actor> {
  const res = await ctx.http
    .post('/auth/login')
    .send({ email: actor.email, password: actor.password })
    .expect(200);

  return {
    ...actor,
    token: res.body.data.access_token,
    householdId: res.body.data.user.household_id,
    role: res.body.data.user.role,
  };
}

export async function createAdmin(
  ctx: TestContext,
  name = 'Admin User',
): Promise<Actor> {
  const registered = await registerActor(ctx, name);

  await authed(ctx, registered)
    .post('/households')
    .send({ name: `Household of ${name}` })
    .expect(201);

  return refreshActor(ctx, registered);
}

export async function createMember(
  ctx: TestContext,
  admin: Actor,
  name = 'Member User',
): Promise<Actor> {
  const registered = await registerActor(ctx, name);
  const invite = await authed(ctx, admin).post('/households/invites').expect(201);

  await authed(ctx, registered)
    .post('/households/invites/accept')
    .send({ code: invite.body.data.code })
    .expect(200);

  return refreshActor(ctx, registered);
}

export interface AuthedClient {
  get(url: string): request.Test;
  post(url: string): request.Test;
  patch(url: string): request.Test;
  delete(url: string): request.Test;
}

export function authed(ctx: TestContext, actor: Pick<Actor, 'token'>): AuthedClient {
  const bearer = `Bearer ${actor.token}`;

  return {
    get: (url) => ctx.http.get(url).set('Authorization', bearer),
    post: (url) => ctx.http.post(url).set('Authorization', bearer),
    patch: (url) => ctx.http.patch(url).set('Authorization', bearer),
    delete: (url) => ctx.http.delete(url).set('Authorization', bearer),
  };
}
