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
  /** Tier promotion (TRU-02). `tierLabelKey`/`unlockKey` are for in-app surfaces. */
  'trust.tier_promoted': { tier: string; tierLabelKey: string; unlockKey: string };
  'trust.score_milestone': { score: number; threshold: number };
  /** A milestone badge unlocked (TRU-11). */
  'trust.badge_unlocked': { badge: string; badgeLabelKey: string; badgeDescriptionKey: string };
  /** A verification check passed review (TRU-06). */
  'verification.approved': { checkType: string; checkLabelKey: string };
  /**
   * A verification check was refused (TRU-07). The reason arrives as a CODE and
   * the copy is chosen here per locale, which is the only way the friendly retry
   * line exists in both languages without being written at the call site.
   */
  'verification.rejected': {
    checkType: string;
    checkLabelKey: string;
    reason: string;
    reasonKey: string;
    retryable: boolean;
  };
  'verification.info_requested': { checkLabelKey: string; infoRequest: string };
  /** A worker applied to the poster's job (JOB-03). */
  'job.application_received': { jobTitle: string };
  /** A poster invited the worker to quote a job (JOB-03). */
  'job.invitation_received': { jobTitle: string };
  /**
   * The poster moved the worker's application (JOB-04). `status` is the enum
   * value; `statusLabelKey` keys the localized chip copy in the web catalogue.
   */
  'job.application_status_changed': { jobTitle: string; status: string; statusLabelKey: string };
  /** A worker sent the client a quote (QTE-01). */
  'quote.received': { jobTitle: string; price: number };
  /** The client accepted the worker's quote — a booking now exists (QTE-03). */
  'quote.accepted': { jobTitle: string; price: number };
  /** The client declined the worker's quote (QTE-02). */
  'quote.declined': { jobTitle: string };
  /** The client asked the worker for a counter-offer (QTE-02). */
  'quote.counter_requested': {
    jobTitle: string;
    targetPrice: number | null;
    message: string | null;
  };
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

/**
 * Tier names, per locale. The tier ENUM is a machine value; what a worker reads
 * on a badge is copy, and copy lives here with the rest of it — never inlined at
 * an emit site, which is what keeps EN/FR parity checkable in one place.
 */
const TIER_NAMES: Record<Locale, Record<string, string>> = {
  en: {
    TIER_0: 'Basic Profile',
    TIER_1: 'ID Submitted',
    TIER_2: 'Verified Professional',
    TIER_3: 'Field Verified',
  },
  fr: {
    TIER_0: 'Profil de base',
    TIER_1: 'Pièce d’identité soumise',
    TIER_2: 'Professionnel vérifié',
    TIER_3: 'Vérifié sur le terrain',
  },
};

/** What the tier unlocks (§21.4), which is how TRU-05 frames every step. */
const TIER_UNLOCKS: Record<Locale, Record<string, string>> = {
  en: {
    TIER_1: 'You can now post unlimited job requests.',
    TIER_2:
      'You now carry the Verified Professional badge, rank higher in search, and can post jobs as a client.',
    TIER_3:
      'You now get premium search placement and access to high-value and corporate contracts.',
  },
  fr: {
    TIER_1: 'Vous pouvez désormais publier un nombre illimité de demandes.',
    TIER_2:
      'Vous portez désormais le badge Professionnel vérifié, vous êtes mieux classé dans la recherche et vous pouvez publier des offres en tant que client.',
    TIER_3:
      'Vous bénéficiez désormais d’un placement premium et de l’accès aux contrats à forte valeur et aux contrats d’entreprise.',
  },
};

