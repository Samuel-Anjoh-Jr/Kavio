import { AppException } from '../../lib/app-exception';
import { ZodValidationPipe } from '../../lib/zod-validation.pipe';
import { signUpSchema } from './sign-up.dto';

describe('signUpSchema via ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(signUpSchema);

  it('accepts a valid payload and strips unknown keys', () => {
    const parsed = pipe.transform({ roleIntent: 'hire', phone: ' 655 555 555 ', extra: 'x' });
    expect(parsed).toEqual({ roleIntent: 'hire', phone: '655 555 555' });
  });

  it('rejects an unknown roleIntent with a field error', () => {
    try {
      pipe.transform({ roleIntent: 'browse', phone: '655555555' });
      fail('expected validation to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe('VALIDATION_ERROR');
      expect((error as AppException).fields).toHaveProperty('roleIntent');
    }
  });

  it('rejects a missing phone', () => {
    try {
      pipe.transform({ roleIntent: 'find_work' });
      fail('expected validation to throw');
    } catch (error) {
      expect((error as AppException).fields).toHaveProperty('phone');
    }
  });

  it('rejects a filled honeypot (bot signal)', () => {
    try {
      pipe.transform({ roleIntent: 'hire', phone: '655555555', website: 'http://spam' });
      fail('expected validation to throw');
    } catch (error) {
      expect((error as AppException).fields).toHaveProperty('website');
    }
  });
});
