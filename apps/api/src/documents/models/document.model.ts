import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  MediaAssetKind,
  MediaVisibility,
  VerificationCheckType,
  VerificationStatus,
} from '@kavio/database';

/**
 * The Documents area (TRU-08), served over GraphQL per the DUAL API RULE.
 *
 * `url` is a SHORT-LIVED SIGNED URL minted per request, not a stored column.
 * That is the whole access model: authorisation is evaluated when the document
 * is asked for, so revoking a role or retiring a file takes effect immediately
 * instead of waiting for some previously-handed-out link to expire.
 */

@ObjectType({ description: 'A stored document and its review state (TRU-08).' })
export class DocumentView {
  @Field(() => ID)
  id!: string;

  @Field(() => MediaAssetKind, { description: 'What this file is.' })
  kind!: MediaAssetKind;

  @Field({ description: 'MIME type as sniffed from the bytes, never as declared.' })
  mimeType!: string;

  @Field(() => Int)
  sizeBytes!: number;

  @Field(() => MediaVisibility)
  visibility!: MediaVisibility;

  @Field(() => String, {
    nullable: true,
    description:
      'A signed, expiring URL for this request only. Null when storage has no HTTP surface (local development driver).',
  })
  url!: string | null;

  @Field(() => VerificationStatus, {
    nullable: true,
    description:
      'Review outcome, taken from the newest verification check this document backs. Null while it has not been submitted for anything — the file exists, but nobody has been asked to judge it.',
  })
  status!: VerificationStatus | null;

  @Field(() => VerificationCheckType, {
    nullable: true,
    description: 'The check that outcome belongs to.',
  })
  checkType!: VerificationCheckType | null;

  @Field(() => String, {
    nullable: true,
    description:
      'i18n key for the friendly retry line when the check was rejected (TRU-07), e.g. "Verification.rejection.OCR_UNREADABLE".',
  })
  rejectionKey!: string | null;

  @Field(() => Date)
  createdAt!: Date;
}
