import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditLogsController } from './audit-logs.controller';

@Global()
@Module({ providers: [AuditService], controllers: [AuditLogsController], exports: [AuditService] })
export class AuditModule {}
