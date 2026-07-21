import type { Locale } from '../notification.types';

/**
 * TMDS tokens, inlined. Email clients strip <style> blocks and have no CSS
 * variable support, so the design-system values are mirrored here as literals —
 * the one sanctioned exception to "tokens only" (SRS §20.1, §26.5).
 */
const TOKENS = {
  indigo: '#3D5AFE',
  success: '#14B86A',
  neutral50: '#FAFAFA',
  neutral100: '#F5F5F5',
  neutral200: '#E5E5E5',
  neutral500: '#737373',
  neutral700: '#404040',
  neutral900: '#171717',
  white: '#FFFFFF',
  radiusCard: '20px',
  radiusButton: '14px',
  fontBody: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
} as const;

/**
 * ESCAPING CONTRACT — everything here except `bodyHtml` is RAW text that the
 * layout escapes itself. Do not pre-escape those fields: escaping twice renders
 * the entities literally (a name like "N'Guessan" would arrive as
 * "N&#39;Guessan"). `bodyHtml` is the sole exception, since it carries markup —
 * escape interpolated values there with {@link escapeHtml} yourself.
 */
export interface EmailLayoutOptions {
  locale: Locale;
  /** Raw. Preheader text shown in the inbox preview line next to the subject. */
  preheader: string;
  /** Raw. */
  heading: string;
  /** HTML. Body paragraphs/blocks; interpolated values escaped by the caller. */
  bodyHtml: string;
  /** Raw label + url. */
  cta?: { label: string; url: string };
}

const FOOTER_COPY: Record<Locale, { tagline: string; why: string; preferences: string }> = {
  en: {
    tagline: 'TrustPro — verified local professionals in Cameroon.',
    why: 'You received this email because you have a TrustPro account.',
    preferences: 'Manage your notification preferences',
  },
  fr: {
    tagline: 'TrustPro — des professionnels locaux vérifiés au Cameroun.',
    why: 'Vous recevez cet e-mail parce que vous avez un compte TrustPro.',
    preferences: 'Gérer vos préférences de notification',
  },
};

/** Escapes untrusted values before they are interpolated into email HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The single branded email chrome (logo wordmark, card, CTA, footer) every
 * transactional email renders inside. Mobile-responsive via a fluid table —
 * never a plain-text-looking email (SRS §26.5).
 */
export function renderEmailLayout(options: EmailLayoutOptions): string {
  const { locale, preheader, heading, bodyHtml, cta } = options;
  const footer = FOOTER_COPY[locale];

  const ctaBlock = cta
    ? `
              <tr>
                <td style="padding: 8px 0 0 0;">
                  <a href="${escapeHtml(cta.url)}"
                     style="display: inline-block; background-color: ${TOKENS.indigo}; color: ${TOKENS.white};
                            font-family: ${TOKENS.fontBody}; font-size: 16px; font-weight: 600; line-height: 1;
                            padding: 16px 32px; border-radius: ${TOKENS.radiusButton}; text-decoration: none;">
                    ${escapeHtml(cta.label)}
                  </a>
                </td>
              </tr>`
    : '';

  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: ${TOKENS.neutral100}; font-family: ${TOKENS.fontBody};">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color: ${TOKENS.neutral100}; padding: 32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="max-width: 560px; background-color: ${TOKENS.white}; border-radius: ${TOKENS.radiusCard};
                        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08); overflow: hidden;">
            <tr>
              <td style="padding: 32px 32px 0 32px;">
                <span style="font-size: 20px; font-weight: 700; color: ${TOKENS.indigo}; letter-spacing: -0.02em;">
                  Trust<span style="color: ${TOKENS.neutral900};">Pro</span>
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px 32px 32px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding-bottom: 16px;">
                      <h1 style="margin: 0; font-size: 24px; font-weight: 700; line-height: 1.3;
                                 color: ${TOKENS.neutral900}; letter-spacing: -0.02em;">
                        ${escapeHtml(heading)}
                      </h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom: 24px; font-size: 16px; line-height: 1.6; color: ${TOKENS.neutral700};">
                      ${bodyHtml}
                    </td>
                  </tr>${ctaBlock}
                </table>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="max-width: 560px; padding: 24px 32px;">
            <tr>
              <td style="font-size: 13px; line-height: 1.6; color: ${TOKENS.neutral500}; text-align: center;">
                <p style="margin: 0 0 4px 0;">${escapeHtml(footer.tagline)}</p>
                <p style="margin: 0;">${escapeHtml(footer.why)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Wraps paragraphs in the body typography used inside the layout card. */
export function paragraphs(...lines: string[]): string {
  return lines
    .map((line) => `<p style="margin: 0 0 12px 0;">${line}</p>`)
    .join('\n                      ');
}

/** A large, monospaced code block for OTP-style codes. */
export function codeBlock(code: string): string {
  return `<div style="margin: 8px 0 16px 0; padding: 20px; background-color: ${TOKENS.neutral50};
              border: 1px solid ${TOKENS.neutral200}; border-radius: 16px; text-align: center;
              font-family: 'IBM Plex Sans', ${TOKENS.fontBody}; font-size: 32px; font-weight: 700;
              letter-spacing: 0.25em; color: ${TOKENS.neutral900};">${escapeHtml(code)}</div>`;
}

export { TOKENS as EMAIL_TOKENS };
