import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { PaginationQueryDto } from '../common/pagination';
import { MentorshipService } from './mentorship.service';
import { AssignMentorDto, CreateThreadDto, MentorAssignmentDto, MessageDto, MessagesQueryDto, ThreadQueryDto } from './mentorship.dto';

@ApiTags('mentorship')
@Controller()
export class MentorshipController {
  constructor(private readonly mentorship: MentorshipService) {}

  @Post('support-threads')
  @RequirePermissions('support.ask')
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateThreadDto) {
    return this.mentorship.create(u, dto);
  }

  @Get('support-threads')
  list(@CurrentUser() u: AuthUser, @Query() q: ThreadQueryDto) {
    return this.mentorship.list(u, q);
  }

  @Get('support-threads/unread-count')
  unread(@CurrentUser() u: AuthUser) {
    return this.mentorship.unreadCount(u);
  }

  @Get('support-threads/:id')
  detail(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.mentorship.detail(u, id);
  }

  @Get('support-threads/:id/messages')
  messages(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: MessagesQueryDto) {
    return this.mentorship.messages(u, id, q);
  }

  @Post('support-threads/:id/messages')
  post(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MessageDto) {
    return this.mentorship.post(u, id, dto.body);
  }

  @Post('support-threads/:id/read')
  @HttpCode(200)
  read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.mentorship.markRead(u, id);
  }

  @Post('support-threads/:id/resolve')
  @HttpCode(200)
  resolve(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.mentorship.setStatus(u, id, 'resolve');
  }

  @Post('support-threads/:id/reopen')
  @HttpCode(200)
  reopen(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.mentorship.setStatus(u, id, 'reopen');
  }

  @Patch('support-threads/:id/mentor')
  assignMentor(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignMentorDto, @Req() req: Request) {
    return this.mentorship.assignMentor(u, id, dto, req.ip);
  }

  @Get('admin/mentors')
  @RequirePermissions('mentors.manage')
  mentors(@Query() q: PaginationQueryDto) {
    return this.mentorship.mentors(q);
  }

  @Post('admin/mentor-assignments')
  @RequirePermissions('mentors.manage')
  assign(@CurrentUser() u: AuthUser, @Body() dto: MentorAssignmentDto) {
    return this.mentorship.assign(u, dto);
  }

  @Delete('admin/mentor-assignments/:id')
  @RequirePermissions('mentors.manage')
  unassign(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.mentorship.unassign(u, id);
  }
}
