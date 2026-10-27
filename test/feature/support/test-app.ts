import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { configureApp } from '../../../src/app.config';
import { closeTestDb, truncateAllTables } from './db';

export interface ApiEnvelope<T = any> {
  rc: string;
  message: string;
  data: T;
}

export interface TestContext {
  app: INestApplication;
  http: ReturnType<typeof request>;
}

export async function createTestApp(): Promise<TestContext> {
  await truncateAllTables();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();

  configureApp(app);
  await app.init();

  return { app, http: request(app.getHttpServer()) };
}

export async function closeTestApp(
  ctx: TestContext | undefined,
): Promise<void> {
  await ctx?.app.close();
  await closeTestDb();
}
