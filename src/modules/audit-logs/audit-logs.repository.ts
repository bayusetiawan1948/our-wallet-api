import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../shared/database/database.provider';
import { AuditLog, auditLogs, NewAuditLog } from '../../shared/database/schema';

@Injectable()
export class AuditLogsRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  async Create(data: NewAuditLog): Promise<AuditLog> {
    const [created] = await this.db.insert(auditLogs).values(data).returning();

    return created;
  }

  async ListByActorIds(actorIds: string[]): Promise<AuditLog[]> {
    if (actorIds.length === 0) {
      return [];
    }

    return this.db
      .select()
      .from(auditLogs)
      .where(inArray(auditLogs.actorId, actorIds))
      .orderBy(desc(auditLogs.createdAt));
  }

  async ListByActor(actorId: string): Promise<AuditLog[]> {
    return this.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.actorId, actorId))
      .orderBy(desc(auditLogs.createdAt));
  }
}
