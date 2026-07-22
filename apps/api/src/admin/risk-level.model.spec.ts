import { riskLevel, riskRank, type RiskSignal } from './risk-level.model';

/**
 * How the Fraud & Risk monitor decides a level (ADM-06).
 *
 * Tested directly because this is the one place the monitor makes a judgement
 * about a person, and a judgement nobody can reproduce is one nobody can argue
 * with.
 */

const signal = (code: string, count = 1): RiskSignal => ({ code, count });

describe('riskLevel', () => {
  it('is LOW for a single signal — one fact is not a pattern', () => {
    expect(riskLevel([signal('OPEN_REPORTS')])).toBe('LOW');
  });

  it('is LOW for no signals at all', () => {
    expect(riskLevel([])).toBe('LOW');
  });

  it('is ELEVATED when two independent signals coincide', () => {
    expect(riskLevel([signal('OPEN_REPORTS'), signal('DISPUTES_LOST')])).toBe('ELEVATED');
  });

  it('is HIGH when three independent signals coincide', () => {
    expect(riskLevel([signal('OPEN_REPORTS'), signal('DISPUTES_LOST'), signal('LOW_TRUST')])).toBe(
      'HIGH',
    );
  });

  it('is HIGH for a confirmed-fraud trust suspension on its own', () => {
    // A suspension is already the outcome of a human decision, so it needs no
    // corroborating signal to reach the top of the queue.
    expect(riskLevel([signal('TRUST_SUSPENDED')])).toBe('HIGH');
  });

  it('does not let VOLUME alone reach HIGH', () => {
    // Thirty reports from one brigading campaign is still a single kind of
    // evidence. If count raised the level, the monitor would be trivial to
    // weaponise against a competitor.
    expect(riskLevel([signal('OPEN_REPORTS', 30)])).toBe('LOW');
    expect(riskLevel([signal('OPEN_REPORTS', 500), signal('BLOCKED_BY_USERS', 400)])).toBe(
      'ELEVATED',
    );
  });
});

describe('riskRank', () => {
  it('sorts every HIGH above every ELEVATED, whatever the counts', () => {
    const high = { level: 'HIGH' as const, signals: [signal('TRUST_SUSPENDED', 1)] };
    const elevated = {
      level: 'ELEVATED' as const,
      signals: [signal('OPEN_REPORTS', 900), signal('DISPUTES_LOST', 900)],
    };

    expect(riskRank(high)).toBeGreaterThan(riskRank(elevated));
  });

  it('sorts every ELEVATED above every LOW', () => {
    const elevated = {
      level: 'ELEVATED' as const,
      signals: [signal('OPEN_REPORTS'), signal('LOW_TRUST')],
    };
    const low = { level: 'LOW' as const, signals: [signal('OPEN_REPORTS', 900)] };

    expect(riskRank(elevated)).toBeGreaterThan(riskRank(low));
  });

  it('breaks ties within a level by how much evidence there is', () => {
    const heavier = { level: 'HIGH' as const, signals: [signal('OPEN_REPORTS', 10)] };
    const lighter = { level: 'HIGH' as const, signals: [signal('OPEN_REPORTS', 2)] };

    expect(riskRank(heavier)).toBeGreaterThan(riskRank(lighter));
  });
});
