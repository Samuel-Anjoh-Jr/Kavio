'use client';

import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EscrowTimelines } from './escrow-timeline';
import { PaymentMethods } from './payment-methods';
import { TransactionHistory } from './transaction-history';
import { WalletBalanceCard } from './wallet-balance-card';

/**
 * The wallet surface (PAY-02, PAY-05): balance, the escrow timelines, the
 * payment-method manager and the transaction history in one place.
 *
 * Personal to the signed-in caller — a guest is bounced to sign-in. Escrow leads
 * because it is the trust story the whole product rests on: a user should be able
 * to open this screen and SEE their money held safely, step by step.
 */
export function WalletScreen() {
  const t = useTranslations('Transactions');
  const { data, status } = useSession();

  if (status === 'unauthenticated') {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">{t('signInPrompt')}</p>
          <Button asChild>
            <Link href="/auth/login?next=/app/wallet">{t('signIn')}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Add money has nothing to spend itself on: funding a booking's escrow is
  // always its own fresh Campay charge (bookings/:id/pay never reads or
  // debits this balance), so a top-up would only ever come back out again via
  // Withdraw. A Worker's balance is real money already earned (a payout),
  // which is worth letting them move around; a Client/Business balance only
  // ever gets credited by a refund, never spent — so only Withdraw applies.
  const canAddMoney = data?.user?.activeRole === 'WORKER';

  return (
    <div className="flex flex-col gap-6">
      <WalletBalanceCard canAddMoney={canAddMoney} />

      <Tabs defaultValue="escrow">
        <TabsList className="w-full">
          <TabsTrigger value="escrow">{t('tabEscrow')}</TabsTrigger>
          <TabsTrigger value="transactions">{t('tabTransactions')}</TabsTrigger>
          <TabsTrigger value="methods">{t('tabMethods')}</TabsTrigger>
        </TabsList>

        <TabsContent value="escrow" className="mt-6">
          <EscrowTimelines />
        </TabsContent>
        <TabsContent value="transactions" className="mt-6">
          <TransactionHistory />
        </TabsContent>
        <TabsContent value="methods" className="mt-6">
          <PaymentMethods />
        </TabsContent>
      </Tabs>
    </div>
  );
}
