import { parseApiError } from './api-error';

/**
 * REST calls against the auth module (DUAL API RULE: every write is REST; reads
 * go through GraphQL). Used by the Auth.js callbacks, which run server-side, so
 * this talks to the API directly rather than through the browser.
 */

export function getApiBaseUrl(): string {
  return (
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:4000'
  ).replace(/\/$/, '');
}

/** The token pair the API returns on login, OTP verification and refresh. */
export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  tokenType: 'Bearer';
}

/** Login stops here when the account has a second factor turned on. */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  destination: string;
  expiresAt: string;
  resendAvailableAt: string;
}

export type LoginResponse = ({ twoFactorRequired: false } & SessionTokens) | TwoFactorChallenge;

/** The identity claims carried by the access token, as the API reports them. */
export interface ApiSessionUser {
  id: string;
  activeRole: string;
  roles: string[];
  tier: string;
  status: string;
  sessionId: string;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // Auth responses must never be cached — they are per-request secrets.
    cache: 'no-store',
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return (await response.json()) as T;
}

export function apiLogin(identifier: string, password: string): Promise<LoginResponse> {
  return postJson<LoginResponse>('/auth/login', { identifier, password });
}

export function apiVerifyOtp(
  identifier: string,
  code: string,
  purpose: 'PHONE_VERIFICATION' | 'LOGIN',
): Promise<SessionTokens> {
  return postJson<SessionTokens>('/auth/otp/verify', { identifier, code, purpose });
}

export function apiVerifyTwoFactor(identifier: string, code: string): Promise<SessionTokens> {
  return postJson<SessionTokens>('/auth/2fa/verify', { identifier, code });
}

export function apiRefresh(refreshToken: string): Promise<SessionTokens> {
  return postJson<SessionTokens>('/auth/refresh', { refreshToken });
}

export function apiLogout(refreshToken: string): Promise<Response> {
  return fetch(`${getApiBaseUrl()}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });
}

/** Reads the identity behind an access token (used right after signing in). */
export async function apiSessionUser(accessToken: string): Promise<ApiSessionUser> {
  const response = await fetch(`${getApiBaseUrl()}/auth/session`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return (await response.json()) as ApiSessionUser;
}
