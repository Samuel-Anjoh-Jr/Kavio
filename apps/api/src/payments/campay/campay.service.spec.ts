import { CampayService } from './campay.service';

/**
 * Campay's shared sandbox (demo.campay.net) settles a REAL Mobile Money prompt
 * but only ever for a fixed small amount — a request for the real quoted amount
 * is rejected there. These pin the behaviour that lets a demo show a genuine
 * settlement for any quote size without moving real money: the amount actually
 * sent to Campay is capped, but nothing else about the call changes.
 */
describe('CampayService demo mode', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  function buildService(env: Record<string, string>): CampayService {
    process.env = { ...originalEnv, ...env };
    return new CampayService();
  }

  function mockCampayFetch(): jest.SpyInstance {
    return jest.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = input as string;
      const body = url.includes('/api/token/') ? { token: 'tok' } : { reference: 'campay-ref-1' };
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
  }

  function requestBody(fetchMock: jest.SpyInstance, pathFragment: string): { amount: string } {
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes(pathFragment));
    if (!call) {
      throw new Error(`no fetch call matched ${pathFragment}`);
    }
    const init = call[1] as RequestInit;
    return JSON.parse(init.body as string) as { amount: string };
  }

  it('is not demo mode against a real Campay base URL', async () => {
    const fetchMock = mockCampayFetch();
    const service = buildService({
      CAMPAY_BASE_URL: 'https://api.campay.net',
      CAMPAY_APP_USERNAME: 'user',
      CAMPAY_APP_PASSWORD: 'pass',
    });

    expect(service.demoMode).toBe(false);

    await service.collect({
      amountXaf: 25_000,
      phone: '+237670000000',
      description: 'Escrow: fix a leak',
      externalReference: 'ref-1',
    });

    expect(requestBody(fetchMock, '/api/collect/').amount).toBe('25000');
  });

  it('caps a collection to the demo amount on the shared sandbox', async () => {
    const fetchMock = mockCampayFetch();
    const service = buildService({
      CAMPAY_BASE_URL: 'https://demo.campay.net',
      CAMPAY_APP_USERNAME: 'user',
      CAMPAY_APP_PASSWORD: 'pass',
    });

    expect(service.demoMode).toBe(true);

    const result = await service.collect({
      amountXaf: 25_000,
      phone: '+237670000000',
      description: 'Escrow: fix a leak',
      externalReference: 'ref-1',
    });

    expect(requestBody(fetchMock, '/api/collect/').amount).toBe('25');
    expect(result.reference).toBe('campay-ref-1');
    expect(result.outcome).toBe('PENDING');
  });

  it('caps a withdrawal the same way', async () => {
    const fetchMock = mockCampayFetch();
    const service = buildService({
      CAMPAY_BASE_URL: 'https://demo.campay.net',
      CAMPAY_APP_USERNAME: 'user',
      CAMPAY_APP_PASSWORD: 'pass',
    });

    await service.withdraw({
      amountXaf: 25_000,
      phone: '+237670000000',
      description: 'Wallet withdrawal',
      externalReference: 'ref-2',
    });

    expect(requestBody(fetchMock, '/api/withdraw/').amount).toBe('25');
  });

  it('honours a CAMPAY_DEMO_AMOUNT_XAF override', async () => {
    const fetchMock = mockCampayFetch();
    const service = buildService({
      CAMPAY_BASE_URL: 'https://demo.campay.net',
      CAMPAY_APP_USERNAME: 'user',
      CAMPAY_APP_PASSWORD: 'pass',
      CAMPAY_DEMO_AMOUNT_XAF: '100',
    });

    await service.collect({
      amountXaf: 25_000,
      phone: '+237670000000',
      description: 'Escrow: fix a leak',
      externalReference: 'ref-3',
    });

    expect(requestBody(fetchMock, '/api/collect/').amount).toBe('100');
  });

  it('never touches Campay in stub mode (no credentials), demo URL or not', async () => {
    const fetchMock = mockCampayFetch();
    const service = buildService({ CAMPAY_BASE_URL: 'https://demo.campay.net' });

    expect(service.live).toBe(false);

    const result = await service.collect({
      amountXaf: 25_000,
      phone: '+237670000000',
      description: 'Escrow: fix a leak',
      externalReference: 'ref-4',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.reference).toContain('ref-4');
  });
});
