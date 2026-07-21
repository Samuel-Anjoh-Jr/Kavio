import { auth } from '@/auth';
import { redirect } from '@/i18n/navigation';

/**
 * Post-login routing (ACC-01, ACC-07).
 *
 * Authenticated users go to their ROLE-BASED home; unauthenticated visitors get
 * the guest exploration surface. CLAUDE.md is explicit that a signed-in user is
 * never shown the guest view, so this split lives at the segment root rather
 * than being re-decided by each screen.
 */
export default async function AppIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();

  redirect({ href: session?.user?.id ? '/app/home' : '/app/explore', locale });
}
