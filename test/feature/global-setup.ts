import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { assertTestDatabase } from './support/env';

export default async function globalSetup(): Promise<void> {
  const connectionString = assertTestDatabase();
  const pool = new Pool({ connectionString });

  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: resolve(__dirname, '../../drizzle'),
    });
  } finally {
    await pool.end();
  }
}
