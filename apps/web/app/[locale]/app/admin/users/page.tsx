import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgentInvitations } from '@/components/admin/agent-invitations';
import { UserDirectory } from '@/components/admin/user-directory';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin' });
  return { title: t('usersTitle'), robots: { index: false } };
}

/**
 * Accounts and agents (ADM-02, ADM-06).
 *
 * Two tabs rather than two pages because they answer one question — "who is on
 * this platform" — from two directions: everyone who is here, and the agents an
 * admin is bringing in.
 *
 * Admin-gated by the console layout; authorisation is the API's
 * `admin:user_manage` guard on each query and write.
 */
export default async function AdminUsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Admin');

  return (
    <div>
      <h2 className="font-heading text-xl font-semibold text-foreground">{t('usersTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('usersSubtitle')}</p>

      <Tabs defaultValue="accounts" className="mt-6">
        <TabsList>
          <TabsTrigger value="accounts">{t('tab.accounts')}</TabsTrigger>
          <TabsTrigger value="agents">{t('tab.agents')}</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-6">
          <UserDirectory />
        </TabsContent>

        <TabsContent value="agents" className="mt-6">
          <AgentInvitations />
        </TabsContent>
      </Tabs>
    </div>
  );
}
