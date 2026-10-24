import { Pool } from 'pg';
import { assertTestDatabase } from './env';

let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: assertTestDatabase(), max: 2 });
  }

  return pool;
}

export async function truncateAllTables(): Promise<void> {
  const client = getPool();
  const { rows } = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename NOT LIKE '%drizzle%'`,
  );

  if (rows.length === 0) {
    return;
  }

  const tables = rows.map((r) => `"public"."${r.tablename}"`).join(', ');

  await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

export async function execSql(
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  await getPool().query(sql, params);
}

export async function closeTestDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
