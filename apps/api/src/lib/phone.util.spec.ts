import { normalizeToE164 } from './phone.util';

describe('normalizeToE164 (CM)', () => {
  const canonical = '+2376XXXXXXXX'.replace(/X/g, '5'); // +237655555555

  it.each([
    ['655555555', canonical],
    ['6 55 55 55 55', canonical],
    ['6-55-55-55-55', canonical],
    ['(655) 555-555', canonical],
    ['237655555555', canonical],
    ['+237655555555', canonical],
    ['+237 6 55 55 55 55', canonical],
    ['00237655555555', canonical],
    ['00237 655 555 555', canonical],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalizeToE164(input)).toBe(expected);
  });

  it('accepts fixed-line numbers starting with 2', () => {
    expect(normalizeToE164('233425555')).toBe('+237233425555');
  });

  it.each([
    ['', 'empty'],
    ['   ', 'whitespace only'],
    ['12345', 'too short'],
    ['655555', 'incomplete NSN'],
    ['6555555555', 'too long (10 digits)'],
    ['155555555', 'invalid leading digit'],
    ['+1 202 555 0100', 'wrong country'],
    ['abcdefghi', 'non-numeric'],
  ])('rejects %s (%s)', (input) => {
    expect(normalizeToE164(input)).toBeNull();
  });

  it('rejects non-string input defensively', () => {
    expect(normalizeToE164(undefined as unknown as string)).toBeNull();
  });
});
