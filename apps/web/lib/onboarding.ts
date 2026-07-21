'use client';

/**
 * Client-side onboarding contract. Mirrors apps/api/src/onboarding/onboarding.steps.ts —
 * the step KEYS and their order must match, because the server decides the
 * completion percentage and the resume point from the same list.
 */

export type OnboardingRole = 'WORKER' | 'CLIENT' | 'BUSINESS';

export const ONBOARDING_STEPS: Record<OnboardingRole, string[]> = {
  WORKER: ['services', 'availability', 'portfolio', 'identity', 'location'],
  CLIENT: ['profile', 'location'],
  BUSINESS: ['company', 'documents', 'team'],
};

export interface OnboardingUnlock {
  key: string;
  threshold: number;
  unlocked: boolean;
}

export interface OnboardingState {
  role: string;
  currentStep: string;
  completionPercent: number;
  completedAt: string | null;
  completedSteps: string[];
  data: Record<string, unknown>;
  unlocks: OnboardingUnlock[];
}

export interface ServiceEntry {
  name: string;
  description?: string;
  startingPrice?: number;
}

export interface AvailabilitySlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface PortfolioEntry {
  mediaAssetId: string;
  caption?: string;
  type?: 'PHOTO' | 'VIDEO' | 'PROJECT';
  previewUrl?: string;
}

export interface TeamMemberEntry {
  name: string;
  email?: string;
  phone?: string;
  role?: 'ADMIN' | 'HR_MANAGER' | 'ACCOUNTANT' | 'STAFF';
  accessLevel?: 'FULL' | 'MANAGE_JOBS' | 'PAYMENTS' | 'VIEW_ONLY';
}

export interface LocationValue {
  city: string;
  area?: string;
  latitude?: number;
  longitude?: number;
  /** A human-placed pin always wins over a device fix (CLAUDE.md SPATIAL). */
  source: 'DEVICE_GPS' | 'HUMAN_INPUT' | 'REVERSE_GEOCODE';
}

/** Reads a step's slice out of the saved answers with a typed fallback. */
export function readStep<T>(data: Record<string, unknown>, key: string, fallback: T): T {
  const value = data[key];
  return value === undefined || value === null ? fallback : (value as T);
}
