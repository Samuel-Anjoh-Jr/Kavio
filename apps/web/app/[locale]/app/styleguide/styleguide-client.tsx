'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  buttonPressIn,
  buttonPressOut,
  cardHoverIn,
  cardHoverOut,
  countUp,
  drawCheckmark,
  pageTransitionIn,
  useReducedMotion,
} from '@/lib/motion';
import { TierBadge } from '@/components/trust/tier-badge';
import { TrustScoreRing } from '@/components/trust/trust-score-ring';
import type { VerificationTier } from '@/lib/trust';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/use-toast';

const COLOR_TOKENS = [
  { name: 'primary', className: 'bg-primary text-primary-foreground' },
  { name: 'success', className: 'bg-success text-success-foreground' },
  { name: 'accent', className: 'bg-accent text-accent-foreground' },
  { name: 'warning', className: 'bg-warning text-warning-foreground' },
  { name: 'danger', className: 'bg-danger text-danger-foreground' },
] as const;

const NEUTRAL_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
const SPACING_STEPS = [
  { label: '8', className: 'w-2' },
  { label: '16', className: 'w-4' },
  { label: '24', className: 'w-6' },
  { label: '32', className: 'w-8' },
  { label: '40', className: 'w-10' },
  { label: '48', className: 'w-12' },
  { label: '64', className: 'w-16' },
] as const;
const RADII = [
  { name: 'button (14)', className: 'rounded-button' },
  { name: 'input (16)', className: 'rounded-input' },
  { name: 'card (20)', className: 'rounded-card' },
  { name: 'image (24)', className: 'rounded-image' },
] as const;
const SHADOWS = [
  { name: 'sm', className: 'shadow-sm' },
  { name: 'md', className: 'shadow-md' },
  { name: 'lg', className: 'shadow-lg' },
] as const;

/** Every tier plus the suspension override, side by side (TRU-01, TRU-03). */
const TRUST_PREVIEWS: { tier: VerificationTier; score: number; suspended?: boolean }[] = [
  { tier: 'TIER_0', score: 32 },
  { tier: 'TIER_1', score: 48 },
  { tier: 'TIER_2', score: 71 },
  { tier: 'TIER_3', score: 93 },
  { tier: 'TIER_3', score: 93, suspended: true },
];

/**
 * Living reference for the TMDS tokens, restyled shadcn primitives, and
 * motion presets (PROMPT 06 / 07 / 08 / 09). Not part of the marketing site
 * nav — a dev/QA surface to eyeball both themes and trigger every preset.
 */
