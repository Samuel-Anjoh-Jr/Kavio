import { getAllowedWsOrigins, wsCorsOptions } from './ws-cors.config';

describe('ws-cors config', () => {
  describe('getAllowedWsOrigins', () => {
    it('defaults to the origins of the web app env vars, deduplicated', () => {
      expect(
        getAllowedWsOrigins({
          NEXT_PUBLIC_SITE_URL: 'https://kavio-web-xi.vercel.app',
          APP_BASE_URL: 'https://kavio-web-xi.vercel.app',
          NEXT_PUBLIC_API_URL: 'https://kavio-api-ptuk.onrender.com',
          NEXT_PUBLIC_WS_URL: 'https://kavio-api-ptuk.onrender.com',
        }),
      ).toEqual(['https://kavio-web-xi.vercel.app', 'https://kavio-api-ptuk.onrender.com']);
    });

    it('drops the path, keeping only scheme://host[:port]', () => {
      expect(
        getAllowedWsOrigins({ NEXT_PUBLIC_SITE_URL: 'https://kavio.cm/some/deep/path' }),
      ).toEqual(['https://kavio.cm']);
    });

    it('tolerates a .env-style value pasted with surrounding quotes', () => {
      expect(getAllowedWsOrigins({ NEXT_PUBLIC_SITE_URL: '"https://kavio.cm"' })).toEqual([
        'https://kavio.cm',
      ]);
    });

    it('an explicit CORS_ALLOWED_ORIGINS overrides the defaults', () => {
      expect(
        getAllowedWsOrigins({
          NEXT_PUBLIC_SITE_URL: 'https://kavio.cm',
          CORS_ALLOWED_ORIGINS: 'https://a.example.com, https://b.example.com',
        }),
      ).toEqual(['https://a.example.com', 'https://b.example.com']);
    });

    it('ignores unparsable values instead of throwing', () => {
      expect(getAllowedWsOrigins({ NEXT_PUBLIC_SITE_URL: 'not a url' })).toEqual([]);
    });

    it('is empty when nothing is configured', () => {
      expect(getAllowedWsOrigins({})).toEqual([]);
    });
  });

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
});