const trustTierPromoted: TemplateDefinition<'trust.tier_promoted'> = {
  key: 'trust.tier_promoted',
  category: NotificationCategory.TRUST,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: `You reached ${TIER_NAMES.en[v.tier] ?? v.tier} on TrustPro`,
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Your verification level went up.',
          heading: `You reached ${escapeHtml(TIER_NAMES.en[v.tier] ?? v.tier)}`,
          bodyHtml: paragraphs(
            'Your verification level on TrustPro just went up.',
            escapeHtml(TIER_UNLOCKS.en[v.tier] ?? 'More of the platform is now open to you.'),
          ),
        }),
        text: `You reached ${TIER_NAMES.en[v.tier] ?? v.tier} on TrustPro. ${TIER_UNLOCKS.en[v.tier] ?? ''}`,
      }),
      fr: (v) => ({
        subject: `Vous avez atteint le niveau ${TIER_NAMES.fr[v.tier] ?? v.tier} sur TrustPro`,
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Votre niveau de vérification a augmenté.',
          heading: `Vous avez atteint : ${escapeHtml(TIER_NAMES.fr[v.tier] ?? v.tier)}`,
          bodyHtml: paragraphs(
            'Votre niveau de vérification sur TrustPro vient d’augmenter.',
            escapeHtml(
              TIER_UNLOCKS.fr[v.tier] ?? 'De nouvelles fonctionnalités vous sont ouvertes.',
            ),
          ),
        }),
        text: `Vous avez atteint le niveau ${TIER_NAMES.fr[v.tier] ?? v.tier} sur TrustPro. ${TIER_UNLOCKS.fr[v.tier] ?? ''}`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({
        title: 'Your verification level went up',
        body: `You reached ${TIER_NAMES.en[v.tier] ?? v.tier}.`,
      }),
      fr: (v) => ({
        title: 'Votre niveau de vérification a augmenté',
        body: `Vous avez atteint : ${TIER_NAMES.fr[v.tier] ?? v.tier}.`,
      }),
    },
  },
};

