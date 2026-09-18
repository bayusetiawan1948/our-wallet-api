import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { AuditLog } from '../../shared/database/schema';
import { HouseholdsService } from '../households/households.service';
import { AuditLogsRepository } from './audit-logs.repository';

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(
    private readonly auditLogsRepository: AuditLogsRepository,
    private readonly householdsService: HouseholdsService,
  ) {}

  async log(
    actorId: string,
    entityType: string,
    entityId: string | null,
    action: string,
    beforeData?: Record<string, unknown> | null,
    afterData?: Record<string, unknown> | null,
  ): Promise<void> {
    try {
      await this.auditLogsRepository.Create({
        actorId,
        entityType,
        entityId,
        action,
        beforeData: beforeData ?? null,
        afterData: afterData ?? null,
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit log for ${entityType}:${action}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async listForHousehold(currentUser: AuthenticatedUser): Promise<AuditLog[]> {
    if (currentUser.role !== 'admin') {
      throw new ForbiddenException(
        'Only household admin can view the audit log',
      );
    }

    if (!currentUser.householdId) {
      throw new ForbiddenException('You do not belong to a household yet');
    }

    const members = await this.householdsService.ListMembers(currentUser);
    const actorIds = members.map((m) => m.userId);

    return this.auditLogsRepository.ListByActorIds(actorIds);
  }
}
