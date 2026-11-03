import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, Public, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { PaginationQueryDto } from '../common/pagination';
import { RoadmapsService } from './roadmaps.service';
import { AdminRoadmapQueryDto, CreateRoadmapDto, EdgeDto, NodeDto, ReorderNodesDto, RoadmapDecisionDto, UpdateNodeDto, UpdateRoadmapDto } from './roadmaps.dto';

@ApiTags('roadmaps')
@Controller()
export class RoadmapsController {
  constructor(private readonly roadmaps: RoadmapsService) {}

  @Public()
  @Get('roadmaps')
  list(@Query() q: PaginationQueryDto) {
    return this.roadmaps.listPublished(q.search);
  }

  @Public()
  @Get('roadmaps/:slugOrId')
  view(@Param('slugOrId') slugOrId: string, @CurrentUser() user?: AuthUser) {
    return this.roadmaps.view(slugOrId.slice(0, 120), user);
  }

  @Post('roadmap-nodes/:id/complete')
  @HttpCode(200)
  complete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.roadmaps.completeNode(user, id);
  }

  @Delete('roadmap-nodes/:id/complete')
  uncomplete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.roadmaps.uncompleteNode(user, id);
  }

  // authoring
  @Get('creator/roadmaps')
  @RequirePermissions('roadmaps.create')
  mine(@CurrentUser() user: AuthUser) {
    return this.roadmaps.mine(user);
  }

  @Post('creator/roadmaps')
  @RequirePermissions('roadmaps.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRoadmapDto) {
    return this.roadmaps.create(user, dto);
  }

  @Get('creator/roadmaps/:id')
  editor(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.roadmaps.editor(user, id);
  }

  @Patch('creator/roadmaps/:id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoadmapDto) {
    return this.roadmaps.update(user, id, dto);
  }

  @Delete('creator/roadmaps/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.roadmaps.remove(user, id);
  }

  @Post('creator/roadmaps/:id/nodes')
  addNode(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NodeDto) {
    return this.roadmaps.addNode(user, id, dto);
  }

  @Put('creator/roadmaps/:id/nodes/order')
  reorder(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderNodesDto) {
    return this.roadmaps.reorderNodes(user, id, dto.ids);
  }

  @Patch('creator/roadmap-nodes/:id')
  updateNode(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNodeDto) {
    return this.roadmaps.updateNode(user, id, dto);
  }

  @Delete('creator/roadmap-nodes/:id')
  deleteNode(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.roadmaps.deleteNode(user, id);
  }

  @Post('creator/roadmaps/:id/edges')
  addEdge(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EdgeDto) {
    return this.roadmaps.addEdge(user, id, dto);
  }

  @Delete('creator/roadmap-edges/:id')
  deleteEdge(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.roadmaps.deleteEdge(user, id);
  }

  @Post('roadmaps/:id/decisions')
  decide(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RoadmapDecisionDto, @Req() req: Request) {
    return this.roadmaps.decide(user, id, dto, req.ip);
  }

  @Get('admin/roadmaps')
  @RequirePermissions('roadmaps.publish')
  adminList(@Query() q: AdminRoadmapQueryDto) {
    return this.roadmaps.adminList(q);
  }
}
