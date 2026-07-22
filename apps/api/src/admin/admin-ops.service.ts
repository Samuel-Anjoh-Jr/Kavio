import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AnnouncementStatus, Prisma, Role, type AnnouncementAudience } from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../auth/rbac/permissions';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { ANNOUNCEMENT_PUBLISHED, AnnouncementPublishedEvent } from './admin.events';
import type {
  CreateAnnouncementDto,
  ListAuditLogDto,
  UpdateAnnouncementDto,
} from './dto/admin.dto';
import type {
  AnnouncementView,
  AuditLogPageView,
  RbacMatrixView,
  SystemSettingView,
} from './models/admin-ops.model';

const logger = createLogger('admin:ops');

const MAX_PAGE = 100;

/**
 * The settings an admin may change, and what they mean.
 *
 * A CLOSED registry, deliberately. `SystemSetting` is key/value so the surface
 * can grow without a migration per toggle, but an admin console that accepts any
 * key would let somebody write `campay.secret` into a table the app then serves
 * to the settings screen. An admin may change the settings that EXIST — that is,
 * the ones some code path actually reads — not invent new ones.
 *
 * Nothing here is a secret. Provider keys live in the managed secret store.
 */
export const SETTING_REGISTRY: Record<string, { category: string; description: string }> = {
  'platform.feePercent': {
    category: 'payments',
    description: 'Platform service fee taken at escrow release, as a percentage.',
  },
  'platform.minPayoutXaf': {
    category: 'payments',
    description: 'Smallest withdrawal a worker may request, in whole XAF.',
  },
  'notifications.smsEnabled': {
    category: 'notifications',
    description: 'Master switch for the (deferred) SMS channel. OFF at launch.',
  },
  'notifications.digestHourUtc': {
    category: 'notifications',
    description: 'Hour of day, UTC, at which digest notifications are sent.',
  },
  'moderation.autoSuspendReportThreshold': {
    category: 'moderation',
    description: 'Open reports about one account before it is escalated in the risk monitor.',
  },
  'discovery.defaultRadiusKm': {
    category: 'discovery',
    description: 'Default search radius when a visitor has set no distance filter.',
  },
  'verification.fieldVisitRequiredTier': {
    category: 'verification',
    description: 'Tier at which a physical field visit becomes mandatory.',
  },
};

/**
 * Admin operations (ADM-02, ADM-07): announcements, the audit log, the RBAC
 * matrix and platform settings.
 *
 * The service-category surface (ADM-02) is NOT here — it already exists in
 * CatalogModule with its own CRUD, retire-not-delete semantics and audit trail.
 * The admin console reads it through the same public taxonomy query everything
 * else uses, with `includeInactive` for staff. Re-implementing it behind an
 * admin-only endpoint would give the platform two taxonomies to keep in step.
 */
