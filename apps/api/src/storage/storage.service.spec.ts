import { MediaVisibility } from '@kavio/database';
import { StorageService } from './storage.service';

/**
 * `urlFor` must treat an s3Key that is already a fully-qualified URL as
 * resolved and hand it back untouched, regardless of which driver is active.
 *
 * That is the documented seed convention (packages/database/prisma/seed.mjs:
 * "if s3Key starts with http, redirect/serve as-is") for every demo avatar,
 * cover photo, job photo and business logo — and it is also what a real
 * Vercel Blob upload now persists (see `store()`'s vercel-blob case). Without
 * this passthrough, every one of those reads fell through into a driver call
 * that does not know what to do with an external URL, throwing "Vercel Blob:
 * Url is malformed" for every worker profile, job listing and photo on the
 * whole platform.
 */
describe('StorageService.urlFor', () => {
  it('returns an http(s) s3Key untouched instead of routing it through a driver', async () => {
    const storage = new StorageService();

    const httpUrl = 'http://i.pravatar.cc/300?u=demo-worker';
    const httpsUrl = 'https://picsum.photos/seed/demo-job/640/480';

    await expect(storage.urlFor(httpUrl, MediaVisibility.PUBLIC)).resolves.toBe(httpUrl);
    await expect(storage.urlFor(httpsUrl, MediaVisibility.PRIVATE)).resolves.toBe(httpsUrl);
  });
});
