import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * A plain `<img>` for media we do not host.
 *
 * next/image is deliberately not used here. Every URL this renders — avatars,
 * covers, portfolio photos — comes from S3 (or an S3-compatible bucket) whose
 * hostname is configuration, not a constant: next/image would require each
 * deployment's bucket domain to be allowlisted in next.config, and an
 * unallowlisted host does not degrade, it throws. A marketplace where a worker's
 * portfolio can 500 the profile because ops changed buckets is a bad trade for
 * an optimisation we get most of anyway through `loading="lazy"` and fixed
 * aspect boxes at the call sites.
 *
 * Existing in one file means the lint exemption is granted once — in
 * eslint.config.mjs, scoped to this path — rather than re-argued as a disable
 * comment at a dozen call sites.
 */
export function RemoteImage({ alt, className, ...props }: ComponentProps<'img'> & { alt: string }) {
  return (
    <img
      alt={alt}
      // Lazy by default: a profile carries a cover, an avatar and a gallery, and
      // this audience is on metered mobile data.
      loading="lazy"
      decoding="async"
      className={cn('bg-muted', className)}
      {...props}
    />
  );
}
