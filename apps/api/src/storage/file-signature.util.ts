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

type Signature = {
  /** The type these bytes are, or the FIRST of several a container can hold. */
  mime: string;
  /**
   * Other types the same bytes legitimately allow. A WebM or MP4 container has
   * one magic number whether it holds audio or video, so the bytes alone cannot
   * decide — the declared type breaks the tie, but only among these.
   */
  alternates?: readonly string[];
  test: (buffer: Buffer) => boolean;
};

const SIGNATURES: Signature[] = [
  // JPEG: FF D8 FF
  {
    mime: 'image/jpeg',
    test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  {
    mime: 'image/png',
    test: (b) =>
      b.length > 8 &&
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  // WebP: "RIFF" .... "WEBP"
  {
    mime: 'image/webp',
    test: (b) =>
      b.length > 12 &&
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  // PDF: "%PDF-"
  {
    mime: 'application/pdf',
    test: (b) => b.length > 5 && b.subarray(0, 5).toString('ascii') === '%PDF-',
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Audio — voice notes (MSG-02). Phone browsers record in whichever of these
  // their MediaRecorder supports: Chrome/Android produce WebM (Opus), Safari/iOS
  // produce MP4/AAC. Without these signatures every voice note is rejected as an
  // unrecognised type, however correct its declared MIME.
  // ───────────────────────────────────────────────────────────────────────────

  // WebM / Matroska: EBML header 1A 45 DF A3. The container carries audio or
  // video with identical magic, so both are listed and the declaration decides.
  {
    mime: 'audio/webm',
    alternates: ['video/webm'],
    test: (b) => b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  },
  // Ogg: "OggS". Usually Opus/Vorbis audio; Theora video shares the container.
  {
    mime: 'audio/ogg',
    alternates: ['video/ogg'],
    test: (b) => b.length > 4 && b.subarray(0, 4).toString('ascii') === 'OggS',
  },
  // ISO-BMFF (MP4/M4A): a "ftyp" box at offset 4. Same container for both.
  // >= 12, not > 12: box size (4) + "ftyp" (4) + major brand (4) is exactly 12,
  // and a valid header that short must still be recognised.
  {
    mime: 'audio/mp4',
    alternates: ['video/mp4'],
    test: (b) => b.length >= 12 && b.subarray(4, 8).toString('ascii') === 'ftyp',
  },
  // MP3: either an ID3v2 tag ("ID3") or a raw frame sync (11 set bits).
  {
    mime: 'audio/mpeg',
    test: (b) =>
      (b.length > 3 && b.subarray(0, 3).toString('ascii') === 'ID3') ||
      (b.length > 2 && b[0] === 0xff && (b[1]! & 0xe0) === 0xe0),
  },
];

/** The detected MIME type, or null when the bytes match nothing we accept. */
export function detectMimeType(buffer: Buffer): string | null {
  return SIGNATURES.find((signature) => signature.test(buffer))?.mime ?? null;
}

/**
 * Every type these bytes could legitimately be, primary first.
 *
 * Exists because a container's magic number does not identify its contents: WebM,
 * Ogg and MP4 all look identical whether they hold audio or video. Returning the
 * candidate set lets the caller settle the ambiguity with the declared type while
 * still refusing anything the bytes rule out — so a renamed executable is caught
 * exactly as before, and a genuine voice note is no longer collateral damage.
 */
export function detectMimeTypes(buffer: Buffer): readonly string[] {
  const signature = SIGNATURES.find((candidate) => candidate.test(buffer));
  if (!signature) {
    return [];
  }
  return [signature.mime, ...(signature.alternates ?? [])];
}
