import { NotificationCategory, NotificationChannel } from '@trustpro/database';
import type {
  EmailContent,
  Locale,
  RenderedMessage,
  SmsContent,
  WebPushContent,
} from '../notification.types';
import { codeBlock, escapeHtml, paragraphs, renderEmailLayout } from './email-layout';

/**
 * The central localized template store (SRS §17, §26.1).
 *
 * Every piece of user-facing notification copy lives here, keyed by templateKey
 * with EN/FR variants per channel. Dispatch sites pass a key + typed variables
 * and NEVER a string — that is what keeps EN/FR parity enforceable and lets the
 * NotificationLog store the key instead of rendered content.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Template keys and their variables (compile-time contract for dispatch sites)
// ─────────────────────────────────────────────────────────────────────────────

export interface TemplateVariablesMap {
  /** Smoke-test template used by the dev dispatch endpoint. */
  'system.test_notification': { message: string };
  'account.welcome': { name: string };
  'auth.otp_code': { code: string; expiresInMinutes: number };
  'auth.password_reset': { resetUrl: string; expiresInMinutes: number };
  'auth.new_device_login': { deviceName: string; occurredAt: string; secureAccountUrl: string };
  'auth.password_changed': { occurredAt: string };
  'auth.two_factor_changed': { enabled: boolean };
}

export type TemplateKey = keyof TemplateVariablesMap;

export type TemplateVariables<K extends TemplateKey> = TemplateVariablesMap[K];

type Renderers<K extends TemplateKey> = {
  readonly [NotificationChannel.EMAIL]?: Record<Locale, (v: TemplateVariables<K>) => EmailContent>;
  readonly [NotificationChannel.WEB_PUSH]?: Record<
    Locale,
    (v: TemplateVariables<K>) => WebPushContent
  >;
  readonly [NotificationChannel.SMS]?: Record<Locale, (v: TemplateVariables<K>) => SmsContent>;
};

export interface TemplateDefinition<K extends TemplateKey = TemplateKey> {
  readonly key: K;
  /** Drives the per-user preference lookup (channel × category). */
  readonly category: NotificationCategory;
  /**
   * Security-critical notices (password reset, new-device login, OTP) bypass
   * preferences entirely and always deliver by email — a user must never be able
   * to mute the message that protects their account (SRS §17).
   */
  readonly securityCritical?: boolean;
  readonly render: Renderers<K>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────────────

const testNotification: TemplateDefinition<'system.test_notification'> = {
  key: 'system.test_notification',
  category: NotificationCategory.ACCOUNT,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'TrustPro test notification',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'A test notification from TrustPro.',
          heading: 'Test notification',
          bodyHtml: paragraphs(
            'This is a test notification from the TrustPro dispatcher.',
            escapeHtml(v.message),
          ),
        }),
        text: `Test notification\n\nThis is a test notification from the TrustPro dispatcher.\n\n${v.message}`,
      }),
      fr: (v) => ({
        subject: 'Notification de test TrustPro',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Une notification de test de TrustPro.',
          heading: 'Notification de test',
          bodyHtml: paragraphs(
            'Ceci est une notification de test du répartiteur TrustPro.',
            escapeHtml(v.message),
          ),
        }),
        text: `Notification de test\n\nCeci est une notification de test du répartiteur TrustPro.\n\n${v.message}`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'TrustPro test', body: v.message }),
      fr: (v) => ({ title: 'Test TrustPro', body: v.message }),
    },
    [NotificationChannel.SMS]: {
      en: (v) => ({ text: `TrustPro test: ${v.message}` }),
      fr: (v) => ({ text: `Test TrustPro : ${v.message}` }),
    },
  },
};

