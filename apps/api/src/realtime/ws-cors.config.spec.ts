import { wsCorsOptions } from './ws-cors.config';

describe('wsCorsOptions', () => {
  it('exposes the allowlist as the origin option', () => {
    expect(wsCorsOptions({ NEXT_PUBLIC_SITE_URL: 'https://kavio.cm' })).toEqual({
      origin: ['https://kavio.cm'],
    });
  });

  it('fails closed (rejects every origin) rather than reopening to any origin', () => {
    expect(wsCorsOptions({})).toEqual({ origin: false });
  });
});
