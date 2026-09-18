import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../shared/database/database.provider';
import { NewSession, Session, sessions } from '../../shared/database/schema';

@Injectable()
export class AuthRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  async CreateSession(data: NewSession): Promise<Session> {
    const [created] = await this.db.insert(sessions).values(data).returning();

    return created;
  }

  async FindSessionById(id: string): Promise<Session | undefined> {
    const [found] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);

    return found;
  }

  async UpdateRefreshToken(
    id: string,
    refreshTokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.db
      .update(sessions)
      .set({ refreshTokenHash, expiresAt, updatedAt: new Date() })
      .where(eq(sessions.id, id));
  }

  async RevokeSession(id: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ isRevoked: true, updatedAt: new Date() })
      .where(eq(sessions.id, id));
  }
}
