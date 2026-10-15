import { describe, expect, it } from 'vitest';
import { appWorkerScope } from './web-push';

describe('appWorkerScope', () => {
  it('uses the locale in the path', () => {
    expect(appWorkerScope('/fr/app/notifications')).toBe('/fr/app');
    expect(appWorkerScope('/en/app')).toBe('/en/app');
  });

  it('falls back to the default locale for other paths', () => {
    expect(appWorkerScope('/auth/login')).toBe('/en/app');
    expect(appWorkerScope('/')).toBe('/en/app');
  });
});
