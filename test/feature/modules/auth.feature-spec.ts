import {
  authed,
  registerActor,
  TEST_PASSWORD,
  uniqueEmail,
} from '../support/actors';
import {
  closeTestApp,
  createTestApp,
  type TestContext,
} from '../support/test-app';

describe('Auth (feature)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  describe('POST /auth/register', () => {
    it('registers a new user and returns an access token with a refresh cookie', async () => {
      const email = uniqueEmail('register');
      const res = await ctx.http
        .post('/auth/register')
        .send({ name: 'Budi', email, password: TEST_PASSWORD });

      expect(res.status).toBe(201);
      expect(res.body.rc).toBe('00');
      expect(res.body.data.access_token).toEqual(expect.any(String));
      expect(res.body.data.user).toMatchObject({
        name: 'Budi',
        email,
        household_id: null,
        role: null,
      });
      expect(res.body.data.user).not.toHaveProperty('password');
      expect(res.body.data.user).not.toHaveProperty('passwordHash');

      const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);

      expect(
        cookies.some(
          (c) => c.startsWith('refresh_token=') && c.includes('HttpOnly'),
        ),
      ).toBe(true);
    });

    it('rejects a duplicate email with 409', async () => {
      const user = await registerActor(ctx);
      const res = await ctx.http
        .post('/auth/register')
        .send({ name: 'Dup', email: user.email, password: TEST_PASSWORD });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ rc: '94', data: null });
    });

    it.each([
      [
        'invalid email',
        { name: 'A', email: 'bukan-email', password: TEST_PASSWORD },
      ],
      ['short password', { name: 'A', email: 'a@test.local', password: '123' }],
      [
        'empty name',
        { name: '', email: 'a@test.local', password: TEST_PASSWORD },
      ],
      ['missing fields', {}],
    ])('rejects %s with 400', async (_label, body) => {
      const res = await ctx.http.post('/auth/register').send(body);

      expect(res.status).toBe(400);
      expect(res.body.rc).toBe('01');
      expect(res.body.data).toBeNull();
    });
  });

  describe('POST /auth/login', () => {
    it('logs in with valid credentials', async () => {
      const user = await registerActor(ctx);
      const res = await ctx.http
        .post('/auth/login')
        .send({ email: user.email, password: user.password });

      expect(res.status).toBe(200);
      expect(res.body.data.access_token).toEqual(expect.any(String));
      expect(res.body.data.user.email).toBe(user.email);
    });

    it('rejects a wrong password with 401', async () => {
      const user = await registerActor(ctx);
      const res = await ctx.http
        .post('/auth/login')
        .send({ email: user.email, password: 'SalahTotal123' });

      expect(res.status).toBe(401);
      expect(res.body.rc).toBe('02');
    });

    it('rejects an unknown email with the same 401 message as a wrong password', async () => {
      const user = await registerActor(ctx);
      const wrongPassword = await ctx.http
        .post('/auth/login')
        .send({ email: user.email, password: 'SalahTotal123' });
      const unknownEmail = await ctx.http
        .post('/auth/login')
        .send({ email: uniqueEmail('ghost'), password: TEST_PASSWORD });

      expect(unknownEmail.status).toBe(401);
      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
    });

    it('rejects a malformed body with 400', async () => {
      const res = await ctx.http.post('/auth/login').send({ email: 'x' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /auth/me', () => {
    it('returns the current user', async () => {
      const user = await registerActor(ctx);
      const res = await authed(ctx, user).get('/auth/me');

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: user.id, email: user.email });
    });

    it('rejects a request without a token with 401', async () => {
      const res = await ctx.http.get('/auth/me');

      expect(res.status).toBe(401);
    });

    it('rejects a garbage token with 401', async () => {
      const res = await ctx.http
        .get('/auth/me')
        .set('Authorization', 'Bearer abc.def.ghi');

      expect(res.status).toBe(401);
      expect(res.body.rc).toBe('02');
    });

    it('rejects a non-Bearer scheme with 401', async () => {
      const user = await registerActor(ctx);
      const res = await ctx.http
        .get('/auth/me')
        .set('Authorization', `Basic ${user.token}`);

      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('issues a new access token using the refresh cookie', async () => {
      const user = await registerActor(ctx);
      const login = await ctx.http
        .post('/auth/login')
        .send({ email: user.email, password: user.password });
      const cookie = ([] as string[]).concat(login.headers['set-cookie'] ?? []);

      const res = await ctx.http.post('/auth/refresh').set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.access_token).toEqual(expect.any(String));
      expect(res.body.data.user.email).toBe(user.email);
    });

    it('rejects when the refresh cookie is missing with 401', async () => {
      const res = await ctx.http.post('/auth/refresh');

      expect(res.status).toBe(401);
    });

    it('rejects an invalid refresh token with 401', async () => {
      const res = await ctx.http
        .post('/auth/refresh')
        .set('Cookie', ['refresh_token=not-a-real-token']);

      expect(res.status).toBe(401);
    });

    it('revokes the session when a rotated refresh token is reused', async () => {
      const user = await registerActor(ctx);
      const login = await ctx.http
        .post('/auth/login')
        .send({ email: user.email, password: user.password });
      const oldCookie = ([] as string[]).concat(
        login.headers['set-cookie'] ?? [],
      );

      const first = await ctx.http
        .post('/auth/refresh')
        .set('Cookie', oldCookie);

      expect(first.status).toBe(200);

      const reuse = await ctx.http
        .post('/auth/refresh')
        .set('Cookie', oldCookie);

      expect(reuse.status).toBe(401);

      const newCookie = ([] as string[]).concat(
        first.headers['set-cookie'] ?? [],
      );
      const afterRevoke = await ctx.http
        .post('/auth/refresh')
        .set('Cookie', newCookie);

      expect(afterRevoke.status).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the session so the refresh token no longer works', async () => {
      const user = await registerActor(ctx);
      const login = await ctx.http
        .post('/auth/login')
        .send({ email: user.email, password: user.password });
      const cookie = ([] as string[]).concat(login.headers['set-cookie'] ?? []);
      const token = login.body.data.access_token;

      const logout = await ctx.http
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(logout.status).toBe(200);

      const refresh = await ctx.http
        .post('/auth/refresh')
        .set('Cookie', cookie);

      expect(refresh.status).toBe(401);
    });

    it('requires authentication', async () => {
      const res = await ctx.http.post('/auth/logout');

      expect(res.status).toBe(401);
    });
  });
});
