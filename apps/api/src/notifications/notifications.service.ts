import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { PaginationQueryDto, paginate, skipTake } from '../common/pagination';

export type NotificationType =
  | 'course.approved'
  | 'course.rejected'
  | 'course.published'
  | 'course.submitted'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.refunded'
  | 'quiz.result'
  | 'support.message'
  | 'support.assigned'
  | 'certificate.issued'
  | 'certificate.revoked'
  | 'creator.application'
  | 'pricing.decision'
  | 'roadmap.decision'
  | 'course.activity';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

/**
 * In-app notifications. Additional channels (email, SMS) plug in through
 * `channels`; none is registered by default so nothing is sent externally
 * without configured provider credentials.
 */
export interface NotificationChannel {
  name: string;
  deliver(userId: string, input: NotificationInput): Promise<void>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');
  private readonly channels: NotificationChannel[] = [];

  constructor(private readonly prisma: PrismaService) {}

  registerChannel(channel: NotificationChannel) {
    this.channels.push(channel);
  }

  async notify(userIds: string | string[], input: NotificationInput, tx?: Tx) {
    const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])].filter(Boolean);
    if (!ids.length) return;
    const db = tx ?? this.prisma;
    await db.notification.createMany({
      data: ids.map((userId) => ({ userId, type: input.type, title: input.title, body: input.body, link: input.link })),
    });
    for (const channel of this.channels) {
      for (const id of ids) {
        channel.deliver(id, input).catch((err) => this.logger.warn({ msg: 'channel failed', channel: channel.name, err: String(err) }));
      }
    }
  }

  async list(userId: string, q: PaginationQueryDto & { unread?: boolean }) {
    const where = { userId, ...(q.unread ? { readAt: null } : {}) };
    const [items, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(q) }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { ...paginate(items, total, q), unread };
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    const r = await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { updated: r.count };
  }
}