const trustScoreMilestone: TemplateDefinition<'trust.score_milestone'> = {
  key: 'trust.score_milestone',
  category: NotificationCategory.TRUST,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: `Your Trust Score passed ${v.threshold}`,
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Your Trust Score went up.',
          heading: `Your Trust Score is ${v.score}`,
          bodyHtml: paragraphs(
            `You just passed ${v.threshold} points. A higher Trust Score puts you in front of more clients near you.`,
            'Open your Trust Score breakdown to see what would raise it further.',
          ),
        }),
        text: `Your TrustPro Trust Score passed ${v.threshold} and is now ${v.score}.`,
      }),
      fr: (v) => ({
        subject: `Votre Score de Confiance a dépassé ${v.threshold}`,
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Votre Score de Confiance a augmenté.',
          heading: `Votre Score de Confiance est de ${v.score}`,
          bodyHtml: paragraphs(
            `Vous venez de dépasser ${v.threshold} points. Un Score de Confiance plus élevé vous met en avant auprès de davantage de clients près de chez vous.`,
            'Consultez le détail de votre Score de Confiance pour voir comment l’augmenter encore.',
          ),
        }),
        text: `Votre Score de Confiance TrustPro a dépassé ${v.threshold} et atteint ${v.score}.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'Your Trust Score went up', body: `You passed ${v.threshold} points.` }),
      fr: (v) => ({
        title: 'Votre Score de Confiance a augmenté',
        body: `Vous avez dépassé ${v.threshold} points.`,
      }),
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Verification + badges (TRU-06, TRU-07, TRU-11)
// ─────────────────────────────────────────────────────────────────────────────

/** Badge names, EN/FR. Keyed by BadgeType so a new badge is a compile-time gap. */
const BADGE_NAMES: Record<Locale, Record<string, string>> = {
  en: {
    FOUNDING_PROFESSIONAL: 'Founding Verified Professional',
    IDENTITY_VERIFIED: 'Identity Verified',
    VERIFIED_PROFESSIONAL: 'Verified Professional',
    FIELD_VERIFIED_PROFESSIONAL: 'Field Verified Professional',
    TRUST_SCORE_25: 'Building Trust',
    TRUST_SCORE_50: 'Trusted',
    TRUST_SCORE_75: 'Highly Trusted',
    TRUST_SCORE_90: 'Exceptional Trust',
    FIRST_JOB: 'First Job Completed',
    JOBS_10: '10 Jobs Completed',
    JOBS_25: '25 Jobs Completed',
    JOBS_50: '50 Jobs Completed',
    JOBS_100: '100 Jobs Completed',
    COMMUNITY_ENDORSED: 'Community Endorsed',
  },
  fr: {
    FOUNDING_PROFESSIONAL: 'Professionnel vérifié fondateur',
    IDENTITY_VERIFIED: 'Identité vérifiée',
    VERIFIED_PROFESSIONAL: 'Professionnel vérifié',
    FIELD_VERIFIED_PROFESSIONAL: 'Professionnel vérifié sur le terrain',
    TRUST_SCORE_25: 'Confiance en construction',
    TRUST_SCORE_50: 'Digne de confiance',
    TRUST_SCORE_75: 'Très digne de confiance',
    TRUST_SCORE_90: 'Confiance exceptionnelle',
    FIRST_JOB: 'Premier travail terminé',
    JOBS_10: '10 travaux terminés',
    JOBS_25: '25 travaux terminés',
    JOBS_50: '50 travaux terminés',
    JOBS_100: '100 travaux terminés',
    COMMUNITY_ENDORSED: 'Recommandé par la communauté',
  },
};

/** Check names, EN/FR, for the approval and rejection notices. */
const CHECK_NAMES: Record<Locale, Record<string, string>> = {
  en: {
    PHONE: 'phone number',
    ID_SUBMITTED: 'ID document',
    ID_APPROVED: 'national ID',
    SELFIE_LIVENESS: 'selfie',
    ADDRESS: 'proof of address',
    PORTFOLIO: 'portfolio',
    FIELD_VERIFICATION: 'in-person verification',
    BUSINESS_REGISTRATION: 'business registration',
  },
  fr: {
    PHONE: 'numéro de téléphone',
    ID_SUBMITTED: 'pièce d’identité',
    ID_APPROVED: 'carte nationale d’identité',
    SELFIE_LIVENESS: 'photo de visage',
    ADDRESS: 'justificatif de domicile',
    PORTFOLIO: 'portfolio',
    FIELD_VERIFICATION: 'vérification en personne',
    BUSINESS_REGISTRATION: 'registre de commerce',
  },
};

/**
 * The friendly retry lines (TRU-07).
 *
 * Every one of these is written to be ACTIONABLE and NON-JUDGEMENTAL: it says
 * what to do next, and it never implies the person did something wrong. "We
 * couldn't read your ID clearly" — not "your document was unacceptable".
 */
const REJECTION_LINES: Record<Locale, Record<string, string>> = {
  en: {
    OCR_UNREADABLE:
      'We couldn’t read your ID clearly. Try again in better lighting, with the whole card in the frame.',
    DOCUMENT_EXPIRED:
      'That document has expired. Upload a current one and we’ll take another look.',
    DETAILS_MISMATCH:
      'The details on the document don’t match your account yet. Check the spelling of your name and date of birth, then try again.',
    INCOMPLETE_SUBMISSION: 'Something was missing. Add the remaining files and send it again.',
    WRONG_DOCUMENT_TYPE: 'That looks like a different document. Upload the one we asked for.',
    FIELD_CHECK_FAILED:
      'Our agent couldn’t complete the visit. Get in touch and we’ll arrange another one.',
    SUSPECTED_FRAUD: 'We need to look at this more closely before we can continue.',
    CONFIRMED_FRAUDULENT: 'We cannot verify this account.',
    OTHER: 'We couldn’t approve this one. Send it again and we’ll take another look.',
  },
  fr: {
    OCR_UNREADABLE:
      'Nous n’avons pas pu lire votre pièce d’identité clairement. Réessayez avec un meilleur éclairage et la carte entière dans le cadre.',
    DOCUMENT_EXPIRED:
      'Ce document a expiré. Envoyez-en un valide et nous le vérifierons à nouveau.',
    DETAILS_MISMATCH:
      'Les informations du document ne correspondent pas encore à votre compte. Vérifiez l’orthographe de votre nom et votre date de naissance, puis réessayez.',
    INCOMPLETE_SUBMISSION:
      'Il manquait quelque chose. Ajoutez les fichiers manquants et renvoyez le tout.',
    WRONG_DOCUMENT_TYPE: 'Il semble s’agir d’un autre document. Envoyez celui qui a été demandé.',
    FIELD_CHECK_FAILED:
      'Notre agent n’a pas pu terminer la visite. Contactez-nous pour en organiser une autre.',
    SUSPECTED_FRAUD: 'Nous devons examiner ce dossier de plus près avant de continuer.',
    CONFIRMED_FRAUDULENT: 'Nous ne pouvons pas vérifier ce compte.',
    OTHER: 'Nous n’avons pas pu valider cet envoi. Renvoyez-le et nous le reverrons.',
  },
};

/**
 * Looks a name up, falling back to the raw code.
 *
 * A missing translation must never render as "undefined" in someone's inbox —
 * the enum value is ugly but true, and it is also a loud signal that a table
 * above is missing a row.
 */
function localized(table: Record<string, string>, key: string, fallback?: string): string {
  return table[key] ?? fallback ?? key;
}

const trustBadgeUnlocked: TemplateDefinition<'trust.badge_unlocked'> = {
  key: 'trust.badge_unlocked',
  category: NotificationCategory.TRUST,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: `You unlocked ${localized(BADGE_NAMES.en, v.badge)}`,
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'A new badge on your TrustPro profile.',
          heading: `You unlocked ${escapeHtml(localized(BADGE_NAMES.en, v.badge))}`,
          bodyHtml: paragraphs(
            'This badge now shows on your profile, where every client who finds you can see it.',
            'Badges are permanent — once you have earned one, it stays.',
          ),
        }),
        text: `You unlocked the ${localized(BADGE_NAMES.en, v.badge)} badge on TrustPro.`,
      }),
      fr: (v) => ({
        subject: `Vous avez débloqué : ${localized(BADGE_NAMES.fr, v.badge)}`,
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Un nouveau badge sur votre profil TrustPro.',
          heading: `Vous avez débloqué : ${escapeHtml(localized(BADGE_NAMES.fr, v.badge))}`,
          bodyHtml: paragraphs(
            'Ce badge apparaît désormais sur votre profil, visible par tous les clients qui vous trouvent.',
            'Les badges sont permanents : une fois obtenu, il vous reste acquis.',
          ),
        }),
        text: `Vous avez débloqué le badge ${localized(BADGE_NAMES.fr, v.badge)} sur TrustPro.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({
        title: 'New badge unlocked',
        body: localized(BADGE_NAMES.en, v.badge),
      }),
      fr: (v) => ({
        title: 'Nouveau badge débloqué',
        body: localized(BADGE_NAMES.fr, v.badge),
      }),
    },
  },
};

