import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../shared/database/database.provider';
import { NewUser, User, users } from '../../shared/database/schema';

@Injectable()
export class UsersRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  async FindByEmail(email: string): Promise<User | undefined> {
    const [found] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return found;
  }

  async FindById(id: string): Promise<User | undefined> {
    const [found] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return found;
  }

  async Create(data: NewUser): Promise<User> {
    const [created] = await this.db.insert(users).values(data).returning();

    return created;
  }
}
