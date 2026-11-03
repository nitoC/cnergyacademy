import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { PaginationQueryDto } from '../common/pagination';
import { UsersService } from './users.service';
import {
  AdminUserQueryDto,
  ApplicationQueryDto,
  AssignRolesDto,
  CreatorApplicationDto,
  ReviewApplicationDto,
  UpdateProfileDto,
  UpdateStatusDto,
} from './users.dto';

@ApiTags('users')
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('users/me')
  @RequirePermissions('profile.manage')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Post('creator-applications')
  @RequirePermissions('creator.apply')
  apply(@CurrentUser() user: AuthUser, @Body() dto: CreatorApplicationDto) {
    return this.users.apply(user, dto);
  }

  @Get('creator-applications/mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.users.myApplications(user.id);
  }

  // ─── admin ───

  @Get('admin/users')
  @RequirePermissions('users.read')
  list(@Query() q: AdminUserQueryDto) {
    return this.users.list(q);
  }

  @Get('admin/users/:id')
  @RequirePermissions('users.read')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.detail(id);
  }

  @Patch('admin/users/:id/roles')
  @RequirePermissions('roles.assign')
  assignRoles(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignRolesDto, @Req() req: Request) {
    return this.users.assignRoles(actor, id, dto, req.ip);
  }

  @Patch('admin/users/:id/status')
  @RequirePermissions('users.manage')
  updateStatus(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStatusDto, @Req() req: Request) {
    return this.users.updateStatus(actor, id, dto, req.ip);
  }

  @Get('admin/roles')
  @RequirePermissions('users.read')
  roles() {
    return this.users.listRoles();
  }

  @Get('admin/creator-applications')
  @RequirePermissions('creators.review')
  applications(@Query() q: ApplicationQueryDto) {
    return this.users.listApplications(q);
  }

  @Post('admin/creator-applications/:id/review')
  @RequirePermissions('creators.review')
  review(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewApplicationDto, @Req() req: Request) {
    return this.users.reviewApplication(actor, id, dto, req.ip);
  }

  @Get('admin/creators')
  @RequirePermissions('creators.review')
  creators(@Query() q: PaginationQueryDto) {
    return this.users.creatorOverview(q);
  }
}