const verificationApproved: TemplateDefinition<'verification.approved'> = {
  key: 'verification.approved',
  category: NotificationCategory.TRUST,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'Your verification was approved',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'One more step complete.',
          heading: 'Verification approved',
          bodyHtml: paragraphs(
            `We have checked your ${escapeHtml(localized(CHECK_NAMES.en, v.checkType, 'document'))} and everything is in order.`,
            'Open your Trust Score to see what this unlocked and what comes next.',
          ),
        }),
        text: `Your ${localized(CHECK_NAMES.en, v.checkType, 'document')} was verified on TrustPro.`,
      }),
      fr: (v) => ({
        subject: 'Votre vérification a été approuvée',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Une étape de plus est terminée.',
          heading: 'Vérification approuvée',
          bodyHtml: paragraphs(
            `Nous avons vérifié votre ${escapeHtml(localized(CHECK_NAMES.fr, v.checkType, 'document'))} : tout est en ordre.`,
            'Consultez votre Score de Confiance pour voir ce que cela débloque et la suite.',
          ),
        }),
        text: `Votre ${localized(CHECK_NAMES.fr, v.checkType, 'document')} a été vérifié sur TrustPro.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({
        title: 'Verification approved',
        body: `Your ${localized(CHECK_NAMES.en, v.checkType, 'document')} has been verified.`,
      }),
      fr: (v) => ({
        title: 'Vérification approuvée',
        body: `Votre ${localized(CHECK_NAMES.fr, v.checkType, 'document')} a été vérifié.`,
      }),
    },
  },
};

const verificationRejected: TemplateDefinition<'verification.rejected'> = {
  key: 'verification.rejected',
  category: NotificationCategory.TRUST,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        // Not "rejected" in the subject line. The user needs to know there is
        // something to do, not to be told off in their inbox.
        subject: v.retryable ? 'One more try on your verification' : 'About your verification',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Here is what to do next.',
          heading: v.retryable ? 'Almost there' : 'About your verification',
          bodyHtml: paragraphs(
            escapeHtml(localized(REJECTION_LINES.en, v.reason, REJECTION_LINES.en.OTHER)),
            ...(v.retryable ? ['You can send it again from your verification screen.'] : []),
          ),
        }),
        text: localized(REJECTION_LINES.en, v.reason, REJECTION_LINES.en.OTHER),
      }),
      fr: (v) => ({
        subject: v.retryable
          ? 'Un dernier essai pour votre vérification'
          : 'À propos de votre vérification',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Voici ce qu’il reste à faire.',
          heading: v.retryable ? 'Presque terminé' : 'À propos de votre vérification',
          bodyHtml: paragraphs(
            escapeHtml(localized(REJECTION_LINES.fr, v.reason, REJECTION_LINES.fr.OTHER)),
            ...(v.retryable ? ['Vous pouvez le renvoyer depuis votre écran de vérification.'] : []),
          ),
        }),
        text: localized(REJECTION_LINES.fr, v.reason, REJECTION_LINES.fr.OTHER),
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({
        title: v.retryable ? 'Almost there' : 'About your verification',
        body: localized(REJECTION_LINES.en, v.reason, REJECTION_LINES.en.OTHER),
      }),
      fr: (v) => ({
        title: v.retryable ? 'Presque terminé' : 'À propos de votre vérification',
        body: localized(REJECTION_LINES.fr, v.reason, REJECTION_LINES.fr.OTHER),
      }),
    },
  },
};

const verificationInfoRequested: TemplateDefinition<'verification.info_requested'> = {
  key: 'verification.info_requested',
  category: NotificationCategory.TRUST,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'We need one more thing',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'A quick addition to your verification.',
          heading: 'We need one more thing',
          bodyHtml: paragraphs(
            'Our reviewer asked for this:',
            escapeHtml(v.infoRequest),
            'Add it from your verification screen and we will pick it straight back up — you keep your place in the queue.',
          ),
        }),
        text: `We need one more thing for your TrustPro verification: ${v.infoRequest}`,
      }),
      fr: (v) => ({
        subject: 'Il nous manque un élément',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Un petit complément pour votre vérification.',
          heading: 'Il nous manque un élément',
          bodyHtml: paragraphs(
            'Notre équipe a demandé ceci :',
            escapeHtml(v.infoRequest),
            'Ajoutez-le depuis votre écran de vérification et nous reprendrons aussitôt — vous gardez votre place dans la file.',
          ),
        }),
        text: `Il nous manque un élément pour votre vérification TrustPro : ${v.infoRequest}`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'We need one more thing', body: v.infoRequest }),
      fr: (v) => ({ title: 'Il nous manque un élément', body: v.infoRequest }),
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Jobs & Quotes (JOB-03, JOB-04, QTE-01…QTE-03)
//
// Every one of these crosses from one party to the other — a worker applies and
// the CLIENT hears; a client accepts and the WORKER hears. That cross-party
// direction is exactly why they go through the dispatcher rather than being a
// screen the actor already sees: the person who needs to know is not the person
// who acted. XAF has no minor unit, so amounts render as whole grouped numbers.
// ─────────────────────────────────────────────────────────────────────────────

/** Whole-XAF formatter. Grouped by locale; no decimals, because XAF has none. */
function xaf(amount: number, locale: Locale): string {
  return `${amount.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US')} XAF`;
}

