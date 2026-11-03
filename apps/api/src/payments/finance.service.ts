import { Injectable } from '@nestjs/common';
import { LedgerEntryType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { paginate, PaginationQueryDto, skipTake } from '../common/pagination';

export interface LedgerQuery extends PaginationQueryDto {
  type?: LedgerEntryType;
  creatorId?: string;
  from?: string;
  to?: string;
}

const n = (d: Prisma.Decimal | null | undefined) => Number(d ?? 0);

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService) {}

  private where(q: LedgerQuery): Prisma.FinancialLedgerEntryWhereInput {
    return {
      ...(q.type ? { type: q.type } : {}),
      ...(q.creatorId ? { creatorId: q.creatorId } : {}),
      ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
      ...(q.search ? { OR: [{ memo: { contains: q.search, mode: 'insensitive' } }, { transaction: { reference: { contains: q.search, mode: 'insensitive' } } }] } : {}),
    };
  }

  async ledger(q: LedgerQuery) {
    const where = this.where(q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.financialLedgerEntry.findMany({
        where,
        orderBy: { createdAt: q.order },
        ...skipTake(q),
        include: { transaction: { select: { reference: true } }, course: { select: { title: true } }, creator: { select: { fullName: true } } },
      }),
      this.prisma.financialLedgerEntry.count({ where }),
    ]);
    return paginate(items.map((e) => ({ ...e, amount: n(e.amount), sharePercent: e.sharePercent ? n(e.sharePercent) : null })), total, q);
  }

  async summary(from?: string, to?: string) {
    const range = from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {};
    const [byType, byCreator, monthly, share] = await Promise.all([
      this.prisma.financialLedgerEntry.groupBy({ by: ['type'], where: range, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.financialLedgerEntry.groupBy({ by: ['creatorId', 'type'], where: { ...range, creatorId: { not: null } }, _sum: { amount: true } }),
      this.prisma.$queryRaw<{ month: Date; gross: Prisma.Decimal; refunds: Prisma.Decimal }[]>`
        SELECT date_trunc('month', "createdAt") AS month,
               COALESCE(SUM(CASE WHEN type = 'SALE' THEN amount END), 0) AS gross,
               COALESCE(SUM(CASE WHEN type = 'REFUND' THEN amount END), 0) AS refunds
        FROM "FinancialLedgerEntry"
        GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,
      this.settings.get('finance.creatorSharePercent'),
    ]);
    const total = (t: LedgerEntryType) => n(byType.find((b) => b.type === t)?._sum.amount);
    const creatorIds = [...new Set(byCreator.map((c) => c.creatorId!))];
    const creators = await this.prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, fullName: true } });
    const creatorRows = creatorIds.map((id) => {
      const rows = byCreator.filter((r) => r.creatorId === id);
      const sum = (t: LedgerEntryType) => n(rows.find((r) => r.type === t)?._sum.amount);
      return {
        creatorId: id,
        name: creators.find((c) => c.id === id)?.fullName ?? 'Unknown',
        grossSales: sum('SALE'),
        refunds: sum('REFUND'),
        earnings: sum('CREATOR_EARNING') + sum('CREATOR_EARNING_REVERSAL'),
      };
    });
    return {
      revenueShareConfigured: share !== null,
      creatorSharePercent: share,
      grossSales: total('SALE'),
      refunds: total('REFUND'),
      netSales: total('SALE') + total('REFUND'),
      creatorEarnings: total('CREATOR_EARNING') + total('CREATOR_EARNING_REVERSAL'),
      platformRevenue: total('PLATFORM_REVENUE') + total('PLATFORM_REVENUE_REVERSAL'),
      adjustments: total('ADJUSTMENT'),
      salesCount: byType.find((b) => b.type === 'SALE')?._count._all ?? 0,
      monthly: monthly.map((m) => ({ month: m.month, gross: n(m.gross), refunds: n(m.refunds) })),
      creators: creatorRows.sort((a, b) => b.grossSales - a.grossSales),
    };
  }

  async creatorEarnings(creatorId: string) {
    const [rows, share, recent] = await Promise.all([
      this.prisma.financialLedgerEntry.groupBy({ by: ['type'], where: { creatorId }, _sum: { amount: true }, _count: { _all: true } }),
      this.settings.get('finance.creatorSharePercent'),
      this.prisma.financialLedgerEntry.findMany({
        where: { creatorId, type: { in: ['SALE', 'REFUND'] } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, type: true, amount: true, currency: true, createdAt: true, course: { select: { title: true } } },
      }),
    ]);
    const sum = (t: LedgerEntryType) => n(rows.find((r) => r.type === t)?._sum.amount);
    return {
      revenueShareConfigured: share !== null,
      creatorSharePercent: share,
      grossSales: sum('SALE'),
      refunds: sum('REFUND'),
      sales: rows.find((r) => r.type === 'SALE')?._count._all ?? 0,
      earnings: share === null ? null : sum('CREATOR_EARNING') + sum('CREATOR_EARNING_REVERSAL'),
      recent: recent.map((r) => ({ ...r, amount: n(r.amount) })),
    };
  }

  /** CSV export of the ledger for the given filters (max 50k rows). */
  async exportCsv(q: LedgerQuery): Promise<string> {
    const rows = await this.prisma.financialLedgerEntry.findMany({
      where: this.where(q),
      orderBy: { createdAt: 'asc' },
      take: 50_000,
      include: { transaction: { select: { reference: true } }, course: { select: { title: true } }, creator: { select: { fullName: true } } },
    });
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      // Neutralise spreadsheet formula injection.
      const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
      return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const header = ['entry_id', 'created_at', 'type', 'amount', 'currency', 'share_percent', 'reference', 'course', 'creator', 'memo'];
    const lines = rows.map((r) =>
      [r.id, r.createdAt.toISOString(), r.type, r.amount.toFixed(2), r.currency, r.sharePercent?.toFixed(2) ?? '', r.transaction?.reference, r.course?.title, r.creator?.fullName, r.memo].map(esc).join(','),
    );
    return [header.join(','), ...lines].join('\n');
  }
}
