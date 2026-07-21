/**
 * Content-based file type detection.
 *
 * A browser-supplied `mimetype` is just a claim — it comes from the client and
 * is trivially forged, so trusting it would let an executable be stored as an
 * "image/jpeg" and served back to someone else. These checks read the actual
 * leading bytes, and an upload is rejected when the two disagree.
 *
 * Deliberately narrow: only the formats TrustPro accepts are recognised, and
 * anything unrecognised is refused rather than waved through.
 */

type Signature = { mime: string; test: (buffer: Buffer) => boolean };

const SIGNATURES: Signature[] = [
  // JPEG: FF D8 FF
  { mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  {
    mime: 'image/png',
    test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  // WebP: "RIFF" .... "WEBP"
  {
    mime: 'image/webp',
    test: (b) =>
      b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  // PDF: "%PDF-"
  { mime: 'application/pdf', test: (b) => b.length > 5 && b.subarray(0, 5).toString('ascii') === '%PDF-' },
];

/** The detected MIME type, or null when the bytes match nothing we accept. */
export function detectMimeType(buffer: Buffer): string | null {
  return SIGNATURES.find((signature) => signature.test(buffer))?.mime ?? null;
}
