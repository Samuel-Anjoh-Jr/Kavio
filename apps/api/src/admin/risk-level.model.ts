/**
 * How a risk level is decided (ADM-06).
 *
 * This lives in its own module, separate from the service, because it is the
 * one piece of the Fraud & Risk monitor that makes a JUDGEMENT about a person —
 * and a judgement that is not directly testable is one nobody can argue with.
 *
 * Nothing here is persisted. The level is recomputed from the signals on every
 * read, which is why a signal that is later explained away simply stops
 * appearing rather than leaving a stored verdict behind.
 */

export interface RiskSignal {
  code: string;
  count: number;
}

export type RiskLevel = 'LOW' | 'ELEVATED' | 'HIGH';

/**
 * Two rules, both explicit so an admin can be told exactly why a row is where
 * it is:
 *
 *   1. A confirmed-fraud trust suspension is HIGH on its own. It is already the
 *      outcome of a human decision, so it does not need corroboration.
 *   2. Otherwise the level follows how many INDEPENDENT signals coincide. One
 *      signal is a fact; two is a coincidence; three unrelated ones is a pattern.
 *
 * Note that the COUNTS deliberately do not raise the level — thirty reports from
 * one brigading campaign is still a single kind of evidence, and letting volume
 * alone reach HIGH would make the monitor trivial to weaponise against a
 * competitor.
 */
export function riskLevel(signals: RiskSignal[]): RiskLevel {
  if (signals.some((signal) => signal.code === 'TRUST_SUSPENDED')) return 'HIGH';
  if (signals.length >= 3) return 'HIGH';
  if (signals.length === 2) return 'ELEVATED';
  return 'LOW';
}

/**
 * The sort key: level first, then how much evidence sits behind it.
 *
 * Counts break ties WITHIN a level, so the worst-looking cases reach a human
 * first without volume alone being able to promote a case past a more serious one.
 */
export function riskRank(row: { level: RiskLevel; signals: RiskSignal[] }): number {
  const levelWeight = row.level === 'HIGH' ? 1_000_000 : row.level === 'ELEVATED' ? 1_000 : 0;
  return levelWeight + row.signals.reduce((sum, signal) => sum + signal.count, 0);
}
