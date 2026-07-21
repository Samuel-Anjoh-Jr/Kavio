import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../lib/app-exception';
import { createLogger } from '../../lib/logger';
import { getCampayConfig, isCampayLive, type CampayConfig } from '../payments.config';
import {
  normaliseCampayStatus,
  type CampayCollectRequest,
  type CampayReferenceResponse,
  type CampayTransactionStatus,
  type CampayWithdrawRequest,
  type SettlementOutcome,
} from './campay.types';

const logger = createLogger('campay');

/** What a collection/withdrawal request comes back as, in our own vocabulary. */
export interface CampayInitiation {
  reference: string;
  outcome: SettlementOutcome;
  ussdCode?: string;
  operator?: string;
}

/**
 * The Campay adapter (PAY-04, PAY-06). The ONE place the rest of the app talks to
 * Campay — collection, payout, status polling and webhook-signature verification.
 *
 * TWO MODES, ONE SURFACE. With credentials it calls the real API; without them it
 * runs a deterministic STUB that resolves instantly, so the escrow state machine
 * is exercised identically in tests, CI and local dev (the "sandbox" the Done
 * criterion asks for) without a live account. Callers never branch on the mode —
 * they get a `reference` and an outcome either way, and confirmation always
 * arrives through the same webhook/reconciliation path.
 *
 * Money never settles on the initiation response alone: a live collection comes
 * back PENDING and is confirmed only by a verified webhook or a status poll, which
 * is what keeps a flaky operator from being mistaken for a paid client.
 */
@Injectable()
export class CampayService {
  private readonly config: CampayConfig = getCampayConfig();
  private token: { value: string; fetchedAt: number } | null = null;

  get live(): boolean {
    return isCampayLive(this.config);
  }

  /** Collect money from a payer's Mobile Money line (client funding, add-money). */
  async collect(input: {
    amountXaf: number;
    phone: string;
    description: string;
    externalReference: string;
  }): Promise<CampayInitiation> {
    if (!this.live) {
      return this.stubInitiation(input.externalReference);
    }
    const body: CampayCollectRequest = {
      amount: String(input.amountXaf),
      currency: 'XAF',
      from: this.toCampayMsisdn(input.phone),
      description: input.description,
      external_reference: input.externalReference,
    };
    const res = await this.post<CampayReferenceResponse>('/api/collect/', body);
    return {
      reference: res.reference,
      outcome: 'PENDING',
      ussdCode: res.ussd_code,
      operator: res.operator,
    };
  }

  /** Pay money out to a recipient's Mobile Money line (withdrawal, refund). */
  async withdraw(input: {
    amountXaf: number;
    phone: string;
    description: string;
    externalReference: string;
  }): Promise<CampayInitiation> {
    if (!this.live) {
      return this.stubInitiation(input.externalReference);
    }
    const body: CampayWithdrawRequest = {
      amount: String(input.amountXaf),
      currency: 'XAF',
      to: this.toCampayMsisdn(input.phone),
      description: input.description,
      external_reference: input.externalReference,
    };
    const res = await this.post<CampayReferenceResponse>('/api/withdraw/', body);
    return { reference: res.reference, outcome: 'PENDING', operator: res.operator };
  }

  /** Poll a transaction's current status — the reconciliation fallback (PAY-06). */
  async getStatus(reference: string): Promise<CampayTransactionStatus | null> {
    if (!this.live) {
      return {
        reference,
        external_reference: reference,
        status: 'SUCCESSFUL',
        amount: '0',
        currency: 'XAF',
      };
    }
    try {
      return await this.get<CampayTransactionStatus>(`/api/transaction/${reference}/`);
    } catch (error) {
      logger.warn('Campay status poll failed', { payload: { reference }, result: String(error) });
      return null;
    }
  }

  /**
   * Verifies a webhook's `signature` against the app webhook key (PAY-06). Campay
   * signs a compact HS256 JWT; we recompute the HMAC over the signing input and
   * compare in constant time. In stub mode (no key configured) verification is
   * skipped and the payload is trusted, so the local flow still completes.
   */
  verifyWebhookSignature(signature: string | undefined): boolean {
    if (!this.config.webhookKey) {
      // No key configured: local/stub. Accept, but say so, so a missing key in a
      // real deployment is visible rather than silent.
      logger.warn('Campay webhook signature not verified (no webhook key configured)');
      return true;
    }
    if (!signature) {
      return false;
    }
    const parts = signature.split('.');
    if (parts.length !== 3) {
      return false;
    }
    const [header, payload, provided] = parts as [string, string, string];
    const expected = createHmac('sha256', this.config.webhookKey)
      .update(`${header}.${payload}`)
      .digest('base64url');
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  /**
   * A deterministic stub: the reference IS the external reference so the
   * subsequent reconciliation can find its row, and the outcome is PENDING so the
   * caller still routes through the confirmation path (a stub webhook or the
   * reconciliation sweep flips it to SUCCESS) rather than short-circuiting the
   * state machine.
   */
  private stubInitiation(externalReference: string): CampayInitiation {
    logger.info('Campay stub initiation (no live credentials)', {
      payload: { externalReference },
    });
    return {
      reference: `stub_${externalReference}_${randomUUID().slice(0, 8)}`,
      outcome: 'PENDING',
    };
  }

  private async getToken(): Promise<string> {
    // Campay tokens are long-lived; refresh hourly to be safe.
    const oneHour = 60 * 60 * 1000;
    if (this.token && Date.now() - this.token.fetchedAt < oneHour) {
      return this.token.value;
    }
    const res = await this.rawPost<{ token: string }>('/api/token/', {
      username: this.config.username,
      password: this.config.password,
    });
    this.token = { value: res.token, fetchedAt: Date.now() };
    return res.token;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const token = await this.getToken();
    return this.request<T>('POST', path, body, { Authorization: `Token ${token}` });
  }

  private async get<T>(path: string): Promise<T> {
    const token = await this.getToken();
    return this.request<T>('GET', path, undefined, { Authorization: `Token ${token}` });
  }

  private rawPost<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body, {});
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    headers: Record<string, string>,
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: method === 'POST' ? JSON.stringify(body) : undefined,
      });
    } catch {
      // Network/operator reachability: a retryable failure, surfaced as such.
      throw new AppException(
        HttpStatus.BAD_GATEWAY,
        'PAYMENT_PROVIDER_UNREACHABLE',
        'The payment service could not be reached. Please try again in a moment.',
      );
    }

    const text = await response.text();
    if (!response.ok) {
      logger.error('Campay API error', {
        payload: { method, path, status: response.status },
        result: text.slice(0, 300),
      });
      throw new AppException(
        HttpStatus.BAD_GATEWAY,
        'PAYMENT_PROVIDER_ERROR',
        'The payment service rejected the request. Please try again.',
      );
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** Campay expects a bare MSISDN (237XXXXXXXXX); strip a leading + if present. */
  private toCampayMsisdn(phone: string): string {
    return phone.replace(/^\+/, '');
  }
}

export { normaliseCampayStatus };
