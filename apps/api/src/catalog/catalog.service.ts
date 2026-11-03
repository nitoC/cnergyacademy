import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit-logs/audit.service';
import { slugify } from '../common/util';
import type { CategoryDto, SubjectDto, UpdateCategoryDto, UpdateSubjectDto } from './catalog.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Public listing: active subjects with active categories and published course counts. */
  async publicSubjects() {
    const subjects = await this.prisma.subject.findMany({
      where: { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        categories: { where: { archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
        _count: { select: { courses: { where: { status: 'PUBLISHED' } } } },
      },
    });
    return subjects.map(({ _count, ...s }) => ({ ...s, publishedCourses: _count.courses }));
  }

  adminSubjects() {
    return this.prisma.subject.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        categories: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { _count: { select: { courses: true } } } },
        _count: { select: { courses: true } },
      },
    });
  }

  async createSubject(actorId: string, dto: SubjectDto) {
    const slug = slugify(dto.name);
    if (!slug) throw new BadRequestException({ code: 'INVALID_NAME', message: 'Name must contain letters or numbers' });
    const max = await this.prisma.subject.aggregate({ _max: { sortOrder: true } });
    const subject = await this.prisma.subject.create({
      data: { name: dto.name, slug, description: dto.description, accentColor: dto.accentColor ?? 'forest', sortOrder: dto.sortOrder ?? (max._max.sortOrder ?? 0) + 1 },
    });
    await this.audit.record({ actorId, action: 'subject.create', resourceType: 'Subject', resourceId: subject.id, metadata: { name: dto.name } });
    return subject;
  }

  async updateSubject(actorId: string, id: string, dto: UpdateSubjectDto) {
    const existing = await this.prisma.subject.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Subject not found' });
    const subject = await this.prisma.subject.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.name ? slugify(dto.name) : undefined,
        description: dto.description,
        accentColor: dto.accentColor,
        sortOrder: dto.sortOrder,
        archivedAt: dto.archived === undefined ? undefined : dto.archived ? new Date() : null,
      },
    });
    await this.audit.record({ actorId, action: 'subject.update', resourceType: 'Subject', resourceId: id, metadata: { ...dto } });
    return subject;
  }

  async reorderSubjects(actorId: string, ids: string[]) {
    await this.prisma.$transaction(ids.map((id, i) => this.prisma.subject.update({ where: { id }, data: { sortOrder: i + 1 } })));
    await this.audit.record({ actorId, action: 'subject.reorder', resourceType: 'Subject', metadata: { ids } });
    return { ok: true };
  }

  async createCategory(actorId: string, dto: CategoryDto) {
    const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
    if (!subject) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Subject not found' });
    const slug = slugify(dto.name);
    const exists = await this.prisma.category.findUnique({ where: { subjectId_slug: { subjectId: dto.subjectId, slug } } });
    if (exists) throw new ConflictException({ code: 'ALREADY_EXISTS', message: 'This subject already has a category with that name' });
    const max = await this.prisma.category.aggregate({ where: { subjectId: dto.subjectId }, _max: { sortOrder: true } });
    const category = await this.prisma.category.create({
      data: { subjectId: dto.subjectId, name: dto.name, slug, description: dto.description, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
    await this.audit.record({ actorId, action: 'category.create', resourceType: 'Category', resourceId: category.id, metadata: { name: dto.name } });
    return category;
  }

  async updateCategory(actorId: string, id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.name ? slugify(dto.name) : undefined,
        description: dto.description,
        archivedAt: dto.archived === undefined ? undefined : dto.archived ? new Date() : null,
      },
    });
    await this.audit.record({ actorId, action: dto.archived ? 'category.archive' : 'category.update', resourceType: 'Category', resourceId: id, metadata: { ...dto } });
    return category;
  }

  async reorderCategories(actorId: string, subjectId: string, ids: string[]) {
    const owned = await this.prisma.category.count({ where: { subjectId, id: { in: ids } } });
    if (owned !== ids.length) throw new BadRequestException({ code: 'INVALID_ORDER', message: 'All categories must belong to this subject' });
    await this.prisma.$transaction(ids.map((id, i) => this.prisma.category.update({ where: { id }, data: { sortOrder: i + 1 } })));
    await this.audit.record({ actorId, action: 'category.reorder', resourceType: 'Subject', resourceId: subjectId, metadata: { ids } });
    return { ok: true };
  }
}