const jobApplicationReceived: TemplateDefinition<'job.application_received'> = {
  key: 'job.application_received',
  category: NotificationCategory.JOBS,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'You have a new applicant',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Someone applied to your job.',
          heading: 'New applicant',
          bodyHtml: paragraphs(
            `A worker has applied to your job "${escapeHtml(v.jobTitle)}".`,
            'Open the job to see their profile, Trust Score and message.',
          ),
        }),
        text: `A worker applied to your job "${v.jobTitle}". Open TrustPro to review them.`,
      }),
      fr: (v) => ({
        subject: 'Vous avez une nouvelle candidature',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Quelqu’un a postulé à votre offre.',
          heading: 'Nouvelle candidature',
          bodyHtml: paragraphs(
            `Un artisan a postulé à votre offre « ${escapeHtml(v.jobTitle)} ».`,
            'Ouvrez l’offre pour voir son profil, son Score de Confiance et son message.',
          ),
        }),
        text: `Un artisan a postulé à votre offre « ${v.jobTitle} ». Ouvrez TrustPro pour l’examiner.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'New applicant', body: `Someone applied to "${v.jobTitle}".` }),
      fr: (v) => ({
        title: 'Nouvelle candidature',
        body: `Une candidature pour « ${v.jobTitle} ».`,
      }),
    },
  },
};

const jobInvitationReceived: TemplateDefinition<'job.invitation_received'> = {
  key: 'job.invitation_received',
  category: NotificationCategory.JOBS,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'A client invited you to a job',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'You have a new job request.',
          heading: 'You’re invited to quote',
          bodyHtml: paragraphs(
            `A client invited you to their job "${escapeHtml(v.jobTitle)}".`,
            'Open it to review the details and send a quote.',
          ),
        }),
        text: `A client invited you to the job "${v.jobTitle}". Open TrustPro to send a quote.`,
      }),
      fr: (v) => ({
        subject: 'Un client vous invite à une mission',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Vous avez une nouvelle demande.',
          heading: 'Invitation à devis',
          bodyHtml: paragraphs(
            `Un client vous a invité à sa mission « ${escapeHtml(v.jobTitle)} ».`,
            'Ouvrez-la pour consulter les détails et envoyer un devis.',
          ),
        }),
        text: `Un client vous a invité à la mission « ${v.jobTitle} ». Ouvrez TrustPro pour envoyer un devis.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'New job request', body: `You’re invited to "${v.jobTitle}".` }),
      fr: (v) => ({ title: 'Nouvelle demande', body: `Invitation à « ${v.jobTitle} ».` }),
    },
  },
};