const accountWelcome: TemplateDefinition<'account.welcome'> = {
  key: 'account.welcome',
  category: NotificationCategory.ACCOUNT,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'Welcome to TrustPro',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Your TrustPro account is ready.',
          heading: `Welcome, ${v.name}`,
          bodyHtml: paragraphs(
            'Your TrustPro account is ready. Verify your details to build your Trust Score and unlock more of the platform.',
            'Every step you complete raises your Trust Score and makes you more visible to clients near you.',
          ),
        }),
        text: `Welcome, ${v.name}\n\nYour TrustPro account is ready. Verify your details to build your Trust Score and unlock more of the platform.`,
      }),
      fr: (v) => ({
        subject: 'Bienvenue sur TrustPro',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Votre compte TrustPro est prêt.',
          heading: `Bienvenue, ${v.name}`,
          bodyHtml: paragraphs(
            'Votre compte TrustPro est prêt. Vérifiez vos informations pour développer votre Score de Confiance et débloquer davantage de fonctionnalités.',
            'Chaque étape complétée augmente votre Score de Confiance et vous rend plus visible auprès des clients près de chez vous.',
          ),
        }),
        text: `Bienvenue, ${v.name}\n\nVotre compte TrustPro est prêt. Vérifiez vos informations pour développer votre Score de Confiance.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'Welcome to TrustPro', body: `You're all set, ${v.name}.` }),
      fr: (v) => ({ title: 'Bienvenue sur TrustPro', body: `Tout est prêt, ${v.name}.` }),
    },
  },
};

const authOtpCode: TemplateDefinition<'auth.otp_code'> = {
  key: 'auth.otp_code',
  category: NotificationCategory.SECURITY,
  securityCritical: true,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: `${v.code} is your TrustPro verification code`,
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Your TrustPro verification code.',
          heading: 'Your verification code',
          bodyHtml:
            paragraphs('Enter this code to verify your TrustPro account:') +
            codeBlock(v.code) +
            paragraphs(
              `This code expires in ${v.expiresInMinutes} minutes.`,
              'If you did not request it, you can safely ignore this email.',
            ),
        }),
        text: `Your TrustPro verification code is ${v.code}. It expires in ${v.expiresInMinutes} minutes. If you did not request it, ignore this email.`,
      }),
      fr: (v) => ({
        subject: `${v.code} est votre code de vérification TrustPro`,
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Votre code de vérification TrustPro.',
          heading: 'Votre code de vérification',
          bodyHtml:
            paragraphs('Saisissez ce code pour vérifier votre compte TrustPro :') +
            codeBlock(v.code) +
            paragraphs(
              `Ce code expire dans ${v.expiresInMinutes} minutes.`,
              "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
            ),
        }),
        text: `Votre code de vérification TrustPro est ${v.code}. Il expire dans ${v.expiresInMinutes} minutes.`,
      }),
    },
    [NotificationChannel.SMS]: {
      en: (v) => ({
        text: `${v.code} is your TrustPro code. It expires in ${v.expiresInMinutes} min. Never share it.`,
      }),
      fr: (v) => ({
        text: `${v.code} est votre code TrustPro. Il expire dans ${v.expiresInMinutes} min. Ne le partagez jamais.`,
      }),
    },
  },
};

const authPasswordReset: TemplateDefinition<'auth.password_reset'> = {
  key: 'auth.password_reset',
  category: NotificationCategory.SECURITY,
  securityCritical: true,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'Reset your TrustPro password',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Reset your TrustPro password.',
          heading: 'Reset your password',
          bodyHtml: paragraphs(
            `Use the button below to choose a new password. This link expires in ${v.expiresInMinutes} minutes.`,
            'If you did not request a password reset, ignore this email — your password stays unchanged.',
          ),
          cta: { label: 'Reset password', url: v.resetUrl },
        }),
        text: `Reset your TrustPro password: ${v.resetUrl}\n\nThis link expires in ${v.expiresInMinutes} minutes. If you did not request it, ignore this email.`,
      }),
      fr: (v) => ({
        subject: 'Réinitialisez votre mot de passe TrustPro',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Réinitialisez votre mot de passe TrustPro.',
          heading: 'Réinitialisez votre mot de passe',
          bodyHtml: paragraphs(
            `Utilisez le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien expire dans ${v.expiresInMinutes} minutes.`,
            "Si vous n'avez pas demandé cette réinitialisation, ignorez cet e-mail : votre mot de passe reste inchangé.",
          ),
          cta: { label: 'Réinitialiser le mot de passe', url: v.resetUrl },
        }),
        text: `Réinitialisez votre mot de passe TrustPro : ${v.resetUrl}\n\nCe lien expire dans ${v.expiresInMinutes} minutes.`,
      }),
    },
  },
};

