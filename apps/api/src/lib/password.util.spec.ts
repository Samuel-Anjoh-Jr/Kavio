import { hashPassword, verifyPassword } from './password.util';

describe('password hashing', () => {
  // scrypt at N=2^15 is intentionally slow; these need more than the 5s default.
  jest.setTimeout(30_000);

  it('never stores the plaintext and salts every hash independently', async () => {
    const password = 'un mot de passe solide';

    const a = await hashPassword(password);
    const b = await hashPassword(password);

    expect(a).not.toContain(password);
    // Same password, different salt ⇒ different digest. Without this, identical
    // passwords would be visibly identical in a database dump.
    expect(a).not.toEqual(b);
    expect(a.startsWith('scrypt$')).toBe(true);
  });

  it('accepts the correct password and rejects a wrong one', async () => {
    const stored = await hashPassword('correct horse battery staple');

    await expect(verifyPassword('correct horse battery staple', stored)).resolves.toBe(true);
    await expect(verifyPassword('correct horse battery stapl', stored)).resolves.toBe(false);
    await expect(verifyPassword('', stored)).resolves.toBe(false);
  });

  it('encodes its cost parameters so they can be raised later', async () => {
    const [scheme, n, r, p] = (await hashPassword('x')).split('$');

    expect(scheme).toBe('scrypt');
    expect(Number(n)).toBeGreaterThanOrEqual(32768);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
  });

  it('returns false rather than throwing on a malformed stored hash', async () => {
    // A corrupt or legacy row must read as "wrong password", not as a 500 that
    // tells an attacker which accounts are broken.
    for (const bad of ['', 'not-a-hash', 'scrypt$1$2$3', 'bcrypt$a$b$c$d$e']) {
      await expect(verifyPassword('anything', bad)).resolves.toBe(false);
    }
  });

  it('normalises unicode so the same typed password always matches', async () => {
    // "é" composed vs decomposed: visually identical, different bytes. A user
    // switching keyboards must not be locked out.
    const composed = 'caf\u00e9-password';
    const decomposed = 'cafe\u0301-password';

    // Written as escapes so the distinction survives editors and formatters.
    expect(composed).not.toEqual(decomposed);

    const stored = await hashPassword(composed);
    await expect(verifyPassword(decomposed, stored)).resolves.toBe(true);
  });
});
