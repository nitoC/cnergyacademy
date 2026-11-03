import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RoadmapStatus } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuditService } from '../audit-logs/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AccessService } from '../learning/access.service';
import { ProgressService } from '../learning/progress.service';
import { isContentEditable } from '../courses/course-workflow';
import { paginate, skipTake } from '../common/pagination';
import { slugify } from '../common/util';
import type { AuthUser } from '../common/auth-user';
import { computeNodeStates, levels, NodeFacts, validateGraph, wouldCreateCycle } from './roadmap-graph';
import type { AdminRoadmapQueryDto, CreateRoadmapDto, EdgeDto, NodeDto, RoadmapDecisionDto, UpdateNodeDto, UpdateRoadmapDto } from './roadmaps.dto';

const NODE_INCLUDE = {
  course: { select: { id: true, title: true, slug: true, status: true, approvedPrice: true, currency: true, estimatedMinutes: true, difficulty: true } },
  module: { select: { id: true, title: true, position: true, courseId: true } },
} satisfies Prisma.RoadmapNodeInclude;

const COURSE_SELECT = { id: true, title: true, slug: true, status: true, creatorId: true, approvedPrice: true, currency: true } as const;

type Loaded = Awaited<ReturnType<RoadmapsService['load']>>;

async function uniqueRoadmapSlug(db: Tx | PrismaService, title: string) {
  const base = slugify(title) || 'roadmap';
  let slug = base;
  for (let i = 2; await db.roadmap.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  return slug;
}

/**
 * Creates the course's roadmap if it does not exist yet. Every course has
 * exactly one; it is authored by the course creator and goes live with the
 * course.
 */
export async function ensureCourseRoadmap(db: Tx | PrismaService, course: { id: string; title: string; shortDescription: string; creatorId: string }) {
  const existing = await db.roadmap.findUnique({ where: { courseId: course.id } });
  if (existing) return existing;
  return db.roadmap.create({
    data: {
      courseId: course.id,
      ownerId: course.creatorId,
      title: `${course.title}: roadmap`,
      summary: course.shortDescription,
      slug: await uniqueRoadmapSlug(db, `${course.title} roadmap`),
    },
  });
}

@Injectable()
export class RoadmapsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly access: AccessService,
    private readonly progress: ProgressService,
  ) {}

  /** Is this roadmap visible to learners right now? */
  private isLive(r: { status: RoadmapStatus; course: { status: string } | null; nodes?: unknown[] }) {
    return r.course ? r.course.status === 'PUBLISHED' : r.status === 'PUBLISHED';
  }

  // ───────────── Public / learner ─────────────

  async listPublished(search?: string) {
    const roadmaps = await this.prisma.roadmap.findMany({
      where: {
        OR: [{ courseId: null, status: 'PUBLISHED' }, { course: { status: 'PUBLISHED' }, nodes: { some: {} } }],
        ...(search ? { AND: [{ OR: [{ title: { contains: search, mode: 'insensitive' } }, { summary: { contains: search, mode: 'insensitive' } }] }] } : {}),
      },
      orderBy: [{ courseId: { sort: 'asc', nulls: 'first' } }, { updatedAt: 'desc' }],
      include: {
        owner: { select: { fullName: true } },
        course: { select: { title: true, slug: true } },
        nodes: { select: { type: true, course: { select: { estimatedMinutes: true } } } },
      },
    });
    return roadmaps.map(({ nodes, ...r }) => ({
      ...r,
      nodeCount: nodes.length,
      courseCount: nodes.filter((n) => n.type === 'COURSE').length,
      moduleCount: nodes.filter((n) => n.type === 'MODULE').length,
      estimatedMinutes: nodes.reduce((s, n) => s + (n.course?.estimatedMinutes ?? 0), 0),
    }));
  }

  private async load(where: Prisma.RoadmapWhereUniqueInput) {
    const roadmap = await this.prisma.roadmap.findUnique({
      where,
      include: {
        owner: { select: { id: true, fullName: true } },
        course: { select: COURSE_SELECT },
        nodes: { orderBy: { position: 'asc' }, include: NODE_INCLUDE },
        edges: true,
      },
    });
    if (!roadmap) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Roadmap not found' });
    return roadmap;
  }

  private canPreview(user: AuthUser | undefined, r: Loaded) {
    if (!user) return false;
    if (r.ownerId === user.id || user.permissions.has('roadmaps.publish')) return true;
    return !!r.course && (r.course.creatorId === user.id || user.permissions.has('courses.review'));
  }

  /** Roadmap with node states computed from the viewer's actual progress and entitlements. */
  async view(slugOrId: string, user?: AuthUser) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(slugOrId);
    const roadmap = await this.load(isUuid ? { id: slugOrId } : { slug: slugOrId });
    if (!this.isLive(roadmap) && !this.canPreview(user, roadmap)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Roadmap not found' });
    return { ...(await this.withStates(roadmap, user)), preview: !this.isLive(roadmap) };
  }

  /** The roadmap of a course, by course slug or id. Same visibility as the course. */
  async forCourse(slugOrId: string, user?: AuthUser) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(slugOrId);
    const course = await this.prisma.course.findFirst({ where: isUuid ? { id: slugOrId } : { slug: slugOrId }, select: { id: true } });
    const roadmap = course ? await this.prisma.roadmap.findUnique({ where: { courseId: course.id }, select: { id: true } }) : null;
    if (!roadmap) throw new NotFoundException({ code: 'NOT_FOUND', message: 'This course has no roadmap yet' });
    return this.view(roadmap.id, user);
  }

  private async withStates(roadmap: Loaded, user?: AuthUser) {
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

    // Module steps follow the same progress and access rules as the course journey.
    const moduleCourseIds = [...new Set(roadmap.nodes.map((n) => n.module?.courseId).filter((x): x is string => !!x))];
    const moduleFacts = new Map<string, { completed: boolean; inProgress: boolean; premiumLocked: boolean; prerequisiteQuizId: string | null }>();
    for (const courseId of moduleCourseIds) {
      const ctx = await this.access.courseContext(user, courseId);
      const structure = await this.progress.structure(courseId);
      const progress = user ? await this.progress.progressFor(user.id, courseId, undefined, structure) : null;
      for (const m of structure.modules) {
        const p = progress?.modules.find((x) => x.moduleId === m.id);
        const decision = this.access.decide(ctx, m);
        const items = (p?.lessonsTotal ?? 0) + (p?.quizzesTotal ?? 0);
        moduleFacts.set(m.id, {
          completed: !!p?.completed && items > 0,
          inProgress: !!p && !p.completed && p.lessonsCompleted + p.quizzesPassed > 0,
          premiumLocked: decision.requiresPurchase,
          prerequisiteQuizId: decision.requiresPrerequisite ? decision.prerequisiteQuizId : null,
        });
      }
    }

    const facts = new Map<string, NodeFacts>(
      roadmap.nodes.map((n) => {
        if (n.type === 'MODULE' && n.module) {
          const m = moduleFacts.get(n.module.id);
          return [n.id, { id: n.id, isCourse: true, completed: !!m?.completed, inProgress: !!m?.inProgress, premiumLocked: !!m?.premiumLocked }];
        }
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
    const ownerCourse = roadmap.course;
    return {
      id: roadmap.id,
      title: roadmap.title,
      slug: roadmap.slug,
      summary: roadmap.summary,
      status: roadmap.status,
      owner: roadmap.owner,
      publishedAt: roadmap.publishedAt,
      course: ownerCourse
        ? { id: ownerCourse.id, title: ownerCourse.title, slug: ownerCourse.slug, status: ownerCourse.status, approvedPrice: ownerCourse.approvedPrice ? Number(ownerCourse.approvedPrice) : null, currency: ownerCourse.currency }
        : null,
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
        module: n.module
          ? {
              ...n.module,
              course: ownerCourse && n.module.courseId === ownerCourse.id ? { id: ownerCourse.id, slug: ownerCourse.slug, title: ownerCourse.title } : null,
              prerequisiteQuizId: moduleFacts.get(n.module.id)?.prerequisiteQuizId ?? null,
            }
          : null,
        ...states.get(n.id)!,
      })),
      edges: roadmap.edges.map((e) => ({ id: e.id, fromNodeId: e.fromNodeId, toNodeId: e.toNodeId })),
    };
  }

  async completeNode(user: AuthUser, nodeId: string) {
    const node = await this.prisma.roadmapNode.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Node not found' });
    if (node.type === 'COURSE' || node.type === 'MODULE') {
      throw new BadRequestException({ code: 'LEARNABLE_NODE', message: 'Course and module steps complete automatically as you learn' });
    }
    const view = await this.view(node.roadmapId, user);
    if (view.preview) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Node not found' });
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

  /**
   * Who may edit: for a course roadmap, whoever may manage the course (its
   * creator, or an administrator with course management); for a platform
   * roadmap, its owner or a roadmap reviewer.
   */
  private async manageable(user: AuthUser, roadmapId: string, opts: { forRead?: boolean } = {}) {
    const roadmap = await this.prisma.roadmap.findUnique({ where: { id: roadmapId }, include: { course: { select: COURSE_SELECT } } });
    if (!roadmap) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Roadmap not found' });
    if (roadmap.course) {
      const owner = roadmap.course.creatorId === user.id && user.permissions.has('courses.manage_own');
      const reviewer = user.permissions.has('courses.manage_any') || (opts.forRead && user.permissions.has('courses.review'));
      if (!owner && !reviewer) throw new ForbiddenException({ code: 'ACCOUNT_NOT_AUTHORIZED', message: 'Only the course creator can edit this roadmap' });
      if (!opts.forRead && !isContentEditable(roadmap.course.status as never)) {
        throw new ConflictException({ code: 'COURSE_LOCKED', message: 'The roadmap is locked while its course is under review or archived' });
      }
      return roadmap;
    }
    const isOwner = roadmap.ownerId === user.id && user.permissions.has('roadmaps.create');
    if (!isOwner && !user.permissions.has('roadmaps.publish')) {
      throw new ForbiddenException({ code: 'ACCOUNT_NOT_AUTHORIZED', message: 'You can only edit your own roadmaps' });
    }
    if (!opts.forRead && roadmap.status === 'SUBMITTED' && !user.permissions.has('roadmaps.publish')) {
      throw new ConflictException({ code: 'ROADMAP_LOCKED', message: 'This roadmap is under review' });
    }
    return roadmap;
  }

  mine(user: AuthUser) {
    return this.prisma.roadmap.findMany({
      where: { OR: [{ ownerId: user.id, courseId: null }, { course: { creatorId: user.id } }] },
      orderBy: [{ courseId: { sort: 'asc', nulls: 'first' } }, { updatedAt: 'desc' }],
      include: { course: { select: { id: true, title: true, status: true } }, _count: { select: { nodes: true, edges: true } } },
    });
  }

  async create(user: AuthUser, dto: CreateRoadmapDto) {
    const roadmap = await this.prisma.roadmap.create({
      data: { title: dto.title, summary: dto.summary, subjectId: dto.subjectId ?? null, ownerId: user.id, slug: await uniqueRoadmapSlug(this.prisma, dto.title) },
    });
    await this.audit.record({ actorId: user.id, action: 'roadmap.create', resourceType: 'Roadmap', resourceId: roadmap.id });
    return roadmap;
  }

  /** The course's roadmap for its editor, created on first use for older courses. */
  async courseRoadmapId(user: AuthUser, courseId: string) {
    const { course } = await this.access.assertCanManageCourse(user, courseId);
    const roadmap = await ensureCourseRoadmap(this.prisma, course);
    return { id: roadmap.id };
  }

  async editor(user: AuthUser, id: string) {
    await this.manageable(user, id, { forRead: true });
    const roadmap = await this.load({ id });
    const issues = validateGraph(
      roadmap.nodes.map((n) => ({ ...n, coursePublished: n.course ? n.course.status === 'PUBLISHED' : undefined })),
      roadmap.edges,
    );
    const level = levels(roadmap.nodes, roadmap.edges);
    const modules = roadmap.courseId
      ? await this.prisma.courseModule.findMany({ where: { courseId: roadmap.courseId }, orderBy: { position: 'asc' }, select: { id: true, title: true, position: true } })
      : [];
    const editable = await this.manageable(user, id).then(
      () => true,
      () => false,
    );
    return { ...roadmap, nodes: roadmap.nodes.map((n) => ({ ...n, level: level.get(n.id) ?? 0 })), issues, modules, editable };
  }

  async update(user: AuthUser, id: string, dto: UpdateRoadmapDto) {
    await this.manageable(user, id);
    return this.prisma.roadmap.update({ where: { id }, data: { title: dto.title, summary: dto.summary, subjectId: dto.subjectId } });
  }

  async remove(user: AuthUser, id: string) {
    const roadmap = await this.manageable(user, id);
    if (roadmap.courseId) throw new ConflictException({ code: 'COURSE_ROADMAP', message: 'Every course has a roadmap. Edit its steps instead of deleting it.' });
    if (roadmap.status === 'PUBLISHED') throw new ConflictException({ code: 'ROADMAP_PUBLISHED', message: 'Archive a published roadmap instead of deleting it' });
    await this.prisma.roadmap.delete({ where: { id } });
    await this.audit.record({ actorId: user.id, action: 'roadmap.delete', resourceType: 'Roadmap', resourceId: id, metadata: { title: roadmap.title } });
    return { deleted: true };
  }

  private async assertRefs(roadmap: { id: string; courseId: string | null }, type: string, courseId?: string | null, moduleId?: string | null) {
    if (type === 'COURSE') {
      if (!courseId) throw new BadRequestException({ code: 'COURSE_MISSING', message: 'Course steps must reference a course' });
      if (courseId === roadmap.courseId) throw new BadRequestException({ code: 'INVALID_COURSE', message: 'Use module steps for this course’s own content' });
      if (!(await this.prisma.course.findUnique({ where: { id: courseId }, select: { id: true } }))) throw new BadRequestException({ code: 'INVALID_COURSE', message: 'Course not found' });
    }
    if (type === 'MODULE') {
      if (!roadmap.courseId) throw new BadRequestException({ code: 'MODULE_NOT_ALLOWED', message: 'Module steps belong in a course roadmap' });
      if (!moduleId) throw new BadRequestException({ code: 'MODULE_MISSING', message: 'Module steps must reference a module of this course' });
      const module = await this.prisma.courseModule.findUnique({ where: { id: moduleId }, select: { courseId: true } });
      if (!module || module.courseId !== roadmap.courseId) throw new BadRequestException({ code: 'INVALID_MODULE', message: 'Module must belong to this course' });
    }
  }

  async addNode(user: AuthUser, roadmapId: string, dto: NodeDto) {
    const roadmap = await this.manageable(user, roadmapId);
    await this.assertRefs(roadmap, dto.type, dto.courseId, dto.moduleId);
    const max = await this.prisma.roadmapNode.aggregate({ where: { roadmapId }, _max: { position: true } });
    return this.prisma.roadmapNode.create({
      data: {
        roadmapId,
        type: dto.type,
        title: dto.title,
        description: dto.description,
        courseId: dto.type === 'COURSE' ? dto.courseId : null,
        moduleId: dto.type === 'MODULE' ? dto.moduleId : null,
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
    const roadmap = await this.manageable(user, node.roadmapId);
    const type = dto.type ?? node.type;
    const courseId = dto.courseId === undefined ? node.courseId : dto.courseId;
    const moduleId = dto.moduleId === undefined ? node.moduleId : dto.moduleId;
    await this.assertRefs(roadmap, type, courseId, moduleId);
    return this.prisma.roadmapNode.update({
      where: { id: nodeId },
      data: {
        type,
        title: dto.title,
        description: dto.description,
        courseId: type === 'COURSE' ? courseId : null,
        moduleId: type === 'MODULE' ? moduleId : null,
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
    if (roadmap.courseId) {
      throw new BadRequestException({ code: 'COURSE_ROADMAP', message: 'A course roadmap is reviewed and published together with its course' });
    }
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

  async adminList(q: AdminRoadmapQueryDto & { kind?: 'course' | 'platform' }) {
    const where: Prisma.RoadmapWhereInput = {
      ...(q.status ? { status: q.status, courseId: null } : {}),
      ...(q.kind === 'course' ? { courseId: { not: null } } : q.kind === 'platform' ? { courseId: null } : {}),
      ...(q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.roadmap.findMany({
        where,
        ...skipTake(q),
        orderBy: { updatedAt: q.order },
        include: { owner: { select: { fullName: true } }, course: { select: { id: true, title: true, status: true } }, _count: { select: { nodes: true, edges: true } } },
      }),
      this.prisma.roadmap.count({ where }),
    ]);
    return paginate(items, total, q);
  }
}

function pastTense(a: string) {
  return { submit: 'submitted', publish: 'published', reject: 'returned for changes', unpublish: 'unpublished', archive: 'archived' }[a] ?? a;
}
