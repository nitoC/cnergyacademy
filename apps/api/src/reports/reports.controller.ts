import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('admin/overview')
  @RequirePermissions('admin.access')
  overview() {
    return this.reports.adminOverview();
  }

  @Get('admin/reports/learners')
  @RequirePermissions('reports.read')
  learners() {
    return this.reports.learnerReport();
  }

  @Get('creator/dashboard')
  @RequirePermissions('courses.create')
  creator(@CurrentUser() user: AuthUser) {
    return this.reports.creatorDashboard(user);
  }

  @Get('creator/courses/:id/learners')
  courseLearners(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.courseLearners(user, id);
  }
}
