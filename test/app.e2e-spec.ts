import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('boots the full module graph (all 12 feature modules wire up without DI errors)', () => {
    expect(app).toBeDefined();
  });

  it('GET /wallets/health is public and returns ok', async () => {
    const res = await request(app.getHttpServer()).get('/wallets/health');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });

  it.each([
    ['/wallets'],
    ['/categories'],
    ['/transactions'],
    ['/transfers'],
    ['/debts'],
    ['/investments'],
    ['/budgets'],
    ['/goals'],
    ['/reservations'],
    ['/audit-logs'],
    ['/households/me'],
  ])('GET %s requires authentication (401 without a token)', async (path) => {
    const res = await request(app.getHttpServer()).get(path);

    expect(res.status).toBe(401);
  });

  // NOTE: login/register/other DB-backed happy-path flows are intentionally not
  // exercised here — this test suite runs against the real DATABASE_URL (a remote
  // homelab Postgres over Tailscale) which is not reachable from every environment
  // this suite may run in. The checks above stay DB-independent (guard short-circuits
  // on a missing token, health check does not query the DB) so they are safe to run
  // anywhere. Add DB-backed e2e coverage once a disposable/test database is wired up.
});
