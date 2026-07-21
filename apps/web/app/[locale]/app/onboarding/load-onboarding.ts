import { auth } from '@/auth';
import { getClient } from '@/lib/apollo/rsc';
import { ONBOARDING_QUERY, type OnboardingQueryResult } from '@/lib/graphql/documents';
import { ONBOARDING_STEPS, type OnboardingRole, type OnboardingState } from '@/lib/onboarding';

/**
 * Server-side onboarding read (GraphQL, per the DUAL API RULE), so the flow
 * paints with the user's saved answers already in place rather than flashing an
 * empty form and filling it in after hydration.
 */
export async function loadOnboarding(role: OnboardingRole): Promise<OnboardingState | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  // Onboarding is per-role, and the API rejects a flow the caller does not hold
  // the role for — check here too so we render a useful message instead of an error.
  if (!session.user.roles?.includes(role)) return null;

  try {
    const client = await getClient();
    const { data } = await client.query<OnboardingQueryResult>({
      query: ONBOARDING_QUERY,
      variables: { role },
      // Onboarding state changes on every autosave; a cached read would show
      // the user stale progress on reload.
      fetchPolicy: 'no-cache',
    });

    // `data` is undefined when the query resolved with errors only; fall through
    // to the empty-state default rather than rendering a broken flow.
    if (data?.onboarding) {
      return data.onboarding as OnboardingState;
    }
    throw new Error('EMPTY_ONBOARDING_RESULT');
  } catch {
    // The API is unreachable or the row does not exist yet. Start the user at
    // step one rather than failing the whole screen.
    return {
      role,
      currentStep: ONBOARDING_STEPS[role][0] ?? '',
      completionPercent: 0,
      completedAt: null,
      completedSteps: [],
      data: {},
      unlocks: [],
    };
  }
}
