'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Crosshair, Loader2, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { RADIUS_STEPS_M, type BrowsingLocation } from '@/lib/geo';
import { cn } from '@/lib/utils';
import { useBrowsingLocation } from './location-provider';
import { PinPicker } from './pin-picker';
import { useGeolocation } from './use-geolocation';

/**
 * The Location Setter (DIS-09) — one control, two ways to answer "where are you?".
 *
 * A quick tap uses the device; the map lets the user drop or adjust a pin. The
 * rule the whole component is built around, from CLAUDE.md §SPATIAL: A HUMAN PIN
 * ALWAYS OVERRIDES AUTO-DETECTED LOCATION. When a device fix arrives over a pin
 * somebody placed, it is REFUSED and offered instead — because the user standing
 * in one place and working on a house in another is the normal case here, not
 * the edge case.
 *
 * Setting a location is not a gated action. A guest must be able to say where
 * they are before they will ever consider signing up (ACC-01).
 */

function summarise(location: BrowsingLocation | null, fallback: string): string {
  if (!location) return fallback;
  return location.landmark || location.label || fallback;
}

export function LocationSetter({
  className,
  variant = 'outline',
}: {
  className?: string;
  variant?: 'outline' | 'ghost' | 'primary';
}) {
  const t = useTranslations('Location');
  const {
    location,
    hydrated,
    saving,
    pinHeld,
    setFromDevice,
    setPin,
    setRadius,
    clear,
    dismissPinHeld,
  } = useBrowsingLocation();
  const geolocation = useGeolocation();
  const [open, setOpen] = useState(false);

  async function applyCurrentLocation(override = false) {
    const fix = await geolocation.locate();
    if (!fix) return;

    await setFromDevice(fix, override);
    // Kept open when a pin held: the user needs to see and answer the offer.
    if (!pinHeld || override) setOpen(false);
  }

  const label = summarise(location, t('setLocation'));

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          variant={variant}
          className={cn('max-w-full justify-start gap-2', className)}
          aria-label={location ? t('changeLocationLabel', { location: label }) : t('setLocation')}
        >
          <MapPin aria-hidden className="shrink-0" />
          {/* Truncated rather than wrapped: this control sits in a toolbar row,
              and a long landmark note must not reflow the whole header. */}
          <span className="truncate">{hydrated ? label : t('setLocation')}</span>
        </Button>
      </DrawerTrigger>

      <DrawerContent className="max-h-[92dvh]">
        <div className="mx-auto w-full max-w-lg overflow-y-auto px-4 pb-8">
          <DrawerHeader className="px-0">
            <DrawerTitle>{t('drawerTitle')}</DrawerTitle>
            <DrawerDescription>{t('drawerDescription')}</DrawerDescription>
          </DrawerHeader>

          {/* The human-pin rule, surfaced. This is an OFFER, not an error: the
              pin holding is the correct outcome, and only the user can decide
              that their device knows better than their own pin. */}
          {pinHeld && (
            <div
              role="status"
              className="mb-4 rounded-card border border-warning/30 bg-warning/10 p-4 text-sm"
            >
              <p className="font-medium text-foreground">{t('pinHeldHeading')}</p>
              <p className="mt-1 text-muted-foreground">{t('pinHeldBody')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void applyCurrentLocation(true)}>
                  {t('pinHeldReplace')}
                </Button>
                <Button size="sm" variant="ghost" onClick={dismissPinHeld}>
                  {t('pinHeldKeep')}
                </Button>
              </div>
            </div>
          )}

          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={geolocation.status === 'locating'}
            onClick={() => void applyCurrentLocation()}
          >
            {geolocation.status === 'locating' ? (
              <Loader2 aria-hidden className="animate-spin" />
            ) : (
              <Crosshair aria-hidden />
            )}
            {t('useCurrentLocation')}
          </Button>

          {/* Geolocation failures are stated in terms of what the user can do
              next, and every one of them has the pin below as a real answer. */}
          {geolocation.error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {t(`geolocationError.${geolocation.error}`)}
            </p>
          )}

          <div className="my-6 flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">{t('or')}</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <PinPicker
            initial={
              location ? { latitude: location.latitude, longitude: location.longitude } : null
            }
            busy={saving}
            confirmLabel={t('confirmPin')}
            onConfirm={async (pin) => {
              await setPin(pin);
              setOpen(false);
            }}
          />

          {location && (
            <>
              <fieldset className="mt-6">
                <legend className="text-sm font-medium text-foreground">
                  {t('radiusHeading')}
                </legend>
                <p className="mt-1 text-xs text-muted-foreground">{t('radiusHint')}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {RADIUS_STEPS_M.map((radius) => {
                    const active = location.radiusM === radius;
                    return (
                      <button
                        key={radius}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setRadius(radius)}
                        className={cn(
                          'rounded-button border px-3 py-2 font-numeric text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active
                            ? 'border-primary bg-primary/10 font-medium text-primary'
                            : 'border-input bg-surface text-surface-foreground hover:bg-muted',
                        )}
                      >
                        {t('distance.kilometres', { value: String(radius / 1000) })}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <DrawerClose asChild>
                <Button variant="ghost" className="mt-6 w-full" onClick={clear}>
                  <X aria-hidden />
                  {t('clearLocation')}
                </Button>
              </DrawerClose>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