@Injectable()
export class AdminOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // ── Announcements (ADM-07) ────────────────────────────────────────────────

  async listAnnouncements(status?: AnnouncementStatus): Promise<AnnouncementView[]> {
    const rows = await this.prisma.client.announcement.findMany({
      where: status ? { status } : {},
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: MAX_PAGE,
      select: {
        id: true,
        titleEn: true,
        titleFr: true,
        bodyEn: true,
        bodyFr: true,
        audience: true,
        status: true,
        publishedAt: true,
        expiresAt: true,
        createdAt: true,
        author: { select: { name: true } },
      },
    });

    return rows.map((row) => ({ ...row, authorName: row.author.name }));
  }

  async createAnnouncement(
    admin: AuthenticatedUser,
    dto: CreateAnnouncementDto,
  ): Promise<AnnouncementView> {
    const created = await this.prisma.client.announcement.create({
      data: {
        titleEn: dto.titleEn,
        titleFr: dto.titleFr,
        bodyEn: dto.bodyEn,
        bodyFr: dto.bodyFr,
        audience: dto.audience,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        authorId: admin.id,
        // Created as a DRAFT always. Publishing is a separate, explicit act —
        // an announcement that goes live the instant it is saved is one that
        // goes live half-written.
        status: AnnouncementStatus.DRAFT,
      },
      select: this.announcementSelect(),
    });

    await this.audit(admin, 'admin.announcement.created', `Announcement:${created.id}`, {
      audience: dto.audience,
    });

    return { ...created, authorName: created.author.name };
  }

  async updateAnnouncement(
    admin: AuthenticatedUser,
    id: string,
    dto: UpdateAnnouncementDto,
  ): Promise<AnnouncementView> {
    const existing = await this.prisma.client.announcement.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'ANNOUNCEMENT_NOT_FOUND',
        'Announcement not found.',
      );
    }

    const goingLive =
      dto.status === AnnouncementStatus.PUBLISHED &&
      existing.status !== AnnouncementStatus.PUBLISHED;

    const updated = await this.prisma.client.announcement.update({
      where: { id },
      data: {
        ...(dto.titleEn !== undefined ? { titleEn: dto.titleEn } : {}),
        ...(dto.titleFr !== undefined ? { titleFr: dto.titleFr } : {}),
        ...(dto.bodyEn !== undefined ? { bodyEn: dto.bodyEn } : {}),
        ...(dto.bodyFr !== undefined ? { bodyFr: dto.bodyFr } : {}),
        ...(dto.audience !== undefined ? { audience: dto.audience } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.expiresAt !== undefined ? { expiresAt: new Date(dto.expiresAt) } : {}),
        // Stamped once, on the transition. Re-stamping on every later edit would
        // make "when did users first see this" unanswerable.
        ...(goingLive ? { publishedAt: new Date() } : {}),
      },
      select: this.announcementSelect(),
    });

    await this.audit(admin, 'admin.announcement.updated', `Announcement:${id}`, {
      status: dto.status ?? existing.status,
    });

    if (goingLive) {
      this.events.emit(
        ANNOUNCEMENT_PUBLISHED,
        new AnnouncementPublishedEvent({
          announcementId: updated.id,
          audience: updated.audience,
          titleEn: updated.titleEn,
          titleFr: updated.titleFr,
          requestId: getRequestId(),
        }),
      );
    }

    return { ...updated, authorName: updated.author.name };
  }

  /**
   * What a signed-in user should see (ADM-07).
   *
   * Audience is matched at READ time against the caller's roles, which is what
   * lets "all workers" mean the workers who exist today rather than the ones who
   * existed when the announcement was written.
   */
  async liveAnnouncements(roles: Role[]): Promise<AnnouncementView[]> {
    const now = new Date();

    const audiences: AnnouncementAudience[] = ['ALL'];
    if (roles.includes(Role.WORKER)) audiences.push('WORKERS');
    if (roles.includes(Role.CLIENT)) audiences.push('CLIENTS');
    if (roles.includes(Role.BUSINESS)) audiences.push('BUSINESSES');
    if (roles.includes(Role.AGENT)) audiences.push('AGENTS');

    const rows = await this.prisma.client.announcement.findMany({
      where: {
        status: AnnouncementStatus.PUBLISHED,
        audience: { in: audiences },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { publishedAt: 'desc' },
      take: 20,
      select: this.announcementSelect(),
    });

    return rows.map((row) => ({ ...row, authorName: row.author.name }));
  }

  // ── Audit log (ADM-07) ────────────────────────────────────────────────────

  /**
   * The audit-log viewer.
   *
   * Read-only by construction: there is no update or delete path anywhere in
   * this service, because a log an admin can edit is not an audit log. The
   * `requestId` on every row is the join key into the structured application
   * logs, which is what turns "who changed the fee" into a full request trace.
   */
  async listAuditLog(dto: ListAuditLogDto): Promise<AuditLogPageView> {
    const take = Math.min(dto.limit ?? 50, MAX_PAGE);
    const skip = dto.offset ?? 0;

    const where: Prisma.AuditLogWhereInput = {
      ...(dto.action ? { action: dto.action } : {}),
      ...(dto.actorId ? { actorId: dto.actorId } : {}),
      ...(dto.from || dto.to
        ? {
            createdAt: {
              ...(dto.from ? { gte: new Date(dto.from) } : {}),
              ...(dto.to ? { lt: new Date(dto.to) } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.client.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          action: true,
          actorId: true,
          target: true,
          requestId: true,
          meta: true,
          createdAt: true,
          actor: { select: { name: true } },
        },
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        action: row.action,
        actorId: row.actorId,
        actorName: row.actor?.name ?? null,
        target: row.target,
        requestId: row.requestId,
        meta: row.meta,
        createdAt: row.createdAt,
      })),
      total,
      hasMore: skip + rows.length < total,
    };
  }

  /** Distinct action keys, for the viewer's filter dropdown. */
  async auditActions(): Promise<string[]> {
    const rows = await this.prisma.client.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
      take: MAX_PAGE,
    });
    return rows.map((row) => row.action);
  }

  // ── RBAC (ADM-07) ─────────────────────────────────────────────────────────

  /**
   * The RBAC matrix — READ-ONLY, and this is a decision rather than a shortcut.
   *
   * The permission catalogue is declared in code (auth/rbac/permissions.ts) and
   * the guards read it from there. Making it editable at runtime would mean the
   * authorisation rules live in a table that the admin console can write, so a
   * single compromised admin session could grant itself `admin:trust_adjust` and
   * every other capability — and the change would be a row update rather than a
   * reviewed, deployed diff.
   *
   * So the console SHOWS the matrix, completely and honestly, and says where it
   * is defined. Changing it is a pull request, which is the audit trail this
   * particular thing deserves.
   */
  rbacMatrix(): RbacMatrixView {
    return {
      permissions: [...PERMISSIONS],
      roles: Object.values(Role).map((role) => ({
        role,
        permissions: [...(ROLE_PERMISSIONS[role] ?? new Set<string>())],
      })),
      editable: false,
    };
  }

  // ── Settings (ADM-07) ─────────────────────────────────────────────────────

  /**
   * Every known setting, with its stored value where one exists.
   *
   * The REGISTRY is the source of truth for what exists; the table only holds
   * what has been changed from the code default. A settings screen driven purely
   * by table rows shows an empty page on a fresh install, which is how settings
   * end up undiscovered and then bypassed with an env var.
   */
  async listSettings(): Promise<SystemSettingView[]> {
    const stored = await this.prisma.client.systemSetting.findMany({
      select: {
        key: true,
        value: true,
        category: true,
        description: true,
        updatedAt: true,
        updatedBy: { select: { name: true } },
      },
    });

    const byKey = new Map(stored.map((row) => [row.key, row]));

    return Object.entries(SETTING_REGISTRY).map(([key, meta]) => {
      const row = byKey.get(key);
      return {
        key,
        value: row?.value ?? null,
        category: meta.category,
        description: meta.description,
        updatedByName: row?.updatedBy?.name ?? null,
        updatedAt: row?.updatedAt ?? new Date(0),
      };
    });
  }

  async updateSetting(
    admin: AuthenticatedUser,
    key: string,
    value: unknown,
  ): Promise<SystemSettingView> {
    const meta = SETTING_REGISTRY[key];

    if (!meta) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'UNKNOWN_SETTING',
        'That is not a setting this platform reads.',
        { key: ['Unknown setting.'] },
      );
    }

    const row = await this.prisma.client.systemSetting.upsert({
      where: { key },
      create: {
        key,
        value: value as Prisma.InputJsonValue,
        category: meta.category,
        description: meta.description,
        updatedById: admin.id,
      },
      update: {
        value: value as Prisma.InputJsonValue,
        updatedById: admin.id,
      },
      select: {
        key: true,
        value: true,
        category: true,
        description: true,
        updatedAt: true,
        updatedBy: { select: { name: true } },
      },
    });

    // The audit meta carries the KEY and the new value, both of which are
    // non-secret by the registry's construction — see the note there.
    await this.audit(admin, 'admin.setting.updated', `SystemSetting:${key}`, {
      key,
      value: value as Prisma.InputJsonValue,
    });

    logger.info('Platform setting updated', { result: { key } });

    return {
      key: row.key,
      value: row.value,
      category: row.category,
      description: row.description,
      updatedByName: row.updatedBy?.name ?? null,
      updatedAt: row.updatedAt,
    };
  }

  private announcementSelect() {
    return {
      id: true,
      titleEn: true,
      titleFr: true,
      bodyEn: true,
      bodyFr: true,
      audience: true,
      status: true,
      publishedAt: true,
      expiresAt: true,
      createdAt: true,
      author: { select: { name: true } },
    } satisfies Prisma.AnnouncementSelect;
  }

  private async audit(
    actor: AuthenticatedUser,
    action: string,
    target: string,
    meta: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: { actorId: actor.id, action, target, requestId: getRequestId(), meta },
    });
  }
}