const jobApplicationStatusChanged: TemplateDefinition<'job.application_status_changed'> = {
  key: 'job.application_status_changed',
  category: NotificationCategory.JOBS,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'An update on your application',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Your application status changed.',
          heading: 'Application update',
          bodyHtml: paragraphs(
            `There is an update on your application to "${escapeHtml(v.jobTitle)}".`,
            'Open TrustPro to see where things stand.',
          ),
        }),
        text: `Your application to "${v.jobTitle}" has an update on TrustPro.`,
      }),
      fr: (v) => ({
        subject: 'Mise à jour de votre candidature',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Le statut de votre candidature a changé.',
          heading: 'Mise à jour',
          bodyHtml: paragraphs(
            `Votre candidature à « ${escapeHtml(v.jobTitle)} » a une mise à jour.`,
            'Ouvrez TrustPro pour voir où en est votre candidature.',
          ),
        }),
        text: `Votre candidature à « ${v.jobTitle} » a une mise à jour sur TrustPro.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'Application update', body: `Update on "${v.jobTitle}".` }),
      fr: (v) => ({ title: 'Mise à jour', body: `Candidature « ${v.jobTitle} ».` }),
    },
  },
};

const quoteReceived: TemplateDefinition<'quote.received'> = {
  key: 'quote.received',
  category: NotificationCategory.QUOTES,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'You received a new quote',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'A worker sent you a quote.',
          heading: 'New quote',
          bodyHtml: paragraphs(
            `You received a quote of ${xaf(v.price, 'en')} for "${escapeHtml(v.jobTitle)}".`,
            'Open it to see what’s included and accept, decline, or ask for a counter-offer.',
          ),
        }),
        text: `You received a quote of ${xaf(v.price, 'en')} for "${v.jobTitle}" on TrustPro.`,
      }),
      fr: (v) => ({
        subject: 'Vous avez reçu un nouveau devis',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Un artisan vous a envoyé un devis.',
          heading: 'Nouveau devis',
          bodyHtml: paragraphs(
            `Vous avez reçu un devis de ${xaf(v.price, 'fr')} pour « ${escapeHtml(v.jobTitle)} ».`,
            'Ouvrez-le pour voir ce qui est inclus et accepter, refuser ou demander une contre-offre.',
          ),
        }),
        text: `Vous avez reçu un devis de ${xaf(v.price, 'fr')} pour « ${v.jobTitle} » sur TrustPro.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'New quote', body: `${xaf(v.price, 'en')} for "${v.jobTitle}".` }),
      fr: (v) => ({
        title: 'Nouveau devis',
        body: `${xaf(v.price, 'fr')} pour « ${v.jobTitle} ».`,
      }),
    },
  },
};

