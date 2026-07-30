import { getCampayDemoAmountXaf, isCampayDemo } from './payments.config';

describe('payments config: Campay demo sandbox', () => {
  describe('isCampayDemo', () => {
    it("is true for Campay's own shared sandbox host", () => {
      expect(
        isCampayDemo({
          baseUrl: 'https://demo.campay.net',
          username: '',
          password: '',
          webhookKey: '',
        }),
      ).toBe(true);
    });

    it('is false for a real Campay production base URL', () => {
      expect(
        isCampayDemo({
          baseUrl: 'https://api.campay.net',
          username: '',
          password: '',
          webhookKey: '',
        }),
      ).toBe(false);
    });

    it('is false for an unparsable base URL rather than throwing', () => {
      expect(
        isCampayDemo({ baseUrl: 'not a url', username: '', password: '', webhookKey: '' }),
      ).toBe(false);
    });
  });

  describe('getCampayDemoAmountXaf', () => {
    it('defaults to 25', () => {
      expect(getCampayDemoAmountXaf({})).toBe(25);
    });

    it('accepts a configured override', () => {
      expect(getCampayDemoAmountXaf({ CAMPAY_DEMO_AMOUNT_XAF: '100' })).toBe(100);
    });

    it('falls back to 25 for a non-positive or non-integer override', () => {
      expect(getCampayDemoAmountXaf({ CAMPAY_DEMO_AMOUNT_XAF: '0' })).toBe(25);
      expect(getCampayDemoAmountXaf({ CAMPAY_DEMO_AMOUNT_XAF: '-5' })).toBe(25);
      expect(getCampayDemoAmountXaf({ CAMPAY_DEMO_AMOUNT_XAF: 'abc' })).toBe(25);
      expect(getCampayDemoAmountXaf({ CAMPAY_DEMO_AMOUNT_XAF: '12.5' })).toBe(25);
    });
  });
});