export function StyleguideClient() {
  const t = useTranslations('Styleguide');
  const transitionBoxRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const checkPathRef = useRef<SVGPathElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-12 px-6 py-16">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold text-foreground">{t('title')}</h1>
          <p className="max-w-xl text-muted-foreground">{t('description')}</p>
        </div>
        <ThemeToggle />
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold text-foreground">{t('colorsHeading')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {COLOR_TOKENS.map((c) => (
            <div
              key={c.name}
              className={`flex h-20 flex-col items-center justify-center rounded-card text-sm font-medium shadow-sm ${c.className}`}
            >
              {c.name}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
          {NEUTRAL_STEPS.map((step) => (
            <div key={step} className="flex flex-col items-center gap-1">
              <div
                className="h-12 w-full rounded-input border border-border"
                style={{ background: `var(--color-neutral-${step})` }}
              />
              <span className="text-xs text-muted-foreground">{step}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold text-foreground">
          {t('typographyHeading')}
        </h2>
        <p className="font-heading text-2xl font-semibold text-foreground">
          {t('typographyHeadingSample')}
        </p>
        <p className="text-base text-foreground">{t('typographyBodySample')}</p>
        <p className="font-numeric text-xl text-foreground">
          {t('typographyNumericSample')} — 1 234 567 XAF
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold text-foreground">
          {t('spacingHeading')}
        </h2>
        <div className="flex items-end gap-2">
          {SPACING_STEPS.map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-1">
              <div className={`h-8 rounded-[4px] bg-primary ${s.className}`} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold text-foreground">{t('radiiHeading')}</h2>
        <div className="flex flex-wrap gap-4">
          {RADII.map((r) => (
            <div key={r.name} className="flex flex-col items-center gap-2">
              <div
                className={`h-16 w-16 border border-border bg-surface shadow-sm ${r.className}`}
              />
              <span className="text-xs text-muted-foreground">{r.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold text-foreground">
          {t('shadowsHeading')}
        </h2>
        <div className="flex flex-wrap gap-6">
          {SHADOWS.map((s) => (
            <div key={s.name} className="flex flex-col items-center gap-2">
              <div className={`h-16 w-16 rounded-card bg-surface ${s.className}`} />
              <span className="text-xs text-muted-foreground">{s.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold text-foreground">
          {t('buttonsHeading')}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="accent">Accent</Button>
          <Button variant="success">Success</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold text-foreground">{t('formHeading')}</h2>
        <div className="grid max-w-sm gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ds-email">{t('formEmailLabel')}</Label>
            <Input id="ds-email" type="email" placeholder={t('formEmailPlaceholder')} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ds-role">{t('formRoleLabel')}</Label>
            <Select>
              <SelectTrigger id="ds-role">
                <SelectValue placeholder={t('formRolePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="worker">{t('roleWorker')}</SelectItem>
                <SelectItem value="client">{t('roleClient')}</SelectItem>
                <SelectItem value="business">{t('roleBusiness')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold text-foreground">{t('cardsHeading')}</h2>
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>{t('cardTitle')}</CardTitle>
            <CardDescription>{t('cardDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
          <CardFooter>
            <Button size="sm">View</Button>
          </CardFooter>
        </Card>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold text-foreground">
          {t('skeletonHeading')}
        </h2>
        <div className="flex max-w-sm flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold text-foreground">{t('tabsHeading')}</h2>
        <Tabs defaultValue="overview" className="max-w-sm">
          <TabsList>
            <TabsTrigger value="overview">{t('tabOverview')}</TabsTrigger>
            <TabsTrigger value="reviews">{t('tabReviews')}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="pt-3 text-sm text-muted-foreground">
            {t('tabOverviewContent')}
          </TabsContent>
          <TabsContent value="reviews" className="pt-3 text-sm text-muted-foreground">
            {t('tabReviewsContent')}
          </TabsContent>
        </Tabs>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold text-foreground">{t('dialogHeading')}</h2>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">{t('dialogTrigger')}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('dialogTitle')}</DialogTitle>
              <DialogDescription>{t('dialogDescription')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">{t('dialogClose')}</Button>
              </DialogClose>
              <Button>{t('dialogConfirm')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold text-foreground">{t('drawerHeading')}</h2>
        <Drawer>
          <DrawerTrigger asChild>
            <Button variant="outline">{t('drawerTrigger')}</Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{t('drawerTitle')}</DrawerTitle>
              <DrawerDescription>{t('drawerDescription')}</DrawerDescription>
            </DrawerHeader>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button variant="outline">{t('drawerClose')}</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold text-foreground">
          {t('dropdownHeading')}
        </h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">{t('dropdownTrigger')}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>{t('dropdownProfile')}</DropdownMenuItem>
            <DropdownMenuItem>{t('dropdownSettings')}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-danger">{t('dropdownLogout')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold text-foreground">
          {t('tooltipHeading')}
        </h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline">{t('tooltipTrigger')}</Button>
          </TooltipTrigger>
          <TooltipContent>{t('tooltipContent')}</TooltipContent>
        </Tooltip>
      </section>

      <section className="flex flex-col gap-4 pb-16">
        <h2 className="font-heading text-xl font-semibold text-foreground">{t('toastHeading')}</h2>
        <Button
          variant="outline"
          onClick={() =>
            toast({
              variant: 'success',
              title: t('toastTitle'),
              description: t('toastDescription'),
            })
          }
        >
          {t('toastTrigger')}
        </Button>
      </section>

      <section className="flex flex-col gap-6 border-t border-border pt-12 pb-16">
        <h2 className="font-heading text-xl font-semibold text-foreground">{t('motionHeading')}</h2>
        {reduced && <p className="text-sm text-muted-foreground">{t('motionReducedNotice')}</p>}

        <div className="grid gap-8 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <span className="text-sm text-muted-foreground">{t('motionPageTransitionLabel')}</span>
            <div
              ref={transitionBoxRef}
              className="flex h-20 items-center justify-center rounded-card bg-primary text-primary-foreground shadow-md"
            >
              Kavio
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => transitionBoxRef.current && pageTransitionIn(transitionBoxRef.current)}
            >
              {t('motionPageTransitionTrigger')}
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-sm text-muted-foreground">{t('motionCardHoverLabel')}</span>
            <div
              ref={cardRef}
              tabIndex={0}
              onMouseEnter={() => cardRef.current && cardHoverIn(cardRef.current)}
              onMouseLeave={() => cardRef.current && cardHoverOut(cardRef.current)}
              onFocus={() => cardRef.current && cardHoverIn(cardRef.current)}
              onBlur={() => cardRef.current && cardHoverOut(cardRef.current)}
              className="flex h-20 items-center justify-center rounded-card border border-border bg-surface text-surface-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('motionCardHoverBox')}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-sm text-muted-foreground">{t('motionButtonMicroLabel')}</span>
            <Button
              variant="primary"
              onPointerDown={(e) => buttonPressIn(e.currentTarget)}
              onPointerUp={(e) => buttonPressOut(e.currentTarget)}
              onPointerLeave={(e) => buttonPressOut(e.currentTarget)}
            >
              {t('motionButtonMicroTrigger')}
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-sm text-muted-foreground">{t('motionCheckmarkLabel')}</span>
            <svg
              viewBox="0 0 48 48"
              className="h-16 w-16 rounded-card border border-border bg-surface p-2 text-success shadow-sm"
              aria-hidden="true"
            >
              <path
                ref={checkPathRef}
                d="M10 25 L20 35 L38 13"
                fill="none"
                stroke="currentColor"
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <Button
              variant="outline"
              size="sm"
              onClick={() => checkPathRef.current && drawCheckmark(checkPathRef.current)}
            >
              {t('motionCheckmarkTrigger')}
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-sm text-muted-foreground">{t('motionCountUpLabel')}</span>
            <span ref={countRef} className="font-numeric text-2xl font-semibold text-foreground">
              0
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                countRef.current &&
                countUp(countRef.current, {
                  from: 0,
                  to: 128500,
                  format: (v) => Math.round(v).toLocaleString(),
                })
              }
            >
              {t('motionCountUpTrigger')}
            </Button>
          </div>
        </div>
      </section>

      {/* TRU-01 / TRU-03. The Tier 0 column is the one to check on every visual
          change: it must stay grey, iconless and labelled "Basic Profile". */}
      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold text-foreground">{t('trustHeading')}</h2>
        <div className="flex flex-wrap gap-8">
          {TRUST_PREVIEWS.map(({ tier, score, suspended }) => (
            <div key={suspended ? 'suspended' : tier} className="flex flex-col items-center gap-3">
              <TrustScoreRing tier={tier} score={score} suspended={suspended} />
              <TierBadge tier={tier} suspended={suspended} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <TrustScoreRing tier="TIER_2" score={72} size="sm" showLabel={false} />
          <TrustScoreRing tier="TIER_3" score={91} size="lg" />
        </div>
      </section>
    </div>
  );
}
