import { JobStatus } from '@kavio/database';
import {
  canTransitionJob,
  isTerminalJobStatus,
  isTransitionAllowedFor,
  jobTransitionRule,
  JOB_TRANSITIONS,
  TERMINAL_JOB_STATUSES,
} from './job-lifecycle.model';

describe('job lifecycle state machine (SRS §21.3, JOB-05)', () => {
  it('covers every JobStatus in the transition table', () => {
    // A missing key would make a lookup return undefined and crash a guard; the
    // table must be total over the enum.
    for (const status of Object.values(JobStatus)) {
      expect(JOB_TRANSITIONS[status]).toBeDefined();
    }
  });

  it('reproduces the §21.3 exits exactly for the happy path', () => {
    expect(canTransitionJob(JobStatus.DRAFT, JobStatus.OPEN)).toBe(true);
    expect(canTransitionJob(JobStatus.OPEN, JobStatus.QUOTED)).toBe(true);
    expect(canTransitionJob(JobStatus.QUOTED, JobStatus.ACCEPTED)).toBe(true);
    expect(canTransitionJob(JobStatus.ACCEPTED, JobStatus.IN_PROGRESS)).toBe(true);
    expect(canTransitionJob(JobStatus.IN_PROGRESS, JobStatus.COMPLETED)).toBe(true);
    expect(canTransitionJob(JobStatus.COMPLETED, JobStatus.RELEASED)).toBe(true);
  });

  it('rejects skipping a rung or climbing back up', () => {
    expect(canTransitionJob(JobStatus.DRAFT, JobStatus.ACCEPTED)).toBe(false);
    expect(canTransitionJob(JobStatus.OPEN, JobStatus.IN_PROGRESS)).toBe(false);
    expect(canTransitionJob(JobStatus.COMPLETED, JobStatus.IN_PROGRESS)).toBe(false);
    expect(canTransitionJob(JobStatus.RELEASED, JobStatus.DISPUTED)).toBe(false);
  });

  it('treats Released, Refunded and Archived as terminal', () => {
    expect(isTerminalJobStatus(JobStatus.RELEASED)).toBe(true);
    expect(isTerminalJobStatus(JobStatus.ARCHIVED)).toBe(true);
    expect(TERMINAL_JOB_STATUSES).toContain(JobStatus.RELEASED);
    expect(TERMINAL_JOB_STATUSES).toContain(JobStatus.ARCHIVED);
    expect(isTerminalJobStatus(JobStatus.OPEN)).toBe(false);
  });

  it('lets either party raise a dispute but only the system resolve it', () => {
    expect(isTransitionAllowedFor(JobStatus.IN_PROGRESS, JobStatus.DISPUTED, 'POSTER')).toBe(true);
    expect(isTransitionAllowedFor(JobStatus.IN_PROGRESS, JobStatus.DISPUTED, 'WORKER')).toBe(true);
    expect(isTransitionAllowedFor(JobStatus.DISPUTED, JobStatus.REFUNDED, 'POSTER')).toBe(false);
    expect(isTransitionAllowedFor(JobStatus.DISPUTED, JobStatus.REFUNDED, 'SYSTEM')).toBe(true);
  });

  it('does not let a client declare their own escrow refunded', () => {
    // ACCEPTED → REFUNDED is a SYSTEM move (a Campay webhook), never something a
    // party can trigger by hitting the transition endpoint.
    expect(jobTransitionRule(JobStatus.ACCEPTED, JobStatus.REFUNDED)?.actor).toBe('SYSTEM');
    expect(isTransitionAllowedFor(JobStatus.ACCEPTED, JobStatus.REFUNDED, 'POSTER')).toBe(false);
    expect(isTransitionAllowedFor(JobStatus.ACCEPTED, JobStatus.REFUNDED, 'SYSTEM')).toBe(true);
  });

  it('reserves worker-only and poster-only moves to the right party', () => {
    // Only the worker starts work…
    expect(isTransitionAllowedFor(JobStatus.ACCEPTED, JobStatus.IN_PROGRESS, 'WORKER')).toBe(true);
    expect(isTransitionAllowedFor(JobStatus.ACCEPTED, JobStatus.IN_PROGRESS, 'POSTER')).toBe(false);
    // …and only the poster confirms completion (releasing escrow).
    expect(isTransitionAllowedFor(JobStatus.COMPLETED, JobStatus.RELEASED, 'POSTER')).toBe(true);
    expect(isTransitionAllowedFor(JobStatus.COMPLETED, JobStatus.RELEASED, 'WORKER')).toBe(false);
  });

  it('lets the poster publish and archive a draft', () => {
    expect(isTransitionAllowedFor(JobStatus.DRAFT, JobStatus.OPEN, 'POSTER')).toBe(true);
    expect(isTransitionAllowedFor(JobStatus.DRAFT, JobStatus.ARCHIVED, 'POSTER')).toBe(true);
  });

  it('returns null for the rule of an illegal move', () => {
    expect(jobTransitionRule(JobStatus.DRAFT, JobStatus.RELEASED)).toBeNull();
  });
});
