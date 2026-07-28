import { Field, GraphQLISODateTime, ID, Int, ObjectType } from '@nestjs/graphql';
import { AnnouncementAudience, AnnouncementStatus, Role } from '@trustpro/database';
import { GraphQLJSON } from '../../graphql/json.scalar';

/**
 * Admin operations reads (ADM-02, ADM-07): announcements, the audit log, the
 * RBAC matrix and platform settings. GraphQL per the DUAL API RULE.
 */

@ObjectType({ description: 'A platform announcement (ADM-07).' })
export class AnnouncementView {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  titleEn!: string;

  @Field(() => String)
  titleFr!: string;

  @Field(() => String)
  bodyEn!: string;

  @Field(() => String)
  bodyFr!: string;

  @Field(() => AnnouncementAudience)
  audience!: AnnouncementAudience;

  @Field(() => AnnouncementStatus)
  status!: AnnouncementStatus;

  @Field(() => String, { nullable: true })
  authorName!: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  publishedAt!: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  expiresAt!: Date | null;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;
}

@ObjectType({
  description:
    'One audit-log entry (SRS §24). Append-only: the log is what answers for what an admin did once the guard let them in, so nothing here is editable.',
})
export class AuditLogEntryView {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { description: 'Coded action key, e.g. admin.setting.updated.' })
  action!: string;

  @Field(() => ID, { nullable: true })
  actorId!: string | null;

  @Field(() => String, { nullable: true })
  actorName!: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'What it was about, as "Model:id".',
  })
  target!: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'The requestId that produced it — the join key into the structured logs.',
  })
  requestId!: string | null;

  @Field(() => GraphQLJSON, { nullable: true, description: 'Sanitised detail. Never secrets.' })
  meta!: unknown;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;
}

@ObjectType({ description: 'A page of audit entries (ADM-07).' })
export class AuditLogPageView {
  @Field(() => [AuditLogEntryView])
  items!: AuditLogEntryView[];

  @Field(() => Int)
  total!: number;

  @Field(() => Boolean)
  hasMore!: boolean;
}

@ObjectType({ description: 'What one role may do (ADM-07, NFR-SEC-02).' })
export class RolePermissionsView {
  @Field(() => Role)
  role!: Role;

  @Field(() => [String], { description: 'Permission codes granted to this role.' })
  permissions!: string[];
}

@ObjectType({
  description:
    'The RBAC matrix (ADM-07). READ-ONLY, and deliberately so — see the note on AdminOpsService.rbacMatrix.',
})
export class RbacMatrixView {
  @Field(() => [String], { description: 'Every permission code the platform defines.' })
  permissions!: string[];

  @Field(() => [RolePermissionsView])
  roles!: RolePermissionsView[];

  @Field(() => Boolean, {
    description:
      'Whether the matrix can be edited from this console. False: the catalogue is declared in code, because the guards read it from there.',
  })
  editable!: boolean;
}

@ObjectType({ description: 'One platform setting (ADM-07).' })
export class SystemSettingView {
  @Field(() => String)
  key!: string;

  /**
   * Null when the setting has never been overridden — the registry lists every
   * known setting, while the table holds only what an admin has changed, so
   * "no stored row" is an ordinary state and not an error. Declaring this
   * non-nullable made a single un-overridden setting fail the WHOLE query,
   * blanking the settings screen.
   */
  @Field(() => GraphQLJSON, { nullable: true })
  value!: unknown;

  @Field(() => String)
  category!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => String, { nullable: true })
  updatedByName!: string | null;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}
