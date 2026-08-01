import type { PrismaService } from '../prisma/prisma.service';
import { getPlatformFeeBps } from '../payments/payments.config';
import { PlatformSettingsService } from './platform-settings.service';

function makeService(storedValue: unknown) {
  const findUnique = jest
    .fn()
    .mockResolvedValue(storedValue === undefined ? null : { value: storedValue });
  const prisma = {
    client: { systemSetting: { findUnique } },
  } as unknown as PrismaService;
  return new PlatformSettingsService(prisma);
}

describe('PlatformSettingsService.platformFeeBps', () => {
  it('falls back to the env-configured default when no row exists', async () => {
    const service = makeService(undefined);

    await expect(service.platformFeeBps()).resolves.toBe(getPlatformFeeBps());
  });

  it('uses the admin-configured percentage when one is set, including a real 0%', async () => {
    const zeroFee = makeService(0);
    await expect(zeroFee.platformFeeBps()).resolves.toBe(0);

    const tenPercent = makeService(10);
    await expect(tenPercent.platformFeeBps()).resolves.toBe(1000);
  });

  it('falls back to the default for an out-of-range stored value', async () => {
    const service = makeService(150);

    await expect(service.platformFeeBps()).resolves.toBe(getPlatformFeeBps());
  });
});
