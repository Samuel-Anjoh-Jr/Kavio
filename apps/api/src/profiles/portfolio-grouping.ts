/**
 * Project-title resolution for portfolio groups (PRO-02).
 *
 * `projectTitle` is DENORMALISED across every item in a group rather than
 * normalised into a PortfolioGroup table — a whole table and a join to carry one
 * string. That trade is only defensible while drift is impossible, and drift is
 * exactly what a denormalised column invites:
 *
 *   add a second photo to "Kitchen refit" without repeating the title
 *     → the new row's title is null while its siblings say "Kitchen refit",
 *       and the group's displayed name depends on which row sorts first
 *
 *   move a photo from "Kitchen refit" into "Bathroom"
 *     → it carries the old title into the new group
 *
 * Both are silent. Neither throws, and the profile just renders the wrong
 * heading. So the rule is enforced by this function rather than by discipline at
 * the two call sites, and it is a pure function so the rule can be tested
 * without a database.
 *
 * The rule: a title supplied EXPLICITLY wins and is written across the whole
 * group; a title not supplied is INHERITED from the group being joined; and an
 * item with no group has no title, because a project name with no project is
 * not a thing.
 */

export interface ProjectTitleResolution {
  /** What this item's `projectTitle` column should be set to. */
  title: string | null;
  /**
   * True when every OTHER item in the group must be rewritten to match.
   * Only an explicit title does this — inheriting is already consistent.
   */
  rewriteGroup: boolean;
}

export function resolveProjectTitle(input: {
  /** The group the item will belong to AFTER this write. Null = ungrouped. */
  groupKey: string | null;
  /**
   * What the caller asked for. `undefined` means "not supplied" and is
   * meaningfully different from `null`, which means "clear it".
   */
  requestedTitle?: string | null;
  /** The title the target group already carries, if any. */
  existingGroupTitle: string | null;
}): ProjectTitleResolution {
  // No group, no title. Keeping a stale project name on an item that has been
  // pulled out of its project is how a lone photo ends up captioned with a job
  // it was never part of.
  if (!input.groupKey) {
    return { title: null, rewriteGroup: false };
  }

  if (input.requestedTitle !== undefined) {
    return { title: input.requestedTitle, rewriteGroup: true };
  }

  return { title: input.existingGroupTitle, rewriteGroup: false };
}
