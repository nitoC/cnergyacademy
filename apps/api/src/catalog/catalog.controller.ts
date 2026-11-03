import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { CatalogService } from './catalog.service';
import { CategoryDto, ReorderDto, SubjectDto, UpdateCategoryDto, UpdateSubjectDto } from './catalog.dto';

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get('subjects')
  subjects() {
    return this.catalog.publicSubjects();
  }

  @Get('admin/subjects')
  @RequirePermissions('catalog.manage')
  adminSubjects() {
    return this.catalog.adminSubjects();
  }

  @Post('admin/subjects')
  @RequirePermissions('catalog.manage')
  createSubject(@CurrentUser() u: AuthUser, @Body() dto: SubjectDto) {
    return this.catalog.createSubject(u.id, dto);
  }

  @Put('admin/subjects/order')
  @RequirePermissions('catalog.manage')
  reorderSubjects(@CurrentUser() u: AuthUser, @Body() dto: ReorderDto) {
    return this.catalog.reorderSubjects(u.id, dto.ids);
  }

  @Patch('admin/subjects/:id')
  @RequirePermissions('catalog.manage')
  updateSubject(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSubjectDto) {
    return this.catalog.updateSubject(u.id, id, dto);
  }

  @Post('admin/categories')
  @RequirePermissions('catalog.manage')
  createCategory(@CurrentUser() u: AuthUser, @Body() dto: CategoryDto) {
    return this.catalog.createCategory(u.id, dto);
  }

  @Patch('admin/categories/:id')
  @RequirePermissions('catalog.manage')
  updateCategory(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) {
    return this.catalog.updateCategory(u.id, id, dto);
  }

  @Put('admin/subjects/:id/categories/order')
  @RequirePermissions('catalog.manage')
  reorderCategories(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderDto) {
    return this.catalog.reorderCategories(u.id, id, dto.ids);
  }
}
