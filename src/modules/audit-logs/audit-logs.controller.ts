import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { AuditLog } from '../../shared/database/schema';
import { AuditLogsService } from './audit-logs.service';

@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentUser() currentUser: AuthenticatedUser) {
    const logs = await this.auditLogsService.listForHousehold(currentUser);

    return logs.map((log) => this.toResponse(log));
  }

  private toResponse(log: AuditLog) {
    return {
      id: log.id,
      actor_id: log.actorId,
      entity_type: log.entityType,
      entity_id: log.entityId,
      action: log.action,
      before_data: log.beforeData,
      after_data: log.afterData,
      created_at: log.createdAt,
    };
  }
}
