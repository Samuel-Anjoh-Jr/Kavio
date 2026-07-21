import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

/**
 * The service taxonomy, read over GraphQL (ADM-02, DIS-05).
 *
 * PUBLIC: an unauthenticated visitor browses categories before they have any
 * reason to sign up, and job posting and search are both scoped to this list.
 *
 * Names come back in BOTH languages rather than resolved against a locale
 * argument. Two reasons, and the second is the load-bearing one: the taxonomy is
 * admin-authored data (unlike UI copy, which lives in next-intl), and Apollo's
 * normalized cache would otherwise hold a locale-specific copy of every category
 * — so switching language would either serve stale names or force a full refetch.
 */
@ObjectType({ description: 'A service category the marketplace is scoped to (ADM-02).' })
export class ServiceCategoryView {
  @Field(() => ID)
  id!: string;

  @Field({
    description:
      'Stable URL-safe key. Generated once at creation and never editable — saved filters and job posts reference it.',
  })
  slug!: string;

  @Field()
  nameEn!: string;

  @Field()
  nameFr!: string;

  @Field(() => String, { nullable: true })
  descriptionEn!: string | null;

  @Field(() => String, { nullable: true })
  descriptionFr!: string | null;

  @Field(() => String, { nullable: true, description: 'Icon name from the web icon set.' })
  icon!: string | null;

  @Field(() => ID, { nullable: true, description: 'Set for a specialisation under a trade.' })
  parentId!: string | null;

  @Field(() => Int)
  sortOrder!: number;

  @Field({
    description:
      'False once retired. A retired category stops scoping NEW listings but keeps resolving, so historic jobs stay readable.',
  })
  isActive!: boolean;

  @Field(() => Int, {
    description:
      'Workers offering at least one active service here. Recomputed from listings, never incremented ad hoc.',
  })
  workerCount!: number;

  @Field(() => Date)
  createdAt!: Date;
}

/**
 * A category with its specialisations attached.
 *
 * A distinct type rather than a self-referential `children` field on
 * ServiceCategoryView, because the taxonomy is exactly two levels: a recursive
 * field would advertise a depth the data model does not have, and clients would
 * write queries nesting three deep that silently return nothing.
 */
@ObjectType({ description: 'A top-level trade with its specialisations (ADM-02).' })
export class ServiceCategoryTreeView extends ServiceCategoryView {
  @Field(() => [ServiceCategoryView], { description: 'Specialisations under this trade.' })
  children!: ServiceCategoryView[];
}
