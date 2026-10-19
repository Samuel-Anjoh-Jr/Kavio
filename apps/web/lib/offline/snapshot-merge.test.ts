import { describe, expect, it } from 'vitest';
import { mergeSnapshots } from './snapshot-merge';

describe('mergeSnapshots', () => {
  it('keeps root queries read in an earlier page load', () => {
    const merged = mergeSnapshots(
      {
        ROOT_QUERY: { __typename: 'Query', 'jobs({"pageSize":12})': { __ref: 'JobBoard:1' } },
        'JobBoard:1': { id: 1 },
      },
      { ROOT_QUERY: { __typename: 'Query', me: { __ref: 'User:u1' } }, 'User:u1': { id: 'u1' } },
    );

    expect(Object.keys(merged.ROOT_QUERY as object)).toEqual(
      expect.arrayContaining(['jobs({"pageSize":12})', 'me']),
    );
    expect(merged['JobBoard:1']).toEqual({ id: 1 });
    expect(merged['User:u1']).toEqual({ id: 'u1' });
  });

  it('lets the live cache win for the same root field', () => {
    const merged = mergeSnapshots(
      { ROOT_QUERY: { unreadMessageCount: 9 } },
      { ROOT_QUERY: { unreadMessageCount: 2 } },
    );
    expect((merged.ROOT_QUERY as Record<string, unknown>).unreadMessageCount).toBe(2);
  });

  it('replaces an entity wholesale rather than mixing two versions of it', () => {
    const merged = mergeSnapshots(
      { 'Job:1': { id: 1, title: 'Old', budget: 5_000 } },
      { 'Job:1': { id: 1, title: 'New' } },
    );
    expect(merged['Job:1']).toEqual({ id: 1, title: 'New' });
  });

  it('is just the live cache when there is nothing earlier', () => {
    const live = { ROOT_QUERY: { me: null } };
    expect(mergeSnapshots(null, live)).toBe(live);
  });
});
