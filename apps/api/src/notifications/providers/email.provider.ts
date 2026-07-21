import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '@trustpro/database';
import {
  getEmailFromAddress,
  getEmailProviderName,
  type EmailProviderName,
} from '../notification.config';
import type {
  NotificationChannelProvider,
  RecipientContext,
  RenderedMessage,
} from '../notification.types';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const RESEND_TIMEOUT_MS = 10_000;

/**
 * The EMAIL channel — active at launch and the mandatory fallback for
 * security-critical notices (SRS §17).
 *
 * Two backends sit behind one channel:
 *  - "console": prints a branded preview to the terminal. This is the dev/console
 *    provider used for local OTP, so no third-party account is needed to develop.
 *  - "resend": real delivery over the Resend REST API (fetch, with a timeout —
 *    SRS §18.1 requires provider timeouts to be configured).
 *
 * Which one is used is config, not code: NOTIFICATIONS_EMAIL_PROVIDER, defaulting
 * to console unless RESEND_API_KEY is present. The provider name is written to
 * NotificationLog.provider so the delivery dashboard can tell them apart.
 */
@Injectable()
export class EmailProvider implements NotificationChannelProvider {
  readonly channel = NotificationChannel.EMAIL;

  private readonly backend: EmailProviderName;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {
    this.backend = getEmailProviderName(env);
  }

  get providerName(): string {
    return this.backend;
  }

  isEnabled(): boolean {
    // The console backend always works; Resend needs its key.
    return this.backend === 'console' || Boolean(this.env.RESEND_API_KEY);
  }

  resolveRecipient(recipient: RecipientContext): string | null {
    return recipient.email;
  }

  async send(address: string, message: RenderedMessage): Promise<void> {
    if (message.channel !== 'EMAIL') {
      throw new Error(`EmailProvider received a ${message.channel} message`);
    }

    if (this.backend === 'console') {
      this.sendToConsole(address, message.content.subject, message.content.text);
      return;
    }

    await this.sendViaResend(address, message.content);
  }

  /** Dev/console delivery: the operator reads the code straight from the terminal. */
  private sendToConsole(address: string, subject: string, text: string): void {
    // Console output is a local dev affordance, so the body (which may contain an
    // OTP) is intentionally visible here — this backend never runs in production.
    const divider = '─'.repeat(72);

    console.log(
      [
        `\n${divider}`,
        `📧 EMAIL (console provider)`,
        `To:      ${address}`,
        `Subject: ${subject}`,
        divider,
        text,
        `${divider}\n`,
      ].join('\n'),
    );
  }

  private async sendViaResend(
    address: string,
    content: { subject: string; html: string; text: string },
  ): Promise<void> {
    const apiKey = this.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not set');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);

    try {
      const response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: getEmailFromAddress(this.env),
          to: [address],
          subject: content.subject,
          html: content.html,
          text: content.text,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Read the provider's reason so the NotificationLog row is actionable,
        // but never echo the rendered body back into the logs.
        const detail = await response.text().catch(() => '');
        throw new Error(
          `Resend responded ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Resend request timed out after ${RESEND_TIMEOUT_MS}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
