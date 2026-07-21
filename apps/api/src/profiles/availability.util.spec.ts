import {
  groupByDay,
  isOpenAt,
  slotsOverlap,
  toMinutes,
  validateWeeklySlots,
  type DaySlots,
} from './availability.util';

const MONDAY = 1;
const SUNDAY = 0;

describe('toMinutes', () => {
  it('converts wall-clock times to comparable minutes', () => {
    expect(toMinutes('00:00')).toBe(0);
    expect(toMinutes('08:30')).toBe(510);
    expect(toMinutes('23:59')).toBe(1439);
  });
});

describe('slotsOverlap', () => {
  it('detects a genuine clash', () => {
    expect(
      slotsOverlap(
        { startTime: '08:00', endTime: '12:00' },
        { startTime: '11:00', endTime: '15:00' },
      ),
    ).toBe(true);
  });

  it('treats touching ends as a lunch break, not a conflict', () => {
    // 08:00-12:00 then 12:00-17:00 is the most common two-slot day there is.
    // Rejecting it would make an ordinary schedule impossible to enter.
    expect(
      slotsOverlap(
        { startTime: '08:00', endTime: '12:00' },
        { startTime: '12:00', endTime: '17:00' },
      ),
    ).toBe(false);
  });

  it('detects full containment', () => {
    expect(
      slotsOverlap(
        { startTime: '08:00', endTime: '18:00' },
        { startTime: '10:00', endTime: '11:00' },
      ),
    ).toBe(true);
  });
});