const authNewDeviceLogin: TemplateDefinition<'auth.new_device_login'> = {
  key: 'auth.new_device_login',
  category: NotificationCategory.SECURITY,
  securityCritical: true,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'New sign-in to your TrustPro account',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'A new device signed in to your account.',
          heading: 'New sign-in detected',
          bodyHtml: paragraphs(
            `We noticed a sign-in from <strong>${escapeHtml(v.deviceName)}</strong> on ${escapeHtml(v.occurredAt)}.`,
            'If this was you, no action is needed. If it was not, secure your account now.',
          ),
          cta: { label: 'Secure my account', url: v.secureAccountUrl },
        }),
        text: `New sign-in to your TrustPro account from ${v.deviceName} on ${v.occurredAt}. If this was not you, secure your account: ${v.secureAccountUrl}`,
      }),
      fr: (v) => ({
        subject: 'Nouvelle connexion à votre compte TrustPro',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: "Un nouvel appareil s'est connecté à votre compte.",
          heading: 'Nouvelle connexion détectée',
          bodyHtml: paragraphs(
            `Nous avons détecté une connexion depuis <strong>${escapeHtml(v.deviceName)}</strong> le ${escapeHtml(v.occurredAt)}.`,
            "S'il s'agit de vous, aucune action n'est nécessaire. Sinon, sécurisez votre compte maintenant.",
          ),
          cta: { label: 'Sécuriser mon compte', url: v.secureAccountUrl },
        }),
        text: `Nouvelle connexion à votre compte TrustPro depuis ${v.deviceName} le ${v.occurredAt}. Si ce n'était pas vous, sécurisez votre compte : ${v.secureAccountUrl}`,
      }),
    },
  },
};

const authPasswordChanged: TemplateDefinition<'auth.password_changed'> = {
  key: 'auth.password_changed',
  category: NotificationCategory.SECURITY,
  securityCritical: true,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'Your TrustPro password was changed',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Your TrustPro password was changed.',
          heading: 'Your password was changed',
          bodyHtml: paragraphs(
            `Your TrustPro password was changed on ${escapeHtml(v.occurredAt)}. You have been signed out on every device.`,
            'If this was not you, reset your password immediately and contact support.',
          ),
        }),
        text: `Your TrustPro password was changed on ${v.occurredAt}. You have been signed out on every device. If this was not you, reset your password immediately and contact support.`,
      }),
      fr: (v) => ({
        subject: 'Votre mot de passe TrustPro a été modifié',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Votre mot de passe TrustPro a été modifié.',
          heading: 'Votre mot de passe a été modifié',
          bodyHtml: paragraphs(
            `Votre mot de passe TrustPro a été modifié le ${escapeHtml(v.occurredAt)}. Vous avez été déconnecté de tous vos appareils.`,
            "Si vous n'êtes pas à l'origine de ce changement, réinitialisez votre mot de passe immédiatement et contactez le support.",
          ),
        }),
        text: `Votre mot de passe TrustPro a été modifié le ${v.occurredAt}. Vous avez été déconnecté de tous vos appareils. Si ce n'était pas vous, réinitialisez votre mot de passe immédiatement.`,
      }),
    },
  },
};