const quoteAccepted: TemplateDefinition<'quote.accepted'> = {
  key: 'quote.accepted',
  category: NotificationCategory.QUOTES,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'Your quote was accepted',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'The client accepted your quote.',
          heading: 'Quote accepted',
          bodyHtml: paragraphs(
            `The client accepted your quote of ${xaf(v.price, 'en')} for "${escapeHtml(v.jobTitle)}".`,
            'A booking has been created. Once payment is secured in escrow, you can start the work.',
          ),
        }),
        text: `Your quote of ${xaf(v.price, 'en')} for "${v.jobTitle}" was accepted on TrustPro.`,
      }),
      fr: (v) => ({
        subject: 'Votre devis a été accepté',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Le client a accepté votre devis.',
          heading: 'Devis accepté',
          bodyHtml: paragraphs(
            `Le client a accepté votre devis de ${xaf(v.price, 'fr')} pour « ${escapeHtml(v.jobTitle)} ».`,
            'Une réservation a été créée. Dès que le paiement est sécurisé sous séquestre, vous pouvez commencer.',
          ),
        }),
        text: `Votre devis de ${xaf(v.price, 'fr')} pour « ${v.jobTitle} » a été accepté sur TrustPro.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'Quote accepted', body: `"${v.jobTitle}" — ${xaf(v.price, 'en')}.` }),
      fr: (v) => ({ title: 'Devis accepté', body: `« ${v.jobTitle} » — ${xaf(v.price, 'fr')}.` }),
    },
  },
};

const quoteDeclined: TemplateDefinition<'quote.declined'> = {
  key: 'quote.declined',
  category: NotificationCategory.QUOTES,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'About your quote',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'An update on your quote.',
          heading: 'About your quote',
          bodyHtml: paragraphs(
            `The client did not go ahead with your quote for "${escapeHtml(v.jobTitle)}" this time.`,
            'Plenty of other jobs are looking for someone with your skills — keep going.',
          ),
        }),
        text: `The client declined your quote for "${v.jobTitle}" on TrustPro.`,
      }),
      fr: (v) => ({
        subject: 'À propos de votre devis',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Une mise à jour sur votre devis.',
          heading: 'À propos de votre devis',
          bodyHtml: paragraphs(
            `Le client n’a pas donné suite à votre devis pour « ${escapeHtml(v.jobTitle)} » cette fois.`,
            'D’autres missions cherchent vos compétences — continuez.',
          ),
        }),
        text: `Le client a décliné votre devis pour « ${v.jobTitle} » sur TrustPro.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'Quote update', body: `Not this time for "${v.jobTitle}".` }),
      fr: (v) => ({ title: 'Devis', body: `Pas cette fois pour « ${v.jobTitle} ».` }),
    },
  },
};

const quoteCounterRequested: TemplateDefinition<'quote.counter_requested'> = {
  key: 'quote.counter_requested',
  category: NotificationCategory.QUOTES,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'The client asked for a counter-offer',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'The client would like to negotiate.',
          heading: 'Counter-offer requested',
          bodyHtml: paragraphs(
            `The client would like a revised quote for "${escapeHtml(v.jobTitle)}".`,
            ...(v.targetPrice != null
              ? [`They suggested around ${xaf(v.targetPrice, 'en')}.`]
              : []),
            ...(v.message ? [escapeHtml(v.message)] : []),
            'Open TrustPro to send a revised quote.',
          ),
        }),
        text: `The client asked for a counter-offer on "${v.jobTitle}". Open TrustPro to revise your quote.`,
      }),
      fr: (v) => ({
        subject: 'Le client demande une contre-offre',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Le client souhaite négocier.',
          heading: 'Contre-offre demandée',
          bodyHtml: paragraphs(
            `Le client souhaite un devis révisé pour « ${escapeHtml(v.jobTitle)} ».`,
            ...(v.targetPrice != null ? [`Il propose environ ${xaf(v.targetPrice, 'fr')}.`] : []),
            ...(v.message ? [escapeHtml(v.message)] : []),
            'Ouvrez TrustPro pour envoyer un devis révisé.',
          ),
        }),
        text: `Le client demande une contre-offre pour « ${v.jobTitle} ». Ouvrez TrustPro pour réviser votre devis.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'Counter-offer requested', body: `For "${v.jobTitle}".` }),
      fr: (v) => ({ title: 'Contre-offre demandée', body: `Pour « ${v.jobTitle} ».` }),
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
  'trust.tier_promoted': trustTierPromoted,
  'trust.score_milestone': trustScoreMilestone,
  'trust.badge_unlocked': trustBadgeUnlocked,
  'verification.approved': verificationApproved,
  'verification.rejected': verificationRejected,
  'verification.info_requested': verificationInfoRequested,
  'job.application_received': jobApplicationReceived,
  'job.invitation_received': jobInvitationReceived,
  'job.application_status_changed': jobApplicationStatusChanged,
  'quote.received': quoteReceived,
  'quote.accepted': quoteAccepted,
  'quote.declined': quoteDeclined,
  'quote.counter_requested': quoteCounterRequested,
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
