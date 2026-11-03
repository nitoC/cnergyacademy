import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RoadmapStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit-logs/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { paginate, skipTake } from '../common/pagination';
import { slugify } from '../common/util';
import type { AuthUser } from '../common/auth-user';
import { computeNodeStates, levels, NodeFacts, validateGraph, wouldCreateCycle } from './roadmap-graph';
import type { AdminRoadmapQueryDto, CreateRoadmapDto, EdgeDto, NodeDto, RoadmapDecisionDto, UpdateNodeDto, UpdateRoadmapDto } from './roadmaps.dto';

const NODE_INCLUDE = {
  course: { select: { id: true, title: true, slug: true, status: true, approvedPrice: true, currency: true, estimatedMinutes: true, difficulty: true } },
} satisfies Prisma.RoadmapNodeInclude;

@Injectable()
export class RoadmapsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────── Public / learner ─────────────

  async listPublished(search?: string) {
    const roadmaps = await this.prisma.roadmap.findMany({
      where: { status: 'PUBLISHED', ...(search ? { OR: [{ title: { contains: search, mode: 'insensitive' } }, { summary: { contains: search, mode: 'insensitive' } }] } : {}) },
      orderBy: { publishedAt: 'desc' },
      include: { owner: { select: { fullName: true } }, nodes: { select: { type: true, course: { select: { estimatedMinutes: true } } } } },
    });
    return roadmaps.map(({ nodes, ...r }) => ({
      ...r,
      nodeCount: nodes.length,
      courseCount: nodes.filter((n) => n.type === 'COURSE').length,
      estimatedMinutes: nodes.reduce((s, n) => s + (n.course?.estimatedMinutes ?? 0), 0),
    }));
  }

  private async load(where: Prisma.RoadmapWhereUniqueInput) {
    const roadmap = await this.prisma.roadmap.findUnique({
      where,
      include: {
        owner: { select: { id: true, fullName: true } },
        nodes: { orderBy: { position: 'asc' }, include: NODE_INCLUDE },
        edges: true,
      },
    });
    if (!roadmap) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Roadmap not found' });
    return roadmap;
  }

  /** Published roadmap with node states computed from the viewer's actual progress and entitlements. */
  async view(slugOrId: string, user?: AuthUser) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(slugOrId);
    const roadmap = await this.load(isUuid ? { id: slugOrId } : { slug: slugOrId });
    const canPreview = !!user && (roadmap.ownerId === user.id || user.permissions.has('roadmaps.publish'));
    if (roadmap.status !== 'PUBLISHED' && !canPreview) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Roadmap not found' });
    return { ...(await this.withStates(roadmap, user)), preview: roadmap.status !== 'PUBLISHED' };
  }

  private async withStates(roadmap: Awaited<ReturnType<RoadmapsService['load']>>, user?: AuthUser) {
    const courseIds = roadmap.nodes.map((n) => n.courseId).filter((x): x is string => !!x);
    const [enrollments, entitlements, completions] = user
      ? await Promise.all([
          this.prisma.courseEnrollment.findMany({ where: { userId: user.id, courseId: { in: courseIds } } }),
          this.prisma.courseEntitlement.findMany({ where: { userId: user.id, courseId: { in: courseIds }, revokedAt: null } }),
          this.prisma.learnerRoadmapProgress.findMany({ where: { userId: user.id, nodeId: { in: roadmap.nodes.map((n) => n.id) } } }),
        ])
      : [[], [], []];
    const enrolledBy = new Map(enrollments.map((e) => [e.courseId, e]));
    const owned = new Set(entitlements.map((e) => e.courseId));
    const doneNodes = new Set(completions.map((c) => c.nodeId));
    const facts = new Map<string, NodeFacts>(
      roadmap.nodes.map((n) => {
        const isCourse = n.type === 'COURSE' && !!n.course;
        const enrollment = n.courseId ? enrolledBy.get(n.courseId) : undefined;
        const price = n.course?.approvedPrice ? Number(n.course.approvedPrice) : 0;
        return [
          n.id,
          {
            id: n.id,
            isCourse,
            completed: isCourse ? !!enrollment?.completedAt : doneNodes.has(n.id),
            inProgress: isCourse && !!enrollment && !enrollment.completedAt,
            premiumLocked: isCourse && price > 0 && !owned.has(n.courseId!),
          },
        ];
      }),
    );
    const states = computeNodeStates(roadmap.nodes, roadmap.edges, facts);
    const level = levels(roadmap.nodes, roadmap.edges);
    const completed = roadmap.nodes.filter((n) => facts.get(n.id)!.completed).length;
    return {
      id: roadmap.id,
      title: roadmap.title,
      slug: roadmap.slug,
      summary: roadmap.summary,
      status: roadmap.status,
      owner: roadmap.owner,
      publishedAt: roadmap.publishedAt,
      progress: { completed, total: roadmap.nodes.length, percent: roadmap.nodes.length ? Math.round((completed / roadmap.nodes.length) * 100) : 0 },
      nodes: roadmap.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        description: n.description,
        position: n.position,
        isOptional: n.isOptional,
        metadata: n.metadata,
        level: level.get(n.id) ?? 0,
        course: n.course ? { ...n.course, approvedPrice: n.course.approvedPrice ? Number(n.course.approvedPrice) : null } : null,
        ...states.get(n.id)!,
      })),
      edges: roadmap.edges.map((e) => ({ id: e.id, fromNodeId: e.fromNodeId, toNodeId: e.toNodeId })),
    };
  }

  async completeNode(user: AuthUser, nodeId: string) {
    const node = await this.prisma.roadmapNode.findUnique({ where: { id: nodeId }, include: { roadmap: true } });
    if (!node || node.roadmap.status !== 'PUBLISHED') throw new NotFoundException({ code: 'NOT_FOUND', message: 'Node not found' });
    if (node.type === 'COURSE') throw new BadRequestException({ code: 'COURSE_NODE', message: 'Course nodes complete automatically when you finish the course' });
    const view = await this.view(node.roadmapId, user);
    const state = view.nodes.find((n) => n.id === nodeId)!;
    if (state.state !== 'AVAILABLE' && state.state !== 'COMPLETED') {
      throw new ForbiddenException({ code: 'PREREQUISITE_NOT_COMPLETED', message: 'Complete the prerequisites first' });
    }
    await this.prisma.learnerRoadmapProgress.upsert({ where: { userId_nodeId: { userId: user.id, nodeId } }, create: { userId: user.id, nodeId }, update: {} });
    return this.view(node.roadmapId, user);
  }

  async uncompleteNode(user: AuthUser, nodeId: string) {
    await this.prisma.learnerRoadmapProgress.deleteMany({ where: { userId: user.id, nodeId } });
    const node = await this.prisma.roadmapNode.findUniqueOrThrow({ where: { id: nodeId } });
    return this.view(node.roadmapId, user);
  }

  // ───────────── Authoring ─────────────

  private async manageable(user: AuthUser, roadmapId: string) {
    const roadmap = await this.prisma.roadmap.findUnique({ where: { id: roadmapId } });
    if (!roadmap) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Roadmap not found' });
    const isOwner = roadmap.ownerId === user.id && user.permissions.has('roadmaps.create');
    if (!isOwner && !user.permissions.has('roadmaps.publish')) {
      throw new ForbiddenException({ code: 'ACCOUNT_NOT_AUTHORIZED', message: 'You can only edit your own roadmaps' });
    }
    if (roadmap.status === 'SUBMITTED' && !user.permissions.has('roadmaps.publish')) {
      throw new ConflictException({ code: 'ROADMAP_LOCKED', message: 'This roadmap is under review' });
    }
    return roadmap;
  }

  mine(user: AuthUser) {
    return this.prisma.roadmap.findMany({
      where: { ownerId: user.id },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { nodes: true, edges: true } } },
    });
  }

  async create(user: AuthUser, dto: CreateRoadmapDto) {
    const base = slugify(dto.title) || 'roadmap';
    let slug = base;
    for (let i = 2; await this.prisma.roadmap.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
    const roadmap = await this.prisma.roadmap.create({ data: { title: dto.title, summary: dto.summary, subjectId: dto.subjectId ?? null, ownerId: user.id, slug } });
    await this.audit.record({ actorId: user.id, action: 'roadmap.create', resourceType: 'Roadmap', resourceId: roadmap.id });
    return roadmap;
  }

  async editor(user: AuthUser, id: string) {
    await this.manageable(user, id).catch((err) => {
      // Reviewers may open submitted roadmaps; owners may view theirs while locked.
      if (err instanceof ConflictException) return;
      throw err;
    });
    const roadmap = await this.load({ id });
    const issues = validateGraph(
      roadmap.nodes.map((n) => ({ ...n, coursePublished: n.course ? n.course.status === 'PUBLISHED' : undefined })),
      roadmap.edges,
    );
    const level = levels(roadmap.nodes, roadmap.edges);
    return { ...roadmap, nodes: roadmap.nodes.map((n) => ({ ...n, level: level.get(n.id) ?? 0 })), issues };
  }

  async update(user: AuthUser, id: string, dto: UpdateRoadmapDto) {
    await this.manageable(user, id);
    return this.prisma.roadmap.update({ where: { id }, data: { title: dto.title, summary: dto.summary, subjectId: dto.subjectId } });
  }

  async remove(user: AuthUser, id: string) {
    const roadmap = await this.manageable(user, id);
    if (roadmap.status === 'PUBLISHED') throw new ConflictException({ code: 'ROADMAP_PUBLISHED', message: 'Archive a published roadmap instead of deleting it' });
    await this.prisma.roadmap.delete({ where: { id } });
    await this.audit.record({ actorId: user.id, action: 'roadmap.delete', resourceType: 'Roadmap', resourceId: id, metadata: { title: roadmap.title } });
    return { deleted: true };
  }

  private async assertCourseRef(courseId?: string | null) {
    if (!courseId) return;
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) throw new BadRequestException({ code: 'INVALID_COURSE', message: 'Course not found' });
  }

  async addNode(user: AuthUser, roadmapId: string, dto: NodeDto) {
    await this.manageable(user, roadmapId);
    if (dto.type === 'COURSE' && !dto.courseId) throw new BadRequestException({ code: 'COURSE_MISSING', message: 'Course nodes must reference a course' });
    await this.assertCourseRef(dto.courseId);
    const max = await this.prisma.roadmapNode.aggregate({ where: { roadmapId }, _max: { position: true } });
    return this.prisma.roadmapNode.create({
      data: {
        roadmapId,
        type: dto.type,
        title: dto.title,
        description: dto.description,
        courseId: dto.type === 'COURSE' ? dto.courseId : null,
        isOptional: dto.isOptional ?? false,
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
        position: (max._max.position ?? 0) + 1,
      },
      include: NODE_INCLUDE,
    });
  }

  async updateNode(user: AuthUser, nodeId: string, dto: UpdateNodeDto) {
    const node = await this.prisma.roadmapNode.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Node not found' });
    await this.manageable(user, node.roadmapId);
    const type = dto.type ?? node.type;
    const courseId = dto.courseId === undefined ? node.courseId : dto.courseId;
    if (type === 'COURSE' && !courseId) throw new BadRequestException({ code: 'COURSE_MISSING', message: 'Course nodes must reference a course' });
    await this.assertCourseRef(courseId);
    return this.prisma.roadmapNode.update({
      where: { id: nodeId },
      data: {
        type,
        title: dto.title,
        description: dto.description,
        courseId: type === 'COURSE' ? courseId : null,
        isOptional: dto.isOptional,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
      include: NODE_INCLUDE,
    });
  }

  async deleteNode(user: AuthUser, nodeId: string) {
    const node = await this.prisma.roadmapNode.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Node not found' });
    await this.manageable(user, node.roadmapId);
    await this.prisma.roadmapNode.delete({ where: { id: nodeId } });
    return { deleted: true };
  }

  async reorderNodes(user: AuthUser, roadmapId: string, ids: string[]) {
    await this.manageable(user, roadmapId);
    const existing = await this.prisma.roadmapNode.findMany({ where: { roadmapId }, select: { id: true } });
    if (existing.length !== ids.length || !existing.every((n) => ids.includes(n.id))) {
      throw new BadRequestException({ code: 'INVALID_ORDER', message: 'Provide every node exactly once' });
    }
    await this.prisma.$transaction(ids.map((id, i) => this.prisma.roadmapNode.update({ where: { id }, data: { position: i + 1 } })));
    return { ok: true };
  }

  async addEdge(user: AuthUser, roadmapId: string, dto: EdgeDto) {
    await this.manageable(user, roadmapId);
    const nodes = await this.prisma.roadmapNode.findMany({ where: { roadmapId, id: { in: [dto.fromNodeId, dto.toNodeId] } }, select: { id: true } });
    if (nodes.length !== 2) throw new BadRequestException({ code: 'INVALID_EDGE', message: 'Both nodes must belong to this roadmap and be different' });
    // Serialisable transaction so two concurrent edge inserts cannot jointly form a cycle.
    return this.prisma.$transaction(
      async (tx) => {
        const edges = await tx.roadmapEdge.findMany({ where: { roadmapId }, select: { fromNodeId: true, toNodeId: true } });
        if (edges.some((e) => e.fromNodeId === dto.fromNodeId && e.toNodeId === dto.toNodeId)) {
          throw new ConflictException({ code: 'ALREADY_EXISTS', message: 'These nodes are already connected' });
        }
        if (wouldCreateCycle(edges, dto)) {
          throw new BadRequestException({ code: 'CYCLE', message: 'That connection would create a circular prerequisite' });
        }
        return tx.roadmapEdge.create({ data: { roadmapId, fromNodeId: dto.fromNodeId, toNodeId: dto.toNodeId } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async deleteEdge(user: AuthUser, edgeId: string) {
    const edge = await this.prisma.roadmapEdge.findUnique({ where: { id: edgeId } });
    if (!edge) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Connection not found' });
    await this.manageable(user, edge.roadmapId);
    await this.prisma.roadmapEdge.delete({ where: { id: edgeId } });
    return { deleted: true };
  }

  async decide(user: AuthUser, id: string, dto: RoadmapDecisionDto, ip?: string) {
    const roadmap = await this.prisma.roadmap.findUnique({ where: { id } });
    if (!roadmap) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Roadmap not found' });
    const isOwner = roadmap.ownerId === user.id && user.permissions.has('roadmaps.create');
    const isReviewer = user.permissions.has('roadmaps.publish');
    const rules: Record<RoadmapDecisionDto['action'], { from: RoadmapStatus[]; to: RoadmapStatus; allowed: boolean }> = {
      submit: { from: ['DRAFT'], to: 'SUBMITTED', allowed: isOwner },
      publish: { from: isOwner && isReviewer ? ['DRAFT', 'SUBMITTED'] : ['SUBMITTED'], to: 'PUBLISHED', allowed: isReviewer },
      reject: { from: ['SUBMITTED'], to: 'DRAFT', allowed: isReviewer },
      unpublish: { from: ['PUBLISHED'], to: 'DRAFT', allowed: isReviewer },
      archive: { from: ['DRAFT', 'PUBLISHED'], to: 'ARCHIVED', allowed: isOwner || isReviewer },
    };
    const rule = rules[dto.action];
    if (!rule.allowed) throw new ForbiddenException({ code: 'ACCOUNT_NOT_AUTHORIZED', message: 'You cannot do this' });
    if (!rule.from.includes(roadmap.status)) throw new ConflictException({ code: 'INVALID_TRANSITION', message: `Cannot ${dto.action} a ${roadmap.status.toLowerCase()} roadmap` });
    if (dto.action === 'reject' && !dto.note?.trim()) throw new BadRequestException({ code: 'FEEDBACK_REQUIRED', message: 'Explain what needs to change' });
    if (dto.action === 'submit' || dto.action === 'publish') {
      const full = await this.load({ id });
      const issues = validateGraph(full.nodes.map((n) => ({ ...n, coursePublished: n.course ? n.course.status === 'PUBLISHED' : undefined })), full.edges);
      if (issues.length) throw new BadRequestException({ code: 'ROADMAP_INVALID', message: 'Fix the roadmap structure first', details: issues });
    }
    const updated = await this.prisma.roadmap.update({
      where: { id },
      data: { status: rule.to, reviewNote: dto.note ?? null, ...(rule.to === 'PUBLISHED' ? { publishedAt: new Date() } : {}) },
    });
    await this.audit.record({ actorId: user.id, action: `roadmap.${dto.action}`, resourceType: 'Roadmap', resourceId: id, ipAddress: ip, metadata: { from: roadmap.status, to: rule.to, note: dto.note } });
    if (roadmap.ownerId !== user.id) {
      await this.notifications.notify(roadmap.ownerId, { type: 'roadmap.decision', title: `Roadmap ${pastTense(dto.action)}: ${roadmap.title}`, body: dto.note, link: `/creator/roadmaps/${id}` });
    } else if (dto.action === 'submit') {
      const admins = await this.prisma.userRole.findMany({ where: { role: { key: 'ADMIN' } }, select: { userId: true } });
      await this.notifications.notify(admins.map((a) => a.userId), { type: 'roadmap.decision', title: `Roadmap submitted: ${roadmap.title}`, link: `/admin/roadmaps/${id}` });
    }
    return updated;
  }

  async adminList(q: AdminRoadmapQueryDto) {
    const where: Prisma.RoadmapWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.roadmap.findMany({ where, ...skipTake(q), orderBy: { updatedAt: q.order }, include: { owner: { select: { fullName: true } }, _count: { select: { nodes: true, edges: true } } } }),
      this.prisma.roadmap.count({ where }),
    ]);
    return paginate(items, total, q);
  }
}

function pastTense(a: string) {
  return { submit: 'submitted', publish: 'published', reject: 'returned for changes', unpublish: 'unpublished', archive: 'archived' }[a] ?? a;
}
