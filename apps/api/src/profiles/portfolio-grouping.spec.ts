import { resolveProjectTitle } from './portfolio-grouping';

describe('resolveProjectTitle', () => {
  it('inherits the group’s title when the caller supplies none', () => {
    // THE bug this function exists to prevent: adding a second photo to
    // "Kitchen refit" without repeating the title used to store null on the new
    // row, leaving the group's displayed name dependent on sort order.
    expect(resolveProjectTitle({ groupKey: 'g1', existingGroupTitle: 'Kitchen refit' })).toEqual({
      title: 'Kitchen refit',
      rewriteGroup: false,
    });
  });

  it('does not rewrite the group when it merely inherited', () => {
    // Inheriting is already consistent, so rewriting every sibling would be a
    // pointless write on every single photo upload.
    expect(
      resolveProjectTitle({ groupKey: 'g1', existingGroupTitle: 'Kitchen refit' }).rewriteGroup,
    ).toBe(false);
  });

  it('lets an explicit title win and rewrites the whole group', () => {
    expect(
      resolveProjectTitle({
        groupKey: 'g1',
        requestedTitle: 'Kitchen refit, Bonapriso',
        existingGroupTitle: 'Kitchen refit',
      }),
    ).toEqual({ title: 'Kitchen refit, Bonapriso', rewriteGroup: true });
  });

  it('treats an explicit null as "clear the title", not as "not supplied"', () => {
    // undefined and null are genuinely different intents here, which is why the
    // parameter is optional rather than nullable-with-a-default.
    expect(
      resolveProjectTitle({ groupKey: 'g1', requestedTitle: null, existingGroupTitle: 'Old name' }),
    ).toEqual({ title: null, rewriteGroup: true });
  });

  it('titles a brand-new group from the explicit title', () => {
    expect(
      resolveProjectTitle({
        groupKey: 'g2',
        requestedTitle: 'Roof repair',
        existingGroupTitle: null,
      }),
    ).toEqual({ title: 'Roof repair', rewriteGroup: true });
  });

  it('leaves a new group untitled when nothing was supplied', () => {
    expect(resolveProjectTitle({ groupKey: 'g2', existingGroupTitle: null })).toEqual({
      title: null,
      rewriteGroup: false,
    });
  });

  it('drops the title when an item is pulled out of its group', () => {
    // A project name with no project is not a thing, and a stale one would
    // caption a lone photo with a job it is no longer part of.
    expect(resolveProjectTitle({ groupKey: null, existingGroupTitle: 'Kitchen refit' })).toEqual({
      title: null,
      rewriteGroup: false,
    });
  });

  it('drops the title even when one was explicitly supplied without a group', () => {
    expect(
      resolveProjectTitle({
        groupKey: null,
        requestedTitle: 'Kitchen refit',
        existingGroupTitle: null,
      }),
    ).toEqual({ title: null, rewriteGroup: false });
  });

  it('adopts the TARGET group’s title when an item moves between groups', () => {
    // The second silent-drift case: without this, a photo moved from "Kitchen
    // refit" into "Bathroom" would carry the kitchen's name with it.
    expect(
      resolveProjectTitle({ groupKey: 'bathroom', existingGroupTitle: 'Bathroom retile' }),
    ).toEqual({ title: 'Bathroom retile', rewriteGroup: false });
  });
});
