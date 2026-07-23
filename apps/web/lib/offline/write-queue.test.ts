import { describe, expect, it } from 'vitest';
import { collapseQueue, isQueueable, mergeQueued, type QueuedWrite } from './write-queue';

function entry(overrides: Partial<QueuedWrite> = {}): QueuedWrite {
  return {
    id: 'a',
    path: 'jobs/j1',
    method: 'PATCH',
    body: {},
    dedupeKey: 'job-draft:j1',
    createdAt: 1_000,
    updatedAt: 1_000,
    attempts: 0,
    lastError: null,
    ...overrides,
  };
}

describe('mergeQueued (last-write-wins)', () => {
  it('lets the later value win on a field both writes set', () => {
    const merged = mergeQueued(
      entry({ body: { title: 'Fix tap', budget: 5_000 } }),
      entry({ id: 'b', body: { title: 'Fix kitchen tap' }, updatedAt: 2_000 }),
    );

    expect(merged.body.title).toBe('Fix kitchen tap');
  });

  it('keeps fields only the earlier write set', () => {
    const merged = mergeQueued(
      entry({ body: { title: 'Fix tap', budget: 5_000 } }),
      entry({ id: 'b', body: { title: 'Fix kitchen tap' } }),
    );

    expect(merged.body.budget).toBe(5_000);
  });

  it('keeps the original id and createdAt so replay order reflects the first edit', () => {
    const merged = mergeQueued(
      entry({ id: 'original', createdAt: 1_000 }),
      entry({ id: 'later', createdAt: 9_000, updatedAt: 9_000 }),
    );

    expect(merged.id).toBe('original');
    expect(merged.createdAt).toBe(1_000);
    expect(merged.updatedAt).toBe(9_000);
  });

  it('resets failure bookkeeping, because a new body is a new intent', () => {
    const merged = mergeQueued(
      entry({ attempts: 3, lastError: 'Network down' }),
      entry({ id: 'b', body: { title: 'New' } }),
    );

    expect(merged.attempts).toBe(0);
    expect(merged.lastError).toBeNull();
  });

  it('replaces nested values wholesale rather than deep-merging them', () => {
    // The policy is explicitly "simple fields". A deep merge here would silently
    // resurrect a removed array member and call it a merge.
    const merged = mergeQueued(
      entry({ body: { photos: ['a', 'b'] } }),
      entry({ id: 'b', body: { photos: ['c'] } }),
    );

    expect(merged.body.photos).toEqual(['c']);
  });
});

describe('collapseQueue', () => {
  it('collapses two edits to the same target into one queued call', () => {
    const queue = collapseQueue(
      [entry({ id: 'a', body: { title: 'Draft' } })],
      entry({ id: 'b', body: { title: 'Final' }, createdAt: 2_000 }),
    );

    expect(queue).toHaveLength(1);
    expect(queue[0]!.body.title).toBe('Final');
  });

  it('keeps writes to different targets as separate calls', () => {
    const queue = collapseQueue(
      [entry({ id: 'a', dedupeKey: 'job-draft:j1' })],
      entry({ id: 'b', dedupeKey: 'job-draft:j2', createdAt: 2_000 }),
    );

    expect(queue).toHaveLength(2);
  });

  it('never collapses entries with a null key — each is a distinct intent', () => {
    const send = (id: string, at: number) =>
      entry({ id, dedupeKey: null, path: 'messages', method: 'POST', createdAt: at });

    let queue = collapseQueue([], send('a', 1_000));
    queue = collapseQueue(queue, send('b', 2_000));

    expect(queue).toHaveLength(2);
  });

  it('replays oldest first', () => {
    let queue = collapseQueue([], entry({ id: 'second', dedupeKey: 'x', createdAt: 5_000 }));
    queue = collapseQueue(queue, entry({ id: 'first', dedupeKey: 'y', createdAt: 1_000 }));

    expect(queue.map((e) => e.id)).toEqual(['first', 'second']);
  });
});

describe('isQueueable', () => {
  it('queues ordinary content writes', () => {
    expect(isQueueable('jobs/j1')).toBe(true);
    expect(isQueueable('/messages')).toBe(true);
    expect(isQueueable('profiles/me')).toBe(true);
  });

  it('refuses money and trust-state writes, which must fail loudly offline', () => {
    // Replaying these against a state machine that has since advanced is how a
    // double charge or a stale verification decision happens.
    expect(isQueueable('payments/escrow/e1/release')).toBe(false);
    expect(isQueueable('wallet/withdraw')).toBe(false);
    expect(isQueueable('disputes/d1/resolve')).toBe(false);
    expect(isQueueable('verification/v1/approve')).toBe(false);
    expect(isQueueable('admin/users/u1/suspend')).toBe(false);
  });

  it('does not let a prefix match a merely similar path', () => {
    expect(isQueueable('walletsomething')).toBe(true);
  });
});
