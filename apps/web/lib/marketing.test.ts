import { describe, expect, it } from 'vitest';
import { moveWithin } from './marketing';

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('moveWithin', () => {
  it('moves an entry up and renumbers every position from zero', () => {
    expect(moveWithin(items, 'b', 'up')).toEqual([
      { id: 'b', order: 0 },
      { id: 'a', order: 1 },
      { id: 'c', order: 2 },
    ]);
  });

  it('moves an entry down', () => {
    expect(moveWithin(items, 'b', 'down')).toEqual([
      { id: 'a', order: 0 },
      { id: 'c', order: 1 },
      { id: 'b', order: 2 },
    ]);
  });

  it('refuses to move the first entry up — the button should be disabled, not silently no-op wrong', () => {
    expect(moveWithin(items, 'a', 'up')).toBeNull();
  });

  it('refuses to move the last entry down', () => {
    expect(moveWithin(items, 'c', 'down')).toBeNull();
  });

  it('returns null for an unknown id rather than corrupting the order', () => {
    expect(moveWithin(items, 'z', 'up')).toBeNull();
  });

  it('renumbers contiguously so the API never receives a gap in the sequence', () => {
    const result = moveWithin(items, 'c', 'up');
    expect(result?.map((e) => e.order)).toEqual([0, 1, 2]);
  });
});
