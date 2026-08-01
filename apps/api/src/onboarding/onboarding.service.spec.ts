import { OnboardingRole, VerificationCheckType } from '@kavio/database';
import { AppException } from '../lib/app-exception';
import type { PrismaService } from '../prisma/prisma.service';
import type { VerificationService } from '../verification/verification.service';
import { OnboardingService } from './onboarding.service';

const USER_ID = 'user-1';

const WORKER_DATA = {
  services: [{ name: 'Plumbing' }],
  availability: [{ dayOfWeek: 1, startTime: '08:00', endTime: '17:00' }],
  portfolio: [],
  identity: {
    idFrontAssetId: '11111111-1111-1111-1111-111111111111',
    idBackAssetId: '22222222-2222-2222-2222-222222222222',
    selfieAssetId: '33333333-3333-3333-3333-333333333333',
  },
  location: { city: 'Douala', source: 'HUMAN_INPUT' },
};

function makeTx() {
  return {
    workerProfile: { upsert: jest.fn().mockResolvedValue({ id: 'wp-1' }) },
    service: { deleteMany: jest.fn(), createMany: jest.fn() },
    availability: { deleteMany: jest.fn(), createMany: jest.fn() },
    portfolioItem: { deleteMany: jest.fn(), createMany: jest.fn() },
    mediaAsset: { findMany: jest.fn().mockResolvedValue([]) },
    businessProfile: { upsert: jest.fn().mockResolvedValue({ id: 'bp-1' }) },
    businessTeamMember: { deleteMany: jest.fn(), createMany: jest.fn() },
    onboardingProgress: { upsert: jest.fn() },
  };
}

function makeService(options: { data: Record<string, unknown>; submit: jest.Mock }) {
  const tx = makeTx();
  const prisma = {
    client: {
      onboardingProgress: {
        findUnique: jest.fn().mockResolvedValue({ data: options.data, completedAt: null }),
      },
      $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx)),
    },
  } as unknown as PrismaService;

  const verification = { submit: options.submit } as unknown as VerificationService;
  return new OnboardingService(prisma, verification);
}

describe('OnboardingService.complete', () => {
  it('submits both ID_APPROVED and SELFIE_LIVENESS once the worker profile is materialised', async () => {
    const submit = jest.fn().mockResolvedValue({ recordId: 'rec-1' });
    const service = makeService({ data: WORKER_DATA, submit });

    await service.complete(USER_ID, OnboardingRole.WORKER);

    expect(submit).toHaveBeenCalledWith({ id: USER_ID }, VerificationCheckType.ID_APPROVED, [
      WORKER_DATA.identity.idFrontAssetId,
      WORKER_DATA.identity.idBackAssetId,
    ]);
    expect(submit).toHaveBeenCalledWith({ id: USER_ID }, VerificationCheckType.SELFIE_LIVENESS, [
      WORKER_DATA.identity.selfieAssetId,
    ]);
  });

  it('skips ID_APPROVED when only the front of the ID was uploaded', async () => {
    const submit = jest.fn().mockResolvedValue({ recordId: 'rec-1' });
    const data = {
      ...WORKER_DATA,
      identity: { idFrontAssetId: WORKER_DATA.identity.idFrontAssetId },
    };
    const service = makeService({ data, submit });

    await service.complete(USER_ID, OnboardingRole.WORKER);

    expect(submit).not.toHaveBeenCalledWith(
      expect.anything(),
      VerificationCheckType.ID_APPROVED,
      expect.anything(),
    );
  });

  it('submits PORTFOLIO with all uploaded portfolio asset ids', async () => {
    const submit = jest.fn().mockResolvedValue({ recordId: 'rec-3' });
    const data = {
      ...WORKER_DATA,
      portfolio: [
        { mediaAssetId: '55555555-5555-5555-5555-555555555555', type: 'PHOTO' },
        { mediaAssetId: '66666666-6666-6666-6666-666666666666', type: 'PHOTO' },
      ],
    };
    const service = makeService({ data, submit });

    await service.complete(USER_ID, OnboardingRole.WORKER);

    expect(submit).toHaveBeenCalledWith({ id: USER_ID }, VerificationCheckType.PORTFOLIO, [
      '55555555-5555-5555-5555-555555555555',
      '66666666-6666-6666-6666-666666666666',
    ]);
  });

  it('skips PORTFOLIO submission when no portfolio items were uploaded', async () => {
    const submit = jest.fn().mockResolvedValue({ recordId: 'rec-1' });
    const service = makeService({ data: WORKER_DATA, submit });

    await service.complete(USER_ID, OnboardingRole.WORKER);

    expect(submit).not.toHaveBeenCalledWith(
      expect.anything(),
      VerificationCheckType.PORTFOLIO,
      expect.anything(),
    );
  });

  it('does not fail completion when the check was already submitted', async () => {
    const submit = jest
      .fn()
      .mockRejectedValue(new AppException(409, 'DUPLICATE_ATTEMPT', 'Already pending.'));
    const service = makeService({ data: WORKER_DATA, submit });

    await expect(service.complete(USER_ID, OnboardingRole.WORKER)).resolves.toBeDefined();
  });

  it('submits BUSINESS_REGISTRATION for the documents step', async () => {
    const submit = jest.fn().mockResolvedValue({ recordId: 'rec-2' });
    const data = {
      company: { name: 'Douala Facilities Ltd', city: 'Douala' },
      documents: { registrationAssetId: '44444444-4444-4444-4444-444444444444' },
      team: [],
    };
    const service = makeService({ data, submit });

    await service.complete(USER_ID, OnboardingRole.BUSINESS);

    expect(submit).toHaveBeenCalledWith(
      { id: USER_ID },
      VerificationCheckType.BUSINESS_REGISTRATION,
      [data.documents.registrationAssetId],
    );
  });

  it('also submits the owner’s own ID_APPROVED and SELFIE_LIVENESS for a business', async () => {
    // JobPostingGateService.check() requires ID_APPROVED (the owner's own,
    // not the company's) alongside a verified BusinessProfile — without this,
    // a business could finish every step here and never satisfy that gate.
    const submit = jest.fn().mockResolvedValue({ recordId: 'rec-2' });
    const data = {
      company: { name: 'Douala Facilities Ltd', city: 'Douala' },
      documents: { registrationAssetId: '44444444-4444-4444-4444-444444444444' },
      team: [],
      identity: {
        idFrontAssetId: '11111111-1111-1111-1111-111111111111',
        idBackAssetId: '22222222-2222-2222-2222-222222222222',
        selfieAssetId: '33333333-3333-3333-3333-333333333333',
      },
    };
    const service = makeService({ data, submit });

    await service.complete(USER_ID, OnboardingRole.BUSINESS);

    expect(submit).toHaveBeenCalledWith({ id: USER_ID }, VerificationCheckType.ID_APPROVED, [
      data.identity.idFrontAssetId,
      data.identity.idBackAssetId,
    ]);
    expect(submit).toHaveBeenCalledWith({ id: USER_ID }, VerificationCheckType.SELFIE_LIVENESS, [
      data.identity.selfieAssetId,
    ]);
  });
});
