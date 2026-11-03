import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CourseStatus } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser, Public, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { CoursesService } from './courses.service';
import { CurriculumService } from './curriculum.service';
import {
  AdminCourseQueryDto,
  CatalogQueryDto,
  CreateCourseDto,
  CreateLessonDto,
  CreateModuleDto,
  DecidePriceDto,
  ProposePriceDto,
  ReorderDto,
  TransitionDto,
  UpdateCourseDto,
  UpdateLessonDto,
  UpdateModuleDto,
} from './courses.dto';

class MineQueryDto {
  @IsOptional() @IsEnum(CourseStatus) status?: CourseStatus;
}

@ApiTags('courses')
@Controller()
export class CoursesController {
  constructor(private readonly courses: CoursesService, private readonly curriculum: CurriculumService) {}

  // ─── public ───
  @Public()
  @Get('courses')
  catalog(@Query() q: CatalogQueryDto) {
    return this.courses.catalog(q);
  }

  @Public()
  @Get('courses/:slugOrId')
  detail(@Param('slugOrId') slugOrId: string, @CurrentUser() user?: AuthUser) {
    return this.courses.publicDetail(slugOrId.slice(0, 120), user);
  }

  // ─── creator workspace ───
  @Get('creator/courses')
  @RequirePermissions('courses.create')
  mine(@CurrentUser() user: AuthUser, @Query() q: MineQueryDto) {
    return this.courses.mine(user, q.status);
  }

  @Post('creator/courses')
  @RequirePermissions('courses.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCourseDto) {
    return this.courses.create(user, dto);
  }

  @Get('creator/courses/:id')
  editor(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.courses.editorView(user, id);
  }

  @Patch('creator/courses/:id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCourseDto) {
    return this.courses.update(user, id, dto);
  }

  @Delete('creator/courses/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.courses.remove(user, id);
  }

  /** Workflow transitions (submit / withdraw / approve / reject / publish / unpublish / archive / restore). */
  @Post('courses/:id/transitions')
  transition(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TransitionDto, @Req() req: Request) {
    return this.courses.transition(user, id, dto, req.ip);
  }

  @Post('creator/courses/:id/price-proposals')
  @RequirePermissions('pricing.propose')
  propose(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProposePriceDto) {
    return this.courses.proposePrice(user, id, dto);
  }

  // ─── curriculum ───
  @Post('courses/:id/modules')
  createModule(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateModuleDto) {
    return this.curriculum.createModule(user, id, dto);
  }

  @Put('courses/:id/modules/order')
  reorderModules(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderDto) {
    return this.curriculum.reorderModules(user, id, dto.ids);
  }

  @Patch('modules/:id')
  updateModule(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateModuleDto) {
    return this.curriculum.updateModule(user, id, dto);
  }

  @Delete('modules/:id')
  deleteModule(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.curriculum.deleteModule(user, id);
  }

  @Post('modules/:id/lessons')
  createLesson(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateLessonDto) {
    return this.curriculum.createLesson(user, id, dto);
  }

  @Put('modules/:id/lessons/order')
  reorderLessons(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderDto) {
    return this.curriculum.reorderLessons(user, id, dto.ids);
  }

  @Get('creator/lessons/:id')
  lessonEditor(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.curriculum.getLessonForEditor(user, id);
  }

  @Patch('lessons/:id')
  updateLesson(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLessonDto) {
    return this.curriculum.updateLesson(user, id, dto);
  }

  @Delete('lessons/:id')
  deleteLesson(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.curriculum.deleteLesson(user, id);
  }

  // ─── administration ───
  @Get('admin/courses')
  @RequirePermissions('courses.review')
  adminList(@Query() q: AdminCourseQueryDto) {
    return this.courses.adminList(q);
  }

  @Get('admin/courses/:id')
  @RequirePermissions('courses.review')
  adminDetail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.courses.editorView(user, id);
  }

  @Get('admin/price-proposals')
  @RequirePermissions('pricing.approve')
  proposals() {
    return this.courses.pendingPriceProposals();
  }

  @Post('admin/price-proposals/:id/decision')
  @RequirePermissions('pricing.approve')
  decide(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecidePriceDto, @Req() req: Request) {
    return this.courses.decidePrice(user, id, dto, req.ip);
  }
}
