const TWILIO_TIMEOUT_MS = 10_000;

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
}

export interface TwilioMessage {
  to: string;
  from: string;
  body: string;
}

/**
 * One Twilio Messages REST call, shared by the SMS and WhatsApp providers —
 * the API is identical for both, the only difference is whether `to`/`from`
 * carry a `whatsapp:` prefix (see `toWhatsappAddress` below). Plain `fetch`
 * with a timeout, same convention as EmailProvider's Resend call, so no SDK
 * dependency is needed for either channel.
 */
export async function sendTwilioMessage(
  credentials: TwilioCredentials,
  message: TwilioMessage,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TWILIO_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: message.to,
          From: message.from,
          Body: message.body,
        }).toString(),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      // Read Twilio's reason so the NotificationLog row is actionable, but
      // never echo the rendered body back into the logs.
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Twilio responded ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Twilio request timed out after ${TWILIO_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/** Twilio addresses WhatsApp numbers with a `whatsapp:` prefix on both sides. */
export function toWhatsappAddress(e164: string): string {
  return e164.startsWith('whatsapp:') ? e164 : `whatsapp:${e164}`;
}