const authTwoFactorChanged: TemplateDefinition<'auth.two_factor_changed'> = {
  key: 'auth.two_factor_changed',
  category: NotificationCategory.SECURITY,
  securityCritical: true,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: v.enabled ? 'Two-factor authentication is on' : 'Two-factor authentication is off',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'A security setting on your TrustPro account changed.',
          heading: v.enabled
            ? 'Two-factor authentication enabled'
            : 'Two-factor authentication disabled',
          bodyHtml: paragraphs(
            v.enabled
              ? 'From now on you will need a code from your verified channel each time you sign in.'
              : 'Signing in now needs only your password. We recommend turning two-factor authentication back on.',
            'If you did not make this change, reset your password immediately and contact support.',
          ),
        }),
        text: v.enabled
          ? 'Two-factor authentication is now ON for your TrustPro account. If you did not make this change, reset your password immediately.'
          : 'Two-factor authentication is now OFF for your TrustPro account. If you did not make this change, reset your password immediately.',
      }),
      fr: (v) => ({
        subject: v.enabled
          ? 'La double authentification est activée'
          : 'La double authentification est désactivée',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Un paramètre de sécurité de votre compte TrustPro a changé.',
          heading: v.enabled
            ? 'Double authentification activée'
            : 'Double authentification désactivée',
          bodyHtml: paragraphs(
            v.enabled
              ? 'Désormais, un code envoyé sur votre canal vérifié vous sera demandé à chaque connexion.'
              : 'Votre mot de passe suffit désormais pour vous connecter. Nous vous recommandons de réactiver la double authentification.',
            "Si vous n'êtes pas à l'origine de ce changement, réinitialisez votre mot de passe immédiatement et contactez le support.",
          ),
        }),
        text: v.enabled
          ? "La double authentification est maintenant ACTIVÉE sur votre compte TrustPro. Si ce n'était pas vous, réinitialisez votre mot de passe immédiatement."
          : "La double authentification est maintenant DÉSACTIVÉE sur votre compte TrustPro. Si ce n'était pas vous, réinitialisez votre mot de passe immédiatement.",
      }),
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry + lookup
// ─────────────────────────────────────────────────────────────────────────────

/** Mapped so `TEMPLATES[key]` stays correlated with the key's variables type. */
type TemplateMap = { [K in TemplateKey]: TemplateDefinition<K> };

const TEMPLATES: TemplateMap = {
  'system.test_notification': testNotification,
  'account.welcome': accountWelcome,
  'auth.otp_code': authOtpCode,
  'auth.password_reset': authPasswordReset,
  'auth.new_device_login': authNewDeviceLogin,
  'auth.password_changed': authPasswordChanged,
  'auth.two_factor_changed': authTwoFactorChanged,
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];

export function isTemplateKey(value: string): value is TemplateKey {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, value);
}

export function getTemplate<K extends TemplateKey>(key: K): TemplateDefinition<K> {
  return TEMPLATES[key];
}

/** Channels this template can actually be delivered on (has copy for). */
export function getSupportedChannels(key: TemplateKey): NotificationChannel[] {
  const { render } = getTemplate(key);
  return Object.values(NotificationChannel).filter((channel) => render[channel] !== undefined);
}

/**
 * Renders a template for one channel + locale. Falls back to English when a
 * locale variant is somehow missing, so a delivery is never dropped over copy.
 * Returns null when the template has no content for the channel.
 */
export function renderTemplate(
  key: TemplateKey,
  channel: NotificationChannel,
  locale: Locale,
  variables: Record<string, unknown>,
): RenderedMessage | null {
  const { render } = getTemplate(key);

  switch (channel) {
    case NotificationChannel.EMAIL: {
      const byLocale = render[NotificationChannel.EMAIL];
      if (!byLocale) return null;
      const fn = byLocale[locale] ?? byLocale.en;
      return {
        channel: 'EMAIL',
        content: fn(variables as never),
      };
    }
    case NotificationChannel.WEB_PUSH: {
      const byLocale = render[NotificationChannel.WEB_PUSH];
      if (!byLocale) return null;
      const fn = byLocale[locale] ?? byLocale.en;
      return { channel: 'WEB_PUSH', content: fn(variables as never) };
    }
    case NotificationChannel.SMS: {
      const byLocale = render[NotificationChannel.SMS];
      if (!byLocale) return null;
      const fn = byLocale[locale] ?? byLocale.en;
      return { channel: 'SMS', content: fn(variables as never) };
    }
    default:
      return null;
  }
}
