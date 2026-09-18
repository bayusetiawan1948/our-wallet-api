import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { users } from '../src/shared/database/schema/users-schema';

const PASSWORD_SALT_ROUNDS = 10;

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

async function main() {
  const name = requireEnv('SEED_USER_NAME');
  const email = requireEnv('SEED_USER_EMAIL');
  const password = requireEnv('SEED_USER_PASSWORD');
  const phone = process.env.SEED_USER_PHONE ?? null;

  const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });
  const db = drizzle({ client: pool });

  try {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);

    if (existing.length > 0) {
      const [user] = await db
        .update(users)
        .set({ name, phone, passwordHash })
        .where(eq(users.email, email))
        .returning();

      console.log('Seed user updated:');
      console.log({ id: user.id, name: user.name, email: user.email, phone: user.phone });
      return;
    }

    const [user] = await db
      .insert(users)
      .values({ name, email, passwordHash, phone })
      .returning();

    console.log('Seed user created:');
    console.log({ id: user.id, name: user.name, email: user.email, phone: user.phone });
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Seeding failed:', error);
  process.exitCode = 1;
});
