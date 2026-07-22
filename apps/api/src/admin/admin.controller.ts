import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, Public, RequirePermissions } from '../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import { AdminOpsService } from './admin-ops.service';
import { AdminUsersService } from './admin-users.service';
import {
  acceptAgentInvitationSchema,
  createAnnouncementSchema,
  inviteAgentSchema,
  updateAnnouncementSchema,
  updateSettingSchema,
  type AcceptAgentInvitationDto,
  type CreateAnnouncementDto,
  type InviteAgentDto,
  type UpdateAnnouncementDto,
  type UpdateSettingDto,
} from './dto/admin.dto';

/**
 * Admin WRITES (REST, per the DUAL API RULE; ADM-02, ADM-06, ADM-07). Every read
 * is on the admin resolvers.
 *
 * ── What is NOT on this controller ──────────────────────────────────────────
 *
 * There is no suspend, ban or reinstate endpoint. Those already exist on the
 * moderation controller (ADM-08), where each one writes an append-only
 * ModerationAction carrying the actor, the reason shown to the party and an
 * expiry, and notifies the person affected. A second route to the same outcome
 * — one with no reason and no notification — is precisely what an audit trail
 * exists to prevent, so the admin console calls the moderation endpoint.
 *
 * Nor is there a service-category endpoint: the taxonomy has its own controller
 * in CatalogModule with retire-not-delete semantics. Two write paths to one
 * taxonomy is two sets of rules to keep in step.
 *
 * Permissions are stated per route rather than on the class, because these are
 * genuinely different powers: issuing an agent credential is not the same act as
 * editing a fee percentage, and one operator may reasonably hold one and not the
 * other (NFR-SEC-02).
 */
@Controller('admin')
export class AdminController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly ops: AdminOpsService,
  ) {}

  // ── Agent invitations (ADM-06) ────────────────────────────────────────────

  /**
   * Invites someone to join as a field agent.
   *
   * Throttled hard. This is the endpoint that mints verification credentials,
   * and a compromised admin session that can call it in a loop is the worst
   * outcome on the platform — a fleet of agent accounts that can field-verify
   * fraudulent workers into Tier 3.
   */
  @Post('agent-invitations')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('admin:user_manage')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async inviteAgent(
    @CurrentUser() admin: AuthenticatedUser,
    @Body(new ZodValidationPipe(inviteAgentSchema)) dto: InviteAgentDto,
  ) {
    return this.users.inviteAgent(admin, dto);
  }

  @Post('agent-invitations/:id/revoke')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('admin:user_manage')
  async revokeAgentInvitation(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.users.revokeAgentInvitation(admin, id);
  }

  /**
   * Redeems an invitation and creates the agent identity.
   *
   * `@Public()` by necessity — the invitee has no account yet, which is the
   * entire point of an invitation. The TOKEN is the authorisation. Throttled
   * because an unauthenticated endpoint that checks a secret is a guessing
   * target, and the service returns one indistinguishable error for "no such
   * token", "already used" and "expired" so it cannot be used as an oracle.
   */
  @Public()
  @Post('agent-invitations/accept')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async acceptAgentInvitation(
    @Body(new ZodValidationPipe(acceptAgentInvitationSchema)) dto: AcceptAgentInvitationDto,
  ) {
    return this.users.acceptAgentInvitation(dto);
  }

  // ── Announcements (ADM-07) ────────────────────────────────────────────────

  @Post('announcements')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('admin:settings_manage')
  async createAnnouncement(
    @CurrentUser() admin: AuthenticatedUser,
    @Body(new ZodValidationPipe(createAnnouncementSchema)) dto: CreateAnnouncementDto,
  ) {
    return this.ops.createAnnouncement(admin, dto);
  }

  /** Edits or publishes an announcement. Publishing is an explicit status change. */
  @Patch('announcements/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('admin:settings_manage')
  async updateAnnouncement(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateAnnouncementSchema)) dto: UpdateAnnouncementDto,
  ) {
    return this.ops.updateAnnouncement(admin, id, dto);
  }

  // ── Settings (ADM-07) ─────────────────────────────────────────────────────

  /**
   * Writes one platform setting.
   *
   * The key is a PATH PARAM validated against the closed registry in the
   * service, not a free-form body field. An admin may change the settings the
   * code actually reads; they may not invent new keys, and they certainly may
   * not write something named like a secret into a table the console renders.
   */
  @Patch('settings/:key')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('admin:settings_manage')
  async updateSetting(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('key') key: string,
    @Body(new ZodValidationPipe(updateSettingSchema)) dto: UpdateSettingDto,
  ) {
    return this.ops.updateSetting(admin, key, dto.value);
  }
}
