import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { CurrentUser, Public, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { LearningService } from './learning.service';
import { AccessService } from './access.service';

class EnrollDto {
  @IsUUID() courseId: string;
}

@ApiTags('learning')
@Controller()
export class LearningController {
  constructor(private readonly learning: LearningService, private readonly access: AccessService) {}

  @Post('enrollments')
  @RequirePermissions('courses.learn')
  enroll(@CurrentUser() user: AuthUser, @Body() dto: EnrollDto) {
    return this.learning.enroll(user, dto.courseId);
  }

  @Get('enrollments/mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.learning.myCourses(user);
  }

  @Get('learn/dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.learning.dashboard(user);
  }

  @Get('learn/courses/:id/journey')
  journey(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.journey(user, id);
  }

  /** Read-only course map for anyone, signed in or not, paid or not. */
  @Public()
  @Get('courses/:id/map')
  map(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    return this.learning.journey(user, id);
  }

  @Get('learn/courses/:id/resume')
  resume(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.resume(user, id);
  }

  @Get('learn/courses/:courseId/modules/:moduleId/access')
  moduleAccess(@CurrentUser() user: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string, @Param('moduleId', ParseUUIDPipe) moduleId: string) {
    return this.access.evaluateModuleAccess({ user, courseId, moduleId });
  }

  @Get('learn/lessons/:id')
  lesson(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.readLesson(user, id);
  }

  @Post('learn/lessons/:id/complete')
  @HttpCode(200)
  complete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.completeLesson(user, id);
  }
}
