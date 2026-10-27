import { config } from 'dotenv';
import { resolve } from 'node:path';

config({
  path: resolve(__dirname, '../../../.env.test'),
  override: true,
  quiet: true,
});

export function assertTestDatabase(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      'DATABASE_URL belum diset. Salin .env.test.example ke .env.test',
    );
  }

  const dbName = decodeURIComponent(new URL(url).pathname.slice(1));

  if (!dbName.toLowerCase().includes('test')) {
    throw new Error(
      `Feature test ditolak: database "${dbName}" bukan database test (nama harus mengandung "test").`,
    );
  }

  return url;
}

assertTestDatabase();
