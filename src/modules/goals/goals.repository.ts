import { Inject, Injectable } from '@nestjs/common';
import { eq, or } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../shared/database/database.provider';
import { Goal, goals, NewGoal } from '../../shared/database/schema';

@Injectable()
export class GoalsRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  async Create(data: NewGoal): Promise<Goal> {
    const [created] = await this.db.insert(goals).values(data).returning();

    return created;
  }

  async FindById(id: string): Promise<Goal | undefined> {
    const [found] = await this.db
      .select()
      .from(goals)
      .where(eq(goals.id, id))
      .limit(1);

    return found;
  }

  async FindAccessible(
    userId: string,
    householdId: string | null,
  ): Promise<Goal[]> {
    const conditions = [eq(goals.ownerUserId, userId)];

    if (householdId) {
      conditions.push(eq(goals.ownerHouseholdId, householdId));
    }

    return this.db
      .select()
      .from(goals)
      .where(or(...conditions));
  }

  async Update(id: string, data: Partial<NewGoal>): Promise<Goal | undefined> {
    const [updated] = await this.db
      .update(goals)
      .set(data)
      .where(eq(goals.id, id))
      .returning();

    return updated;
  }

  async Delete(id: string): Promise<void> {
    await this.db.delete(goals).where(eq(goals.id, id));
  }
}