describe('validateWeeklySlots', () => {
  it('accepts a normal split day', () => {
    const slots: DaySlots[] = [
      { dayOfWeek: MONDAY, startTime: '08:00', endTime: '12:00' },
      { dayOfWeek: MONDAY, startTime: '13:00', endTime: '17:00' },
    ];

    expect(validateWeeklySlots(slots)).toEqual([]);
  });

  it('allows the same hours on different days', () => {
    const slots: DaySlots[] = [
      { dayOfWeek: MONDAY, startTime: '08:00', endTime: '17:00' },
      { dayOfWeek: 2, startTime: '08:00', endTime: '17:00' },
    ];

    expect(validateWeeklySlots(slots)).toEqual([]);
  });

  it('rejects an end time before the start rather than assuming an overnight shift', () => {
    // Interpreting 22:00-06:00 as wrapping past midnight would advertise
    // sixteen hours of availability and send clients round at 4pm.
    const issues = validateWeeklySlots([
      { dayOfWeek: MONDAY, startTime: '22:00', endTime: '06:00' },
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/after the start/i);
  });

  it('rejects a zero-length slot', () => {
    const issues = validateWeeklySlots([
      { dayOfWeek: MONDAY, startTime: '09:00', endTime: '09:00' },
    ]);

    expect(issues).toHaveLength(1);
  });

  it('flags an overlap against the LATER slot, so the form marks the row being added', () => {
    const issues = validateWeeklySlots([
      { dayOfWeek: MONDAY, startTime: '08:00', endTime: '12:00' },
      { dayOfWeek: MONDAY, startTime: '11:00', endTime: '15:00' },
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.index).toBe(1);
  });

  it('collects EVERY problem in one pass', () => {
    // Fixing one error only to be shown the next is the most tedious possible
    // way to fill in a fourteen-row schedule.
    const issues = validateWeeklySlots([
      { dayOfWeek: MONDAY, startTime: '25:00', endTime: '26:00' },
      { dayOfWeek: 9, startTime: '08:00', endTime: '09:00' },
      { dayOfWeek: MONDAY, startTime: '17:00', endTime: '08:00' },
    ]);

    expect(issues).toHaveLength(3);
    expect(issues.map((issue) => issue.index)).toEqual([0, 1, 2]);
  });

  it('rejects a malformed time', () => {
    expect(
      validateWeeklySlots([{ dayOfWeek: MONDAY, startTime: '8am', endTime: '5pm' }]),
    ).toHaveLength(1);
  });
});

describe('isOpenAt', () => {
  const slots: DaySlots[] = [{ dayOfWeek: MONDAY, startTime: '08:00', endTime: '17:00' }];

  it('is open inside the weekly rule', () => {
    expect(isOpenAt({ slots, dayOfWeek: MONDAY, time: '09:00' })).toBe(true);
  });

  it('is closed outside it', () => {
    expect(isOpenAt({ slots, dayOfWeek: MONDAY, time: '18:00' })).toBe(false);
    expect(isOpenAt({ slots, dayOfWeek: SUNDAY, time: '09:00' })).toBe(false);
  });

  it('treats the end time as exclusive', () => {
    // 17:00 on a 08:00-17:00 day is closing time, not a bookable minute.
    expect(isOpenAt({ slots, dayOfWeek: MONDAY, time: '17:00' })).toBe(false);
    expect(isOpenAt({ slots, dayOfWeek: MONDAY, time: '16:59' })).toBe(true);
  });

  it('lets a holiday close a normally-open day', () => {
    expect(
      isOpenAt({
        slots,
        exceptions: [{ date: '2026-05-20', isAvailable: false }],
        dayOfWeek: MONDAY,
        time: '09:00',
        date: '2026-05-20',
      }),
    ).toBe(false);
  });

  it('closes the WHOLE day, not just one slot', () => {
    const split: DaySlots[] = [
      { dayOfWeek: MONDAY, startTime: '08:00', endTime: '12:00' },
      { dayOfWeek: MONDAY, startTime: '13:00', endTime: '17:00' },
    ];

    expect(
      isOpenAt({
        slots: split,
        exceptions: [{ date: '2026-05-20', isAvailable: false }],
        dayOfWeek: MONDAY,
        time: '14:00',
        date: '2026-05-20',
      }),
    ).toBe(false);
  });

  it('lets an exception OPEN a normally-closed day', () => {
    expect(
      isOpenAt({
        slots,
        exceptions: [
          { date: '2026-05-24', isAvailable: true, startTime: '10:00', endTime: '14:00' },
        ],
        dayOfWeek: SUNDAY,
        time: '11:00',
        date: '2026-05-24',
      }),
    ).toBe(true);
  });

  it('treats an open exception with no hours as open all day', () => {
    expect(
      isOpenAt({
        slots,
        exceptions: [{ date: '2026-05-24', isAvailable: true }],
        dayOfWeek: SUNDAY,
        time: '23:00',
        date: '2026-05-24',
      }),
    ).toBe(true);
  });

  it('ignores an exception for a different date', () => {
    expect(
      isOpenAt({
        slots,
        exceptions: [{ date: '2026-05-20', isAvailable: false }],
        dayOfWeek: MONDAY,
        time: '09:00',
        date: '2026-05-27',
      }),
    ).toBe(true);
  });
});

describe('groupByDay', () => {
  it('returns all seven days, including closed ones', () => {
    // "Closed Sunday" is information a client needs. A day missing from the
    // list reads as "unknown" and they phone to find out.
    const grouped = groupByDay([{ dayOfWeek: MONDAY, startTime: '08:00', endTime: '17:00' }]);

    expect(grouped).toHaveLength(7);
    expect(grouped[SUNDAY]?.slots).toEqual([]);
    expect(grouped[MONDAY]?.slots).toHaveLength(1);
  });

  it('sorts a day’s slots chronologically regardless of insertion order', () => {
    const grouped = groupByDay([
      { dayOfWeek: MONDAY, startTime: '13:00', endTime: '17:00' },
      { dayOfWeek: MONDAY, startTime: '08:00', endTime: '12:00' },
    ]);

    expect(grouped[MONDAY]?.slots.map((slot) => slot.startTime)).toEqual(['08:00', '13:00']);
  });
});
