import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { CurrentUser, Public, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { PaginationQueryDto } from '../common/pagination';
import { CertificatesService } from './certificates.service';

class RevokeDto {
  @IsString() @MinLength(5) @MaxLength(500) reason: string;
}
class CertificateQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(['VALID', 'REVOKED']) status?: 'VALID' | 'REVOKED';
}

@ApiTags('certificates')
@Controller()
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get('certificates/mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.certificates.mine(user.id);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('certificates/verify/:code')
  verify(@Param('code') code: string) {
    return this.certificates.verify(code.slice(0, 40));
  }

  @Get('certificates/:id/pdf')
  async pdf(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { buffer, filename } = await this.certificates.pdf(user, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('admin/certificates')
  @RequirePermissions('certificates.manage')
  list(@Query() q: CertificateQueryDto) {
    return this.certificates.adminList(q);
  }

  @Post('admin/certificates/:id/revoke')
  @RequirePermissions('certificates.manage')
  revoke(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RevokeDto, @Req() req: Request) {
    return this.certificates.revoke(user, id, dto.reason, req.ip);
  }
}
