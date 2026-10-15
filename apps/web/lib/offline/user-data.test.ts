import { describe, expect, it } from 'vitest';
import { GUEST_OWNER, ownerChanged } from './user-data';

describe('ownerChanged', () => {
  it('keeps the data when the same person comes back', () => {
    expect(ownerChanged('user-1', 'user-1')).toBe(false);
    expect(ownerChanged(GUEST_OWNER, GUEST_OWNER)).toBe(false);
  });

  it('drops the data when a different person signs in on the device', () => {
    expect(ownerChanged('user-1', 'user-2')).toBe(true);
  });

  it('drops a signed-in person’s data once the device is back to a guest', () => {
    expect(ownerChanged('user-1', GUEST_OWNER)).toBe(true);
  });

  it('drops a guest’s browsing data when someone signs in', () => {
    expect(ownerChanged(GUEST_OWNER, 'user-1')).toBe(true);
  });

  it('treats data with no recorded owner as nobody’s', () => {
    expect(ownerChanged(null, 'user-1')).toBe(true);
  });
});
