import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { RequirePermissions } from '../common/decorators';
import { PaginationQueryDto } from '../common/pagination';
import { AuditService } from './audit.service';

class AuditQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() resourceType?: string;
  @IsOptional() @IsUUID() actorId?: string;
}

@ApiTags('admin')
@Controller('admin/audit-logs')
export class AuditLogsController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit.read')
  list(@Query() q: AuditQueryDto) {
    return this.audit.list(q);
  }
}
