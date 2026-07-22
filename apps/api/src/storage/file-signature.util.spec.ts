import { detectMimeType, detectMimeTypes } from './file-signature.util';

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

  /**
   * Voice notes (MSG-02). Phone browsers record in whichever format their
   * MediaRecorder supports — WebM/Opus on Chrome and Android, MP4/AAC on
   * Safari/iOS — so all of these have to be recognised or every voice note is
   * rejected as an unknown type however correctly it was declared.
   */
  describe('audio', () => {
    const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00]);
    const ogg = Buffer.concat([Buffer.from('OggS', 'ascii'), Buffer.from([0x00, 0x02])]);
    const mp4 = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x20]),
      Buffer.from('ftypM4A ', 'ascii'),
    ]);
    const mp3Id3 = Buffer.concat([Buffer.from('ID3', 'ascii'), Buffer.from([0x03, 0x00])]);
    const mp3Sync = Buffer.from([0xff, 0xfb, 0x90, 0x00]);

    it('recognises the formats phone browsers record in', () => {
      expect(detectMimeType(webm)).toBe('audio/webm');
      expect(detectMimeType(ogg)).toBe('audio/ogg');
      expect(detectMimeType(mp4)).toBe('audio/mp4');
      expect(detectMimeType(mp3Id3)).toBe('audio/mpeg');
      expect(detectMimeType(mp3Sync)).toBe('audio/mpeg');
    });

    it('offers both readings of a container that holds audio OR video', () => {
      // The magic number cannot tell them apart, so the caller settles it with
      // the declared type — within this set and no further.
      expect(detectMimeTypes(webm)).toEqual(['audio/webm', 'video/webm']);
      expect(detectMimeTypes(ogg)).toEqual(['audio/ogg', 'video/ogg']);
      expect(detectMimeTypes(mp4)).toEqual(['audio/mp4', 'video/mp4']);
    });

    it('offers exactly one reading where the bytes are unambiguous', () => {
      expect(detectMimeTypes(mp3Id3)).toEqual(['audio/mpeg']);
      expect(detectMimeTypes(jpeg)).toEqual(['image/jpeg']);
    });

    it('still returns nothing for bytes it does not recognise', () => {
      expect(detectMimeTypes(Buffer.from('MZ\x90\x00', 'binary'))).toEqual([]);
      // A near-miss on the MP3 frame sync must not pass.
      expect(detectMimeType(Buffer.from([0xff, 0x0b, 0x90, 0x00]))).toBeNull();
    });
  });
});
