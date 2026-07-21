import { estimateTravel, etaSeconds, haversineMeters } from './eta.util';

describe('eta.util (PROMPT 74)', () => {
  describe('haversineMeters', () => {
    it('is zero for the same point', () => {
      expect(haversineMeters(4.05, 9.7, 4.05, 9.7)).toBe(0);
    });

    it('measures one degree of latitude as ~111 km', () => {
      // A degree of latitude is ~111.19 km anywhere; the cleanest known check.
      const km = haversineMeters(0, 0, 1, 0) / 1000;
      expect(km).toBeGreaterThan(110);
      expect(km).toBeLessThan(112);
    });

    it('measures a short Douala hop in the hundreds of metres', () => {
      // ~1.1 km diagonal across a neighbourhood.
      const meters = haversineMeters(4.05, 9.7, 4.06, 9.71);
      expect(meters).toBeGreaterThan(1000);
      expect(meters).toBeLessThan(2000);
    });

    it('is symmetric', () => {
      const ab = haversineMeters(4.05, 9.7, 4.06, 9.71);
      const ba = haversineMeters(4.06, 9.71, 4.05, 9.7);
      expect(ab).toBeCloseTo(ba, 6);
    });
  });

  describe('etaSeconds', () => {
    it('uses the reported speed when the device is moving', () => {
      // 1000 m at 10 m/s = 100 s.
      expect(etaSeconds(1000, 10)).toBe(100);
    });

    it('falls back to the default speed when stopped or speed is absent', () => {
      const fromDefault = etaSeconds(1000, undefined);
      const fromStopped = etaSeconds(1000, 0.1);
      expect(fromDefault).toBe(fromStopped);
      // Default 25 km/h ≈ 6.94 m/s ⇒ ~144 s for 1 km.
      expect(fromDefault).toBeGreaterThan(130);
      expect(fromDefault).toBeLessThan(160);
    });
  });

  describe('estimateTravel', () => {
    it('returns null when there is no destination', () => {
      expect(estimateTravel(4.05, 9.7, null, null)).toBeNull();
      expect(estimateTravel(4.05, 9.7, 4.06, null)).toBeNull();
    });

    it('returns a rounded distance and an ETA when a destination is set', () => {
      const est = estimateTravel(4.05, 9.7, 4.06, 9.71, 10);
      expect(est).not.toBeNull();
      expect(Number.isInteger(est!.distanceMeters)).toBe(true);
      expect(est!.distanceMeters).toBeGreaterThan(0);
      expect(est!.etaSeconds).toBeGreaterThan(0);
    });
  });
});
