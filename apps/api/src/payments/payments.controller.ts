import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, MaxLength, MinLength } from 'class-validator';
import { LedgerEntryType, PaymentStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import { CurrentUser, Public, RequirePermissions, SkipCsrf } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { PaginationQueryDto } from '../common/pagination';
import { PaymentsService } from './payments.service';
import { FinanceService } from './finance.service';

class InitializeDto {
  @IsUUID() courseId: string;
}
class VerifyDto {
  @IsString() @MinLength(6) @MaxLength(80) reference: string;
}
class SandboxCompleteDto {
  @IsIn(['success', 'failed', 'abandoned']) outcome: 'success' | 'failed' | 'abandoned';
}
class PaymentQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(PaymentStatus) status?: PaymentStatus;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() flagged?: boolean;
}
class RefundDto {
  @IsString() @MinLength(5) @MaxLength(500) reason: string;
}
class LedgerQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(LedgerEntryType) type?: LedgerEntryType;
  @IsOptional() @IsUUID() creatorId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
class RangeDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
class AdjustmentDto {
  @IsNumber({ maxDecimalPlaces: 2 }) amount: number;
  @IsString() @Length(3, 3) currency: string;
  @IsString() @MinLength(5) @MaxLength(300) memo: string;
  @IsOptional() @IsUUID() creatorId?: string;
  @IsOptional() @IsUUID() courseId?: string;
}

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService, private readonly finance: FinanceService) {}

  @Post('payments/initialize')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  initialize(@CurrentUser() user: AuthUser, @Body() dto: InitializeDto) {
    return this.payments.initialize(user, dto.courseId);
  }

  @Post('payments/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  verify(@CurrentUser() user: AuthUser, @Body() dto: VerifyDto) {
    return this.payments.verifyForUser(user, dto.reference);
  }

  /** Provider → API. Authenticated by HMAC signature over the raw body, not by session. */
  @Public()
  @SkipCsrf()
  @Post('payments/webhook')
  @HttpCode(200)
  webhook(@Req() req: Request & { rawBody?: Buffer }, @Body() body: unknown) {
    return this.payments.handleWebhook(req.rawBody, req.headers, body);
  }

  @Get('payments/mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.payments.myTransactions(user.id);
  }

  @Get('payments/sandbox/:reference')
  sandbox(@CurrentUser() user: AuthUser, @Param('reference') reference: string) {
    return this.payments.sandboxCharge(user, reference);
  }

  @Post('payments/sandbox/:reference/complete')
  @HttpCode(200)
  sandboxComplete(@CurrentUser() user: AuthUser, @Param('reference') reference: string, @Body() dto: SandboxCompleteDto) {
    return this.payments.sandboxComplete(user, reference, dto.outcome);
  }

  @Get('creator/earnings')
  @RequirePermissions('courses.create')
  earnings(@CurrentUser() user: AuthUser) {
    return this.finance.creatorEarnings(user.id);
  }

  // ─── admin ───
  @Get('admin/payments')
  @RequirePermissions('payments.read')
  list(@Query() q: PaymentQueryDto) {
    return this.payments.adminList(q);
  }

  @Get('admin/payments/:id')
  @RequirePermissions('payments.read')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.payments.adminDetail(id);
  }

  @Post('admin/payments/reconcile')
  @HttpCode(200)
  @RequirePermissions('payments.manage')
  reconcileAll(@CurrentUser() user: AuthUser) {
    return this.payments.reconcilePending(user);
  }

  @Post('admin/payments/:id/reconcile')
  @HttpCode(200)
  @RequirePermissions('payments.manage')
  reconcile(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.reconcile(user, id);
  }

  @Post('admin/payments/:id/refund')
  @HttpCode(200)
  @RequirePermissions('payments.manage')
  refund(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundDto, @Req() req: Request) {
    return this.payments.refund(user, id, dto.reason, req.ip);
  }

  @Get('admin/finance/summary')
  @RequirePermissions('finance.read')
  summary(@Query() q: RangeDto) {
    return this.finance.summary(q.from, q.to);
  }

  @Get('admin/finance/ledger')
  @RequirePermissions('finance.read')
  ledger(@Query() q: LedgerQueryDto) {
    return this.finance.ledger(q);
  }

  @Get('admin/finance/ledger.csv')
  @RequirePermissions('finance.read')
  async exportCsv(@Query() q: LedgerQueryDto, @Res() res: Response) {
    const csv = await this.finance.exportCsv(q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ledger-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }

  @Post('admin/finance/adjustments')
  @RequirePermissions('payments.manage')
  adjust(@CurrentUser() user: AuthUser, @Body() dto: AdjustmentDto) {
    return this.payments.adjustment(user, dto);
  }
}
