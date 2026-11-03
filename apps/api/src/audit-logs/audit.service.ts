import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { PaginationQueryDto, paginate, skipTake } from '../common/pagination';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome?: 'SUCCESS' | 'DENIED' | 'FAILED';
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

/** Append-only audit trail. There is deliberately no update or delete API. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx?: Tx) {
    const db = tx ?? this.prisma;
    this.logger.log({ msg: 'audit', ...entry });
    return db.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        outcome: entry.outcome ?? 'SUCCESS',
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
        ipAddress: entry.ipAddress ?? null,
      },
    });
  }

  async list(q: PaginationQueryDto & { action?: string; resourceType?: string; actorId?: string }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.resourceType ? { resourceType: q.resourceType } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.search
        ? { OR: [{ resourceId: q.search }, { action: { contains: q.search, mode: 'insensitive' } }] }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: q.order },
        ...skipTake(q),
        include: { actor: { select: { id: true, fullName: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(items, total, q);
  }
}
