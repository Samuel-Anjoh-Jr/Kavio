import { computeResponseTimeStat, MIN_INVITATIONS_FOR_RESPONSE_STAT } from './response-time.util';

function invitationAfter(minutes: number, createdAt = new Date('2026-01-01T00:00:00.000Z')) {
  return { createdAt, respondedAt: new Date(createdAt.getTime() + minutes * 60_000) };
}

describe('computeResponseTimeStat', () => {
  it('reports unscored below the minimum sample size', () => {
    const invitations = Array.from({ length: MIN_INVITATIONS_FOR_RESPONSE_STAT - 1 }, () =>
      invitationAfter(10),
    );
    expect(computeResponseTimeStat(invitations)).toEqual({
      respondsWithinMinutes: null,
      scored: false,
    });
  });

  it('scores at exactly the minimum sample size', () => {
    const invitations = Array.from({ length: MIN_INVITATIONS_FOR_RESPONSE_STAT }, () =>
      invitationAfter(30),
    );
    expect(computeResponseTimeStat(invitations)).toEqual({
      respondsWithinMinutes: 30,
      scored: true,
    });
  });

  it('takes the median, not the mean, so one slow outlier does not dominate', () => {
    const invitations = [invitationAfter(5), invitationAfter(10), invitationAfter(600)];
    expect(computeResponseTimeStat(invitations)).toEqual({
      respondsWithinMinutes: 10,
      scored: true,
    });
  });

  it('averages the middle two for an even sample', () => {
    const invitations = [
      invitationAfter(10),
      invitationAfter(20),
      invitationAfter(30),
      invitationAfter(40),
    ];
    expect(computeResponseTimeStat(invitations).respondsWithinMinutes).toBe(25);
  });

  it('never returns a negative minute count for a clock skew of respondedAt before createdAt', () => {
    const createdAt = new Date('2026-01-01T00:10:00.000Z');
    const respondedAt = new Date('2026-01-01T00:00:00.000Z');
    const invitations = [{ createdAt, respondedAt }, invitationAfter(5), invitationAfter(5)];
    expect(computeResponseTimeStat(invitations).respondsWithinMinutes).toBeGreaterThanOrEqual(0);
  });
});
