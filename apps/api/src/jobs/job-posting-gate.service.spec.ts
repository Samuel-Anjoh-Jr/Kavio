import { Role } from '@kavio/database';
import { AppException } from '../lib/app-exception';
import type { PrismaService } from '../prisma/prisma.service';
import type { PlatformSettingsService } from '../settings/platform-settings.service';
import { JobPostingGateService } from './job-posting-gate.service';

/**
 * assertDirectHasWorker is JOB-01's second anti-lure control: a CLIENT must
 * always name the one worker a DIRECT job is for, closed server-side so the
 * rule holds even against a direct API call, not only the UI that hides it.
 */
describe('JobPostingGateService.assertDirectHasWorker', () => {
  function makeService() {
    // Neither collaborator is touched by this method — it is a pure role/shape
    // check — so a bare cast stands in for both.
    return new JobPostingGateService(
      {} as unknown as PrismaService,
      {} as unknown as PlatformSettingsService,
    );
  }

  it('rejects a CLIENT publishing DIRECT with no worker named', () => {
    const service = makeService();

    expect(() => service.assertDirectHasWorker(Role.CLIENT, undefined)).toThrow(AppException);
    try {
      service.assertDirectHasWorker(Role.CLIENT, undefined);
      throw new Error('expected assertDirectHasWorker to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe('WORKER_REQUIRED');
    }
  });

  it('allows a CLIENT publishing DIRECT once a workerId is named', () => {
    const service = makeService();

    expect(() => service.assertDirectHasWorker(Role.CLIENT, 'worker-1')).not.toThrow();
  });

  it('never blocks a BUSINESS caller, workerless or not', () => {
    const service = makeService();

    expect(() => service.assertDirectHasWorker(Role.BUSINESS, undefined)).not.toThrow();
  });

  it('never blocks a WORKER caller posting their own job', () => {
    const service = makeService();

    expect(() => service.assertDirectHasWorker(Role.WORKER, undefined)).not.toThrow();
  });
});
