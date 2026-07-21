import { detectMimeType } from './file-signature.util';

/**
 * The declared MIME type comes from the client and is trivially forged, so
 * detection has to work off the bytes. These tests are the guarantee that a
 * mislabelled file cannot be stored under a type it is not.
 */
describe('detectMimeType', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const pdf = Buffer.from('%PDF-1.7\n%µ¶');
  const webp = Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP', 'ascii'),
    Buffer.from([0x00]),
  ]);

  it('recognises the formats TrustPro accepts', () => {
    expect(detectMimeType(jpeg)).toBe('image/jpeg');
    expect(detectMimeType(png)).toBe('image/png');
    expect(detectMimeType(pdf)).toBe('application/pdf');
    expect(detectMimeType(webp)).toBe('image/webp');
  });

  it('refuses anything it does not recognise rather than guessing', () => {
    expect(detectMimeType(Buffer.from('MZ\x90\x00', 'binary'))).toBeNull();
    expect(detectMimeType(Buffer.from('<?php echo 1; ?>'))).toBeNull();
    expect(detectMimeType(Buffer.from('GIF89a'))).toBeNull();
  });

  it('does not read past the end of a short buffer', () => {
    expect(detectMimeType(Buffer.alloc(0))).toBeNull();
    expect(detectMimeType(Buffer.from([0xff]))).toBeNull();
    expect(detectMimeType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(detectMimeType(Buffer.from('RIFF', 'ascii'))).toBeNull();
  });

  it('is not fooled by a RIFF container that is not WebP', () => {
    const wav = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from('WAVE', 'ascii'),
    ]);
    expect(detectMimeType(wav)).toBeNull();
  });
});
