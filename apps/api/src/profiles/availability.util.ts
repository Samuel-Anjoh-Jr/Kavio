/**
 * Weekly availability rules (PRO-05).
 *
 * Times are local "HH:MM" strings, never DateTimes, and that is the load-bearing
 * decision in this file: "I work Mondays 08:00-17:00" is a RECURRING RULE, not
 * an instant. Storing it as a timestamp silently binds it to a date and a
 * timezone, and the first symptom is a worker's hours shifting by an hour when
 * the server moves — a bug that is invisible in every test written in one zone.
 *
 * Cameroon is UTC+1 with no daylight saving, which makes the mistake survivable
 * locally and therefore easier to ship.
 */

/** 0 = Sunday … 6 = Saturday, matching JavaScript's `Date.getDay()`. */
export const DAYS_IN_WEEK = 7;

export interface TimeSlot {
  startTime: string;
  endTime: string;
}

export interface DaySlots extends TimeSlot {
  dayOfWeek: number;
}

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(value: string): boolean {
  return HH_MM.test(value);
}

export function isValidDayOfWeek(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < DAYS_IN_WEEK;
}

/**
 * Minutes since midnight. The comparable form of a wall-clock time.
 *
 * "HH:MM" strings already compare correctly as text — which is why the database
 * can filter on them directly — but arithmetic on them cannot, and overlap
 * detection is arithmetic.
 */
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/**
 * True when two slots share any minute.
 *
 * Touching ends do NOT overlap: 08:00-12:00 and 12:00-17:00 are a lunch break,
 * not a conflict, and rejecting them would make the most common two-slot day
 * impossible to enter.
 */
export function slotsOverlap(a: TimeSlot, b: TimeSlot): boolean {
  return (
    toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(b.startTime) < toMinutes(a.endTime)
  );
}

export interface SlotValidationIssue {
  index: number;
  message: string;
}

/**
 * Validates a whole week in one pass, collecting EVERY problem.
 *
 * Returning all issues rather than throwing on the first is what lets the form
 * mark three bad rows at once. Fixing one error only to be shown the next is the
 * single most tedious way to fill in a schedule, and this screen has up to
 * fourteen rows.
 */
export function validateWeeklySlots(slots: readonly DaySlots[]): SlotValidationIssue[] {
  const issues: SlotValidationIssue[] = [];

  slots.forEach((slot, index) => {
    if (!isValidDayOfWeek(slot.dayOfWeek)) {
      issues.push({ index, message: 'Choose a day of the week.' });
      return;
    }

    if (!isValidTime(slot.startTime) || !isValidTime(slot.endTime)) {
      issues.push({ index, message: 'Use 24-hour times, such as 08:00.' });
      return;
    }

    if (toMinutes(slot.startTime) >= toMinutes(slot.endTime)) {
      // A slot that ends before it starts is almost always an overnight shift
      // the worker expected to wrap past midnight. We reject it rather than
      // guessing, and the UI tells them to enter two slots — because silently
      // interpreting 22:00-06:00 as sixteen hours of availability would send
      // clients to their door at four in the afternoon.
      issues.push({ index, message: 'The end time must be after the start time.' });
      return;
    }

    const conflict = slots.findIndex(
      (other, otherIndex) =>
        otherIndex < index && other.dayOfWeek === slot.dayOfWeek && slotsOverlap(other, slot),
    );

    if (conflict !== -1) {
      issues.push({ index, message: 'This overlaps another slot on the same day.' });
    }
  });

  return issues;
}

export interface AvailabilityException {
  /** The overridden calendar day, as YYYY-MM-DD in the worker's local date. */
  date: string;
  isAvailable: boolean;
  startTime?: string | null;
  endTime?: string | null;
}

/**
 * Whether a worker is open at a given local day/time.
 *
 * An exception overrides the WHOLE day, in both directions: a public holiday
 * closes a normally-open Monday, and a specially-worked Sunday opens a normally
 * closed one. That asymmetry is why exceptions are their own model rather than a
 * flag on a slot — attaching one to a single slot would leave the other slots
 * that day still claiming to be open.
 */
export function isOpenAt(input: {
  slots: readonly DaySlots[];
  exceptions?: readonly AvailabilityException[];
  dayOfWeek: number;
  time: string;
  date?: string;
}): boolean {
  const exception = input.date
    ? input.exceptions?.find((candidate) => candidate.date === input.date)
    : undefined;

  if (exception) {
    if (!exception.isAvailable) {
      return false;
    }

    // An "open specially" exception with no hours means open all day — the
    // worker said yes without wanting to fill in a form.
    if (!exception.startTime || !exception.endTime) {
      return true;
    }

    return (
      toMinutes(input.time) >= toMinutes(exception.startTime) &&
      toMinutes(input.time) < toMinutes(exception.endTime)
    );
  }

  return input.slots.some(
    (slot) =>
      slot.dayOfWeek === input.dayOfWeek &&
      toMinutes(input.time) >= toMinutes(slot.startTime) &&
      toMinutes(input.time) < toMinutes(slot.endTime),
  );
}

/**
 * Collapses a week into per-day groups for the profile screen.
 *
 * Every day is present, including closed ones. "Closed Sunday" is information a
 * client needs; a day silently missing from the list reads as "unknown", and
 * they call to find out.
 */
export function groupByDay(slots: readonly DaySlots[]): { dayOfWeek: number; slots: TimeSlot[] }[] {
  return Array.from({ length: DAYS_IN_WEEK }, (_, dayOfWeek) => ({
    dayOfWeek,
    slots: slots
      .filter((slot) => slot.dayOfWeek === dayOfWeek)
      .map((slot) => ({ startTime: slot.startTime, endTime: slot.endTime }))
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime)),
  }));
}
