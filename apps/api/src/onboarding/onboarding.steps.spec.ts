import { OnboardingRole } from '@trustpro/database';
import {
  completedStepKeys,
  computeCompletion,
  firstStepKey,
  missingRequiredSteps,
  nextStepKey,
  ONBOARDING_UNLOCKS,
  stepsFor,
} from './onboarding.steps';

/**
 * The completion model is what TRU-05's unlockable-benefit messaging is built
 * on, so the percentage has to be exact rather than roughly right.
 */
describe('onboarding completion model', () => {
  const workerComplete = {
    services: [{ name: 'Plumbing', startingPrice: 5000 }],
    availability: [{ dayOfWeek: 1, startTime: '08:00', endTime: '17:00' }],
    portfolio: [{ mediaAssetId: 'a3f1c2d4-0000-4000-8000-000000000001' }],
    identity: { idFrontAssetId: 'id-front', selfieAssetId: 'selfie' },
    location: { city: 'Douala' },
  };

  it('reports 0% for an untouched flow', () => {
    expect(computeCompletion(OnboardingRole.WORKER, {})).toBe(0);
    expect(computeCompletion(OnboardingRole.CLIENT, {})).toBe(0);
    expect(computeCompletion(OnboardingRole.BUSINESS, {})).toBe(0);
  });

  it('reports 100% once every step is satisfied', () => {
    expect(computeCompletion(OnboardingRole.WORKER, workerComplete)).toBe(100);
  });

  it('counts each step equally, including optional ones', () => {
    // 5 worker steps, 2 satisfied -> 40%. Optional steps must still count, or
    // a worker who uploaded nothing could reach 100%.
    const partial = { services: workerComplete.services, location: workerComplete.location };
    expect(computeCompletion(OnboardingRole.WORKER, partial)).toBe(40);
  });

  it('treats an empty array as an unsatisfied step', () => {
    expect(computeCompletion(OnboardingRole.WORKER, { services: [], portfolio: [] })).toBe(0);
  });

  it('requires BOTH the ID front and the selfie for the identity step', () => {
    const frontOnly = { identity: { idFrontAssetId: 'id-front' } };
    expect(completedStepKeys(OnboardingRole.WORKER, frontOnly)).not.toContain('identity');

    const both = { identity: { idFrontAssetId: 'id-front', selfieAssetId: 'selfie' } };
    expect(completedStepKeys(OnboardingRole.WORKER, both)).toContain('identity');
  });

  it('ignores a location with a blank city', () => {
    expect(completedStepKeys(OnboardingRole.WORKER, { location: { city: '   ' } })).not.toContain(
      'location',
    );
  });

  describe('resume point', () => {
    it('starts at the first step for an empty flow', () => {
      expect(nextStepKey(OnboardingRole.WORKER, {})).toBe(firstStepKey(OnboardingRole.WORKER));
    });

    it('skips satisfied steps', () => {
      expect(nextStepKey(OnboardingRole.WORKER, { services: workerComplete.services })).toBe(
        'availability',
      );
    });

    it('stays on the last step once everything is done', () => {
      const steps = stepsFor(OnboardingRole.WORKER);
      expect(nextStepKey(OnboardingRole.WORKER, workerComplete)).toBe(steps[steps.length - 1]?.key);
    });
  });

  describe('required steps', () => {
    it('blocks completion while a required step is missing', () => {
      expect(missingRequiredSteps(OnboardingRole.WORKER, {})).toEqual([
        'services',
        'availability',
        'location',
      ]);
    });

    it('does NOT block on portfolio or ID', () => {
      // Progressive verification: a worker who cannot photograph an ID today
      // must still be able to finish and appear on the platform (TRU-05).
      const withoutOptional = {
        services: workerComplete.services,
        availability: workerComplete.availability,
        location: workerComplete.location,
      };
      expect(missingRequiredSteps(OnboardingRole.WORKER, withoutOptional)).toEqual([]);
      expect(computeCompletion(OnboardingRole.WORKER, withoutOptional)).toBe(60);
    });

    it('requires name and location for a client', () => {
      expect(missingRequiredSteps(OnboardingRole.CLIENT, {})).toEqual(['profile', 'location']);
      expect(
        missingRequiredSteps(OnboardingRole.CLIENT, {
          profile: { displayName: 'Amina N.' },
          location: { city: 'Yaoundé' },
        }),
      ).toEqual([]);
    });

    it('requires only company details for a business', () => {
      expect(missingRequiredSteps(OnboardingRole.BUSINESS, { company: { name: 'Acme' } })).toEqual(
        [],
      );
    });
  });

  describe('unlock thresholds', () => {
    it('never places an unlock above 100%', () => {
      for (const unlocks of Object.values(ONBOARDING_UNLOCKS)) {
        for (const unlock of unlocks) {
          expect(unlock.threshold).toBeGreaterThan(0);
          expect(unlock.threshold).toBeLessThanOrEqual(100);
        }
      }
    });

    it('keeps every unlock reachable by the role step count', () => {
      // A threshold that no combination of steps can produce would be a benefit
      // the user can see but never earn.
      for (const [role, unlocks] of Object.entries(ONBOARDING_UNLOCKS)) {
        const total = stepsFor(role as OnboardingRole).length;
        const reachable = Array.from({ length: total + 1 }, (_, done) =>
          Math.round((done / total) * 100),
        );

        for (const unlock of unlocks) {
          expect(reachable).toContain(unlock.threshold);
        }
      }
    });
  });

  describe('step schemas', () => {
    it('rejects an availability slot that ends before it starts', () => {
      const step = stepsFor(OnboardingRole.WORKER).find((s) => s.key === 'availability');
      const result = step?.schema.safeParse({
        availability: [{ dayOfWeek: 1, startTime: '17:00', endTime: '08:00' }],
      });
      expect(result?.success).toBe(false);
    });

    it('rejects a service with no name', () => {
      const step = stepsFor(OnboardingRole.WORKER).find((s) => s.key === 'services');
      expect(step?.schema.safeParse({ services: [{ name: '' }] }).success).toBe(false);
    });

    it('accepts a service priced in whole XAF', () => {
      const step = stepsFor(OnboardingRole.WORKER).find((s) => s.key === 'services');
      expect(step?.schema.safeParse({ services: [{ name: 'Tiling', startingPrice: 15000 }] }).success).toBe(
        true,
      );
    });

    it('rejects a fractional price — XAF has no minor unit', () => {
      const step = stepsFor(OnboardingRole.WORKER).find((s) => s.key === 'services');
      expect(
        step?.schema.safeParse({ services: [{ name: 'Tiling', startingPrice: 1500.5 }] }).success,
      ).toBe(false);
    });
  });
});
