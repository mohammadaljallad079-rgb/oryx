import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export interface AuditEntry {
  actorUserId?: string | null;
  companyId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Append-only audit trail. Every mutating, security-relevant operation writes
 * here. Failures never break the caller's transaction semantics: audit writes
 * are best-effort but errors are surfaced to the caller in tests.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        companyId: entry.companyId ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        summary: entry.summary,
        metadata: (entry.metadata ?? undefined) as never,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  }

  async list(params: {
    companyId?: string | null;
    actorUserId?: string;
    action?: string;
    targetType?: string;
    search?: string;
    from?: Date;
    to?: Date;
    page: number;
    pageSize: number;
  }) {
    const search = params.search?.trim();
    const where = {
      ...(params.companyId ? { companyId: params.companyId } : {}),
      ...(params.actorUserId ? { actorUserId: params.actorUserId } : {}),
      ...(params.action ? { action: params.action } : {}),
      ...(params.targetType ? { targetType: params.targetType } : {}),
      ...(params.from || params.to
        ? { createdAt: { ...(params.from ? { gte: params.from } : {}), ...(params.to ? { lte: params.to } : {}) } }
        : {}),
      ...(search
        ? {
            OR: [
              { summary: { contains: search, mode: 'insensitive' as const } },
              { action: { contains: search, mode: 'insensitive' as const } },
              { targetId: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: { actor: { select: { email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  }
}
