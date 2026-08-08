import { NotificationCategory, NotificationChannel } from '@kavio/database';
import type {
  EmailContent,
  Locale,
  RenderedMessage,
  SmsContent,
  WebPushContent,
  WhatsappContent,
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
  /**
   * A field agent was invited (ADM-06). Sent to an email with no Kavio account
   * yet, so it bypasses the per-user dispatcher — see
   * agent-invitation-notification.listener.ts.
   */
  'admin.agent_invited': { name: string; acceptUrl: string; expiresInDays: number };
  /**
   * A platform announcement went live (ADM-07). Content is admin-authored
   * freeform copy, already supplied in both languages by the composer —
   * unlike most templates, there is no fixed EN/FR string to pick between,
   * only which of the two authored variants matches the recipient's locale.
   */
  'admin.announcement_published': { titleEn: string; titleFr: string; bodyEn: string; bodyFr: string };
  /**
   * A business owner invited a team member (BIZ-03). Sent to an email with no
   * Kavio account yet, so it bypasses the per-user dispatcher — see
   * team-notification.listener.ts.
   */
  'business.team_invited': {
    name: string;
    businessName: string;
    acceptUrl: string;
    expiresInDays: number;
  };
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
  /**
   * The poster cancelled a job before hiring anyone (JOB-05). Sent to every
   * worker who had a live (sent/viewed) quote on it — their offer is now moot.
   */
  'job.cancelled': { jobTitle: string };
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
  /** A booking is created and awaits the client's escrow payment (PAY-01). */
  'payment.required': { amount: number };
  /** Escrow funded; the worker can begin (PAY-01). */
  'payment.received': { jobTitle: string; amount: number };
  /** The worker acknowledged the funded escrow (PAY-01, "work can start soon"). */
  'escrow.work_accepted': { jobTitle: string };
  /** The worker started the job (PAY-01, JOB-06). */
  'escrow.work_started': { jobTitle: string };
  /** The worker marked the job done; the client's confirmation releases payment (PAY-01, JOB-07). */
  'escrow.work_completed': { jobTitle: string };
  /** Escrow released to the worker's wallet, minus the fee (PAY-01). */
  'escrow.released': { jobTitle: string; amount: number };
  /** Escrow refunded to the client's wallet (PAY-01). */
  'escrow.refunded': { jobTitle: string; amount: number };
  /**
   * A collection or payout failed (PAY-06). `reasonKey` is a code — declined,
   * insufficient_funds, operator_timeout — chosen into localized copy here.
   */
  'payment.failed': { amount: number; reasonKey: string };
  /** The other party opened a dispute, freezing the escrow (PAY-03). */
  'dispute.opened': { jobTitle: string };
  /** An admin resolved a dispute (ADM-05). `resolution` keys the localized copy. */
  'dispute.resolved': { jobTitle: string; resolution: string };
  /** A new message arrived in a conversation (MSG-01). Deep-links to the thread. */
  'message.received': { senderName: string; preview: string };
  /** A worker's client left a review (TRU-*, future reviews module). */
  'review.received': { jobTitle: string; rating: number };
  /** A job matching the worker's skills/area was posted (JOB-04, future matching). */
  'job.matched': { jobTitle: string; categoryName: string | null };
  /**
   * A safety SOS was triggered (SOS-01). Sent to the user's emergency contacts —
   * who have no account — so it is addressed directly and carries a map link.
   */
  'safety.sos_triggered': {
    userName: string;
    contactName: string;
    message: string | null;
    mapUrl: string;
  };
  /**
   * An admin took a moderation decision against this identity (ADM-08). `action`
   * is the enum value and is chosen into localized copy here — the reason is the
   * admin's own words and is passed through verbatim, because a penalty a person
   * cannot read is not due process.
   */
  'moderation.action_taken': {
    action: string;
    reason: string;
    /** ISO instant a suspension lapses; null on every other action. */
    expiresAt: string | null;
  };
  /** Something was reported and needs a decision (ADM-08). Sent to admins. */
  'moderation.report_received': { targetLabel: string; targetType: string };
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
  readonly [NotificationChannel.WHATSAPP]?: Record<
    Locale,
    (v: TemplateVariables<K>) => WhatsappContent
  >;
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
        subject: 'Kavio test notification',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'A test notification from Kavio.',
          heading: 'Test notification',
          bodyHtml: paragraphs(
            'This is a test notification from the Kavio dispatcher.',
            escapeHtml(v.message),
          ),
        }),
        text: `Test notification\n\nThis is a test notification from the Kavio dispatcher.\n\n${v.message}`,
      }),
      fr: (v) => ({
        subject: 'Notification de test Kavio',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Une notification de test de Kavio.',
          heading: 'Notification de test',
          bodyHtml: paragraphs(
            'Ceci est une notification de test du répartiteur Kavio.',
            escapeHtml(v.message),
          ),
        }),
        text: `Notification de test\n\nCeci est une notification de test du répartiteur Kavio.\n\n${v.message}`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'Kavio test', body: v.message }),
      fr: (v) => ({ title: 'Test Kavio', body: v.message }),
    },
    [NotificationChannel.SMS]: {
      en: (v) => ({ text: `Kavio test: ${v.message}` }),
      fr: (v) => ({ text: `Test Kavio : ${v.message}` }),
    },
    [NotificationChannel.WHATSAPP]: {
      en: (v) => ({ text: `Kavio test: ${v.message}` }),
      fr: (v) => ({ text: `Test Kavio : ${v.message}` }),
    },
  },
};

const accountWelcome: TemplateDefinition<'account.welcome'> = {
  key: 'account.welcome',
  category: NotificationCategory.ACCOUNT,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'Welcome to Kavio',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Your Kavio account is ready.',
          heading: `Welcome, ${v.name}`,
          bodyHtml: paragraphs(
            'Your Kavio account is ready. Verify your details to build your Trust Score and unlock more of the platform.',
            'Every step you complete raises your Trust Score and makes you more visible to clients near you.',
          ),
        }),
        text: `Welcome, ${v.name}\n\nYour Kavio account is ready. Verify your details to build your Trust Score and unlock more of the platform.`,
      }),
      fr: (v) => ({
        subject: 'Bienvenue sur Kavio',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Votre compte Kavio est prêt.',
          heading: `Bienvenue, ${v.name}`,
          bodyHtml: paragraphs(
            'Votre compte Kavio est prêt. Vérifiez vos informations pour développer votre Score de Confiance et débloquer davantage de fonctionnalités.',
            'Chaque étape complétée augmente votre Score de Confiance et vous rend plus visible auprès des clients près de chez vous.',
          ),
        }),
        text: `Bienvenue, ${v.name}\n\nVotre compte Kavio est prêt. Vérifiez vos informations pour développer votre Score de Confiance.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'Welcome to Kavio', body: `You're all set, ${v.name}.` }),
      fr: (v) => ({ title: 'Bienvenue sur Kavio', body: `Tout est prêt, ${v.name}.` }),
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
        subject: `${v.code} is your Kavio verification code`,
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Your Kavio verification code.',
          heading: 'Your verification code',
          bodyHtml:
            paragraphs('Enter this code to verify your Kavio account:') +
            codeBlock(v.code) +
            paragraphs(
              `This code expires in ${v.expiresInMinutes} minutes.`,
              'If you did not request it, you can safely ignore this email.',
            ),
        }),
        text: `Your Kavio verification code is ${v.code}. It expires in ${v.expiresInMinutes} minutes. If you did not request it, ignore this email.`,
      }),
      fr: (v) => ({
        subject: `${v.code} est votre code de vérification Kavio`,
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Votre code de vérification Kavio.',
          heading: 'Votre code de vérification',
          bodyHtml:
            paragraphs('Saisissez ce code pour vérifier votre compte Kavio :') +
            codeBlock(v.code) +
            paragraphs(
              `Ce code expire dans ${v.expiresInMinutes} minutes.`,
              "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
            ),
        }),
        text: `Votre code de vérification Kavio est ${v.code}. Il expire dans ${v.expiresInMinutes} minutes.`,
      }),
    },
    [NotificationChannel.SMS]: {
      en: (v) => ({
        text: `${v.code} is your Kavio code. It expires in ${v.expiresInMinutes} min. Never share it.`,
      }),
      fr: (v) => ({
        text: `${v.code} est votre code Kavio. Il expire dans ${v.expiresInMinutes} min. Ne le partagez jamais.`,
      }),
    },
    [NotificationChannel.WHATSAPP]: {
      en: (v) => ({
        text: `${v.code} is your Kavio code. It expires in ${v.expiresInMinutes} min. Never share it.`,
      }),
      fr: (v) => ({
        text: `${v.code} est votre code Kavio. Il expire dans ${v.expiresInMinutes} min. Ne le partagez jamais.`,
      }),
    },
  },
};

const adminAgentInvited: TemplateDefinition<'admin.agent_invited'> = {
  key: 'admin.agent_invited',
  category: NotificationCategory.SECURITY,
  securityCritical: true,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'You have been invited to join Kavio as a field agent',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Set your password to finish joining Kavio.',
          heading: 'Join Kavio as a field agent',
          bodyHtml: paragraphs(
            `${escapeHtml(v.name)}, an admin has invited you to verify professionals in person for Kavio.`,
            `Use the button below to set a password and finish onboarding. This invitation expires in ${v.expiresInDays} days.`,
            'If you were not expecting this, you can safely ignore this email.',
          ),
          cta: { label: 'Accept invitation', url: v.acceptUrl },
        }),
        text: `${v.name}, an admin has invited you to join Kavio as a field agent. Accept your invitation: ${v.acceptUrl}\n\nThis invitation expires in ${v.expiresInDays} days. If you were not expecting this, ignore this email.`,
      }),
      fr: (v) => ({
        subject: 'Vous avez été invité(e) à rejoindre Kavio comme agent de terrain',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Définissez votre mot de passe pour rejoindre Kavio.',
          heading: 'Rejoignez Kavio comme agent de terrain',
          bodyHtml: paragraphs(
            `${escapeHtml(v.name)}, un administrateur vous a invité(e) à vérifier des professionnels sur le terrain pour Kavio.`,
            `Utilisez le bouton ci-dessous pour définir un mot de passe et terminer votre inscription. Cette invitation expire dans ${v.expiresInDays} jours.`,
            "Si vous ne vous attendiez pas à ce message, vous pouvez l'ignorer.",
          ),
          cta: { label: "Accepter l'invitation", url: v.acceptUrl },
        }),
        text: `${v.name}, un administrateur vous a invité(e) à rejoindre Kavio comme agent de terrain. Acceptez votre invitation : ${v.acceptUrl}\n\nCette invitation expire dans ${v.expiresInDays} jours.`,
      }),
    },
  },
};

const adminAnnouncementPublished: TemplateDefinition<'admin.announcement_published'> = {
  key: 'admin.announcement_published',
  // MARKETING, not SECURITY: an announcement is platform news, not an account
  // notice, so it respects the recipient's own channel preferences same as any
  // other non-critical template.
  category: NotificationCategory.MARKETING,
  render: {
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: v.titleEn, body: v.bodyEn }),
      fr: (v) => ({ title: v.titleFr, body: v.bodyFr }),
    },
  },
};

const businessTeamInvited: TemplateDefinition<'business.team_invited'> = {
  key: 'business.team_invited',
  category: NotificationCategory.SECURITY,
  securityCritical: true,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: `You have been invited to join ${v.businessName} on Kavio`,
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Set your password to finish joining the team.',
          heading: `Join ${v.businessName} on Kavio`,
          bodyHtml: paragraphs(
            `${escapeHtml(v.name)}, ${escapeHtml(v.businessName)} has invited you to join their team on Kavio.`,
            `Use the button below to set a password and access the business dashboard. This invitation expires in ${v.expiresInDays} days.`,
            'If you were not expecting this, you can safely ignore this email.',
          ),
          cta: { label: 'Accept invitation', url: v.acceptUrl },
        }),
        text: `${v.name}, ${v.businessName} has invited you to join their team on Kavio. Accept your invitation: ${v.acceptUrl}\n\nThis invitation expires in ${v.expiresInDays} days. If you were not expecting this, ignore this email.`,
      }),
      fr: (v) => ({
        subject: `Vous avez été invité(e) à rejoindre ${v.businessName} sur Kavio`,
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Définissez votre mot de passe pour rejoindre l’équipe.',
          heading: `Rejoignez ${v.businessName} sur Kavio`,
          bodyHtml: paragraphs(
            `${escapeHtml(v.name)}, ${escapeHtml(v.businessName)} vous a invité(e) à rejoindre son équipe sur Kavio.`,
            `Utilisez le bouton ci-dessous pour définir un mot de passe et accéder au tableau de bord de l'entreprise. Cette invitation expire dans ${v.expiresInDays} jours.`,
            "Si vous ne vous attendiez pas à ce message, vous pouvez l'ignorer.",
          ),
          cta: { label: "Accepter l'invitation", url: v.acceptUrl },
        }),
        text: `${v.name}, ${v.businessName} vous a invité(e) à rejoindre son équipe sur Kavio. Acceptez votre invitation : ${v.acceptUrl}\n\nCette invitation expire dans ${v.expiresInDays} jours.`,
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
        subject: 'Reset your Kavio password',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Reset your Kavio password.',
          heading: 'Reset your password',
          bodyHtml: paragraphs(
            `Use the button below to choose a new password. This link expires in ${v.expiresInMinutes} minutes.`,
            'If you did not request a password reset, ignore this email, your password stays unchanged.',
          ),
          cta: { label: 'Reset password', url: v.resetUrl },
        }),
        text: `Reset your Kavio password: ${v.resetUrl}\n\nThis link expires in ${v.expiresInMinutes} minutes. If you did not request it, ignore this email.`,
      }),
      fr: (v) => ({
        subject: 'Réinitialisez votre mot de passe Kavio',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Réinitialisez votre mot de passe Kavio.',
          heading: 'Réinitialisez votre mot de passe',
          bodyHtml: paragraphs(
            `Utilisez le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien expire dans ${v.expiresInMinutes} minutes.`,
            "Si vous n'avez pas demandé cette réinitialisation, ignorez cet e-mail : votre mot de passe reste inchangé.",
          ),
          cta: { label: 'Réinitialiser le mot de passe', url: v.resetUrl },
        }),
        text: `Réinitialisez votre mot de passe Kavio : ${v.resetUrl}\n\nCe lien expire dans ${v.expiresInMinutes} minutes.`,
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
        subject: 'New sign-in to your Kavio account',
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
        text: `New sign-in to your Kavio account from ${v.deviceName} on ${v.occurredAt}. If this was not you, secure your account: ${v.secureAccountUrl}`,
      }),
      fr: (v) => ({
        subject: 'Nouvelle connexion à votre compte Kavio',
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
        text: `Nouvelle connexion à votre compte Kavio depuis ${v.deviceName} le ${v.occurredAt}. Si ce n'était pas vous, sécurisez votre compte : ${v.secureAccountUrl}`,
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
        subject: 'Your Kavio password was changed',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Your Kavio password was changed.',
          heading: 'Your password was changed',
          bodyHtml: paragraphs(
            `Your Kavio password was changed on ${escapeHtml(v.occurredAt)}. You have been signed out on every device.`,
            'If this was not you, reset your password immediately and contact support.',
          ),
        }),
        text: `Your Kavio password was changed on ${v.occurredAt}. You have been signed out on every device. If this was not you, reset your password immediately and contact support.`,
      }),
      fr: (v) => ({
        subject: 'Votre mot de passe Kavio a été modifié',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Votre mot de passe Kavio a été modifié.',
          heading: 'Votre mot de passe a été modifié',
          bodyHtml: paragraphs(
            `Votre mot de passe Kavio a été modifié le ${escapeHtml(v.occurredAt)}. Vous avez été déconnecté de tous vos appareils.`,
            "Si vous n'êtes pas à l'origine de ce changement, réinitialisez votre mot de passe immédiatement et contactez le support.",
          ),
        }),
        text: `Votre mot de passe Kavio a été modifié le ${v.occurredAt}. Vous avez été déconnecté de tous vos appareils. Si ce n'était pas vous, réinitialisez votre mot de passe immédiatement.`,
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
          preheader: 'A security setting on your Kavio account changed.',
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
          ? 'Two-factor authentication is now ON for your Kavio account. If you did not make this change, reset your password immediately.'
          : 'Two-factor authentication is now OFF for your Kavio account. If you did not make this change, reset your password immediately.',
      }),
      fr: (v) => ({
        subject: v.enabled
          ? 'La double authentification est activée'
          : 'La double authentification est désactivée',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Un paramètre de sécurité de votre compte Kavio a changé.',
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
          ? "La double authentification est maintenant ACTIVÉE sur votre compte Kavio. Si ce n'était pas vous, réinitialisez votre mot de passe immédiatement."
          : "La double authentification est maintenant DÉSACTIVÉE sur votre compte Kavio. Si ce n'était pas vous, réinitialisez votre mot de passe immédiatement.",
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
    TIER_1: 'Contact Verified',
    TIER_2: 'Verified Professional',
    TIER_3: 'Field Verified',
  },
  fr: {
    TIER_0: 'Profil de base',
    TIER_1: 'Coordonnées vérifiées',
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
        subject: `You reached ${TIER_NAMES.en[v.tier] ?? v.tier} on Kavio`,
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Your verification level went up.',
          heading: `You reached ${escapeHtml(TIER_NAMES.en[v.tier] ?? v.tier)}`,
          bodyHtml: paragraphs(
            'Your verification level on Kavio just went up.',
            escapeHtml(TIER_UNLOCKS.en[v.tier] ?? 'More of the platform is now open to you.'),
          ),
        }),
        text: `You reached ${TIER_NAMES.en[v.tier] ?? v.tier} on Kavio. ${TIER_UNLOCKS.en[v.tier] ?? ''}`,
      }),
      fr: (v) => ({
        subject: `Vous avez atteint le niveau ${TIER_NAMES.fr[v.tier] ?? v.tier} sur Kavio`,
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Votre niveau de vérification a augmenté.',
          heading: `Vous avez atteint : ${escapeHtml(TIER_NAMES.fr[v.tier] ?? v.tier)}`,
          bodyHtml: paragraphs(
            'Votre niveau de vérification sur Kavio vient d’augmenter.',
            escapeHtml(
              TIER_UNLOCKS.fr[v.tier] ?? 'De nouvelles fonctionnalités vous sont ouvertes.',
            ),
          ),
        }),
        text: `Vous avez atteint le niveau ${TIER_NAMES.fr[v.tier] ?? v.tier} sur Kavio. ${TIER_UNLOCKS.fr[v.tier] ?? ''}`,
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
        text: `Your Kavio Trust Score passed ${v.threshold} and is now ${v.score}.`,
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
        text: `Votre Score de Confiance Kavio a dépassé ${v.threshold} et atteint ${v.score}.`,
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
    PHONE: 'contact details',
    ID_SUBMITTED: 'ID document',
    ID_APPROVED: 'national ID',
    SELFIE_LIVENESS: 'selfie',
    ADDRESS: 'proof of address',
    PORTFOLIO: 'portfolio',
    FIELD_VERIFICATION: 'in-person verification',
    BUSINESS_REGISTRATION: 'business registration',
  },
  fr: {
    PHONE: 'coordonnées',
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
          preheader: 'A new badge on your Kavio profile.',
          heading: `You unlocked ${escapeHtml(localized(BADGE_NAMES.en, v.badge))}`,
          bodyHtml: paragraphs(
            'This badge now shows on your profile, where every client who finds you can see it.',
            'Badges are permanent: once you have earned one, it stays.',
          ),
        }),
        text: `You unlocked the ${localized(BADGE_NAMES.en, v.badge)} badge on Kavio.`,
      }),
      fr: (v) => ({
        subject: `Vous avez débloqué : ${localized(BADGE_NAMES.fr, v.badge)}`,
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Un nouveau badge sur votre profil Kavio.',
          heading: `Vous avez débloqué : ${escapeHtml(localized(BADGE_NAMES.fr, v.badge))}`,
          bodyHtml: paragraphs(
            'Ce badge apparaît désormais sur votre profil, visible par tous les clients qui vous trouvent.',
            'Les badges sont permanents : une fois obtenu, il vous reste acquis.',
          ),
        }),
        text: `Vous avez débloqué le badge ${localized(BADGE_NAMES.fr, v.badge)} sur Kavio.`,
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
        text: `Your ${localized(CHECK_NAMES.en, v.checkType, 'document')} was verified on Kavio.`,
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
        text: `Votre ${localized(CHECK_NAMES.fr, v.checkType, 'document')} a été vérifié sur Kavio.`,
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
            'Add it from your verification screen and we will pick it straight back up, you keep your place in the queue.',
          ),
        }),
        text: `We need one more thing for your Kavio verification: ${v.infoRequest}`,
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
            'Ajoutez-le depuis votre écran de vérification et nous reprendrons aussitôt, vous gardez votre place dans la file.',
          ),
        }),
        text: `Il nous manque un élément pour votre vérification Kavio : ${v.infoRequest}`,
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
        text: `A worker applied to your job "${v.jobTitle}". Open Kavio to review them.`,
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
        text: `Un artisan a postulé à votre offre « ${v.jobTitle} ». Ouvrez Kavio pour l’examiner.`,
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
        text: `A client invited you to the job "${v.jobTitle}". Open Kavio to send a quote.`,
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
        text: `Un client vous a invité à la mission « ${v.jobTitle} ». Ouvrez Kavio pour envoyer un devis.`,
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
            'Open Kavio to see where things stand.',
          ),
        }),
        text: `Your application to "${v.jobTitle}" has an update on Kavio.`,
      }),
      fr: (v) => ({
        subject: 'Mise à jour de votre candidature',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Le statut de votre candidature a changé.',
          heading: 'Mise à jour',
          bodyHtml: paragraphs(
            `Votre candidature à « ${escapeHtml(v.jobTitle)} » a une mise à jour.`,
            'Ouvrez Kavio pour voir où en est votre candidature.',
          ),
        }),
        text: `Votre candidature à « ${v.jobTitle} » a une mise à jour sur Kavio.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'Application update', body: `Update on "${v.jobTitle}".` }),
      fr: (v) => ({ title: 'Mise à jour', body: `Candidature « ${v.jobTitle} ».` }),
    },
  },
};

const jobCancelled: TemplateDefinition<'job.cancelled'> = {
  key: 'job.cancelled',
  category: NotificationCategory.JOBS,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'A job you quoted was cancelled',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'The client cancelled this job before hiring.',
          heading: 'Job cancelled',
          bodyHtml: paragraphs(
            `The client cancelled "${escapeHtml(v.jobTitle)}" before hiring anyone.`,
            'Your quote on it no longer applies. There is nothing further to do.',
          ),
        }),
        text: `"${v.jobTitle}" was cancelled by the client before hiring anyone. Your quote no longer applies.`,
      }),
      fr: (v) => ({
        subject: 'Un job que vous avez chiffré a été annulé',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Le client a annulé ce job avant d’embaucher.',
          heading: 'Job annulé',
          bodyHtml: paragraphs(
            `Le client a annulé « ${escapeHtml(v.jobTitle)} » avant d’embaucher qui que ce soit.`,
            'Votre devis ne s’applique plus. Il n’y a rien d’autre à faire.',
          ),
        }),
        text: `« ${v.jobTitle} » a été annulé par le client avant toute embauche. Votre devis ne s'applique plus.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'Job cancelled', body: `"${v.jobTitle}" was cancelled by the client.` }),
      fr: (v) => ({ title: 'Job annulé', body: `« ${v.jobTitle} » a été annulé par le client.` }),
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
        text: `You received a quote of ${xaf(v.price, 'en')} for "${v.jobTitle}" on Kavio.`,
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
        text: `Vous avez reçu un devis de ${xaf(v.price, 'fr')} pour « ${v.jobTitle} » sur Kavio.`,
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
        text: `Your quote of ${xaf(v.price, 'en')} for "${v.jobTitle}" was accepted on Kavio.`,
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
        text: `Votre devis de ${xaf(v.price, 'fr')} pour « ${v.jobTitle} » a été accepté sur Kavio.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'Quote accepted', body: `"${v.jobTitle}", ${xaf(v.price, 'en')}.` }),
      fr: (v) => ({ title: 'Devis accepté', body: `« ${v.jobTitle} », ${xaf(v.price, 'fr')}.` }),
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
            'Plenty of other jobs are looking for someone with your skills. Keep going.',
          ),
        }),
        text: `The client declined your quote for "${v.jobTitle}" on Kavio.`,
      }),
      fr: (v) => ({
        subject: 'À propos de votre devis',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Une mise à jour sur votre devis.',
          heading: 'À propos de votre devis',
          bodyHtml: paragraphs(
            `Le client n’a pas donné suite à votre devis pour « ${escapeHtml(v.jobTitle)} » cette fois.`,
            'D’autres missions cherchent vos compétences. Continuez.',
          ),
        }),
        text: `Le client a décliné votre devis pour « ${v.jobTitle} » sur Kavio.`,
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
            'Open Kavio to send a revised quote.',
          ),
        }),
        text: `The client asked for a counter-offer on "${v.jobTitle}". Open Kavio to revise your quote.`,
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
            'Ouvrez Kavio pour envoyer un devis révisé.',
          ),
        }),
        text: `Le client demande une contre-offre pour « ${v.jobTitle} ». Ouvrez Kavio pour réviser votre devis.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'Counter-offer requested', body: `For "${v.jobTitle}".` }),
      fr: (v) => ({ title: 'Contre-offre demandée', body: `Pour « ${v.jobTitle} ».` }),
    },
  },
};

// ── Payments & disputes (PAY-01…PAY-06, ADM-05) ──────────────────────────────

/** Localized plain-language failure copy, keyed on the coded reason (PAY-06). */
const FAILURE_COPY: Record<string, { en: string; fr: string }> = {
  insufficient_funds: {
    en: 'There were not enough funds on the account.',
    fr: 'Le solde du compte était insuffisant.',
  },
  operator_timeout: {
    en: 'The mobile operator did not respond in time. Please try again.',
    fr: 'L’opérateur mobile n’a pas répondu à temps. Veuillez réessayer.',
  },
  declined: {
    en: 'The payment was declined.',
    fr: 'Le paiement a été refusé.',
  },
  payment_failed: {
    en: 'The payment could not be completed.',
    fr: 'Le paiement n’a pas pu être effectué.',
  },
};

function failureLine(reasonKey: string, locale: Locale): string {
  const fallback = {
    en: 'The payment could not be completed.',
    fr: 'Le paiement n’a pas pu être effectué.',
  };
  const copy = FAILURE_COPY[reasonKey] ?? fallback;
  return copy[locale];
}

const paymentRequired: TemplateDefinition<'payment.required'> = {
  key: 'payment.required',
  category: NotificationCategory.PAYMENTS,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'Secure your booking with escrow',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Pay into escrow to confirm your booking.',
          heading: 'Almost there',
          bodyHtml: paragraphs(
            `Your quote was accepted. Pay ${xaf(v.amount, 'en')} into secure escrow to confirm the booking.`,
            'Your money is held safely and only released to the worker once you confirm the work is done.',
          ),
        }),
        text: `Pay ${xaf(v.amount, 'en')} into escrow to confirm your booking on Kavio.`,
      }),
      fr: (v) => ({
        subject: 'Sécurisez votre réservation via le séquestre',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Payez sous séquestre pour confirmer votre réservation.',
          heading: 'Presque terminé',
          bodyHtml: paragraphs(
            `Votre devis a été accepté. Payez ${xaf(v.amount, 'fr')} sous séquestre sécurisé pour confirmer la réservation.`,
            'Votre argent est conservé en sécurité et n’est versé au professionnel qu’une fois le travail confirmé.',
          ),
        }),
        text: `Payez ${xaf(v.amount, 'fr')} sous séquestre pour confirmer votre réservation sur Kavio.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({
        title: 'Confirm your booking',
        body: `Pay ${xaf(v.amount, 'en')} into escrow.`,
      }),
      fr: (v) => ({
        title: 'Confirmez la réservation',
        body: `Payez ${xaf(v.amount, 'fr')} sous séquestre.`,
      }),
    },
  },
};

const paymentReceived: TemplateDefinition<'payment.received'> = {
  key: 'payment.received',
  category: NotificationCategory.PAYMENTS,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'Payment secured, you can start',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'The client’s payment is held in escrow.',
          heading: 'Payment secured',
          bodyHtml: paragraphs(
            `The client’s payment of ${xaf(v.amount, 'en')} for "${escapeHtml(v.jobTitle)}" is now held safely in escrow.`,
            'You can start the work. Funds are released to your wallet once the client confirms completion.',
          ),
        }),
        text: `Payment of ${xaf(v.amount, 'en')} for "${v.jobTitle}" is secured in escrow. You can start.`,
      }),
      fr: (v) => ({
        subject: 'Paiement sécurisé, vous pouvez commencer',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Le paiement du client est sous séquestre.',
          heading: 'Paiement sécurisé',
          bodyHtml: paragraphs(
            `Le paiement du client de ${xaf(v.amount, 'fr')} pour « ${escapeHtml(v.jobTitle)} » est désormais sous séquestre sécurisé.`,
            'Vous pouvez commencer le travail. Les fonds sont versés sur votre portefeuille dès que le client confirme.',
          ),
        }),
        text: `Le paiement de ${xaf(v.amount, 'fr')} pour « ${v.jobTitle} » est sécurisé. Vous pouvez commencer.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'Payment secured', body: `"${v.jobTitle}", you can start.` }),
      fr: (v) => ({
        title: 'Paiement sécurisé',
        body: `« ${v.jobTitle} », vous pouvez commencer.`,
      }),
    },
  },
};

const escrowWorkAccepted: TemplateDefinition<'escrow.work_accepted'> = {
  key: 'escrow.work_accepted',
  category: NotificationCategory.JOBS,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'Your worker accepted the job',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Work will begin soon.',
          heading: 'Job accepted',
          bodyHtml: paragraphs(
            `The worker acknowledged "${escapeHtml(v.jobTitle)}" and will begin soon.`,
          ),
        }),
        text: `The worker acknowledged "${v.jobTitle}" and will begin soon.`,
      }),
      fr: (v) => ({
        subject: 'Votre prestataire a accepté le job',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Le travail va bientôt commencer.',
          heading: 'Job accepté',
          bodyHtml: paragraphs(
            `Le prestataire a confirmé « ${escapeHtml(v.jobTitle)} » et va bientôt commencer.`,
          ),
        }),
        text: `Le prestataire a confirmé « ${v.jobTitle} » et va bientôt commencer.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'Job accepted', body: `Your worker accepted "${v.jobTitle}".` }),
      fr: (v) => ({ title: 'Job accepté', body: `Votre prestataire a accepté « ${v.jobTitle} ».` }),
    },
  },
};

const escrowWorkStarted: TemplateDefinition<'escrow.work_started'> = {
  key: 'escrow.work_started',
  category: NotificationCategory.JOBS,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'Work has started',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Your worker started the job.',
          heading: 'Work started',
          bodyHtml: paragraphs(`The worker started "${escapeHtml(v.jobTitle)}".`),
        }),
        text: `The worker started "${v.jobTitle}".`,
      }),
      fr: (v) => ({
        subject: 'Le travail a commencé',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Votre prestataire a commencé le job.',
          heading: 'Travail commencé',
          bodyHtml: paragraphs(`Le prestataire a commencé « ${escapeHtml(v.jobTitle)} ».`),
        }),
        text: `Le prestataire a commencé « ${v.jobTitle} ».`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'Work started', body: `Your worker started "${v.jobTitle}".` }),
      fr: (v) => ({
        title: 'Travail commencé',
        body: `Votre prestataire a commencé « ${v.jobTitle} ».`,
      }),
    },
  },
};

const escrowWorkCompleted: TemplateDefinition<'escrow.work_completed'> = {
  key: 'escrow.work_completed',
  category: NotificationCategory.JOBS,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'Your worker marked the job done',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Confirm to release payment.',
          heading: 'Job marked done',
          bodyHtml: paragraphs(
            `The worker marked "${escapeHtml(v.jobTitle)}" as done.`,
            'Review the work and confirm completion on Kavio to release payment from escrow.',
          ),
        }),
        text: `The worker marked "${v.jobTitle}" as done. Review and confirm completion on Kavio to release payment.`,
      }),
      fr: (v) => ({
        subject: 'Votre prestataire a marqué le job comme terminé',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Confirmez pour libérer le paiement.',
          heading: 'Job marqué terminé',
          bodyHtml: paragraphs(
            `Le prestataire a marqué « ${escapeHtml(v.jobTitle)} » comme terminé.`,
            'Vérifiez le travail et confirmez sur Kavio pour libérer le paiement du séquestre.',
          ),
        }),
        text: `Le prestataire a marqué « ${v.jobTitle} » comme terminé. Vérifiez et confirmez sur Kavio pour libérer le paiement.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({
        title: 'Job marked done',
        body: `Confirm "${v.jobTitle}" to release payment.`,
      }),
      fr: (v) => ({
        title: 'Job marqué terminé',
        body: `Confirmez « ${v.jobTitle} » pour libérer le paiement.`,
      }),
    },
  },
};

const escrowReleased: TemplateDefinition<'escrow.released'> = {
  key: 'escrow.released',
  category: NotificationCategory.PAYMENTS,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'You’ve been paid',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Escrow released to your wallet.',
          heading: 'Payment released',
          bodyHtml: paragraphs(
            `The client confirmed "${escapeHtml(v.jobTitle)}" is done. ${xaf(v.amount, 'en')} has been released to your wallet.`,
            'You can withdraw it to your Mobile Money at any time.',
          ),
        }),
        text: `${xaf(v.amount, 'en')} for "${v.jobTitle}" has been released to your Kavio wallet.`,
      }),
      fr: (v) => ({
        subject: 'Vous avez été payé',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Séquestre versé sur votre portefeuille.',
          heading: 'Paiement versé',
          bodyHtml: paragraphs(
            `Le client a confirmé que « ${escapeHtml(v.jobTitle)} » est terminé. ${xaf(v.amount, 'fr')} ont été versés sur votre portefeuille.`,
            'Vous pouvez les retirer vers votre Mobile Money à tout moment.',
          ),
        }),
        text: `${xaf(v.amount, 'fr')} pour « ${v.jobTitle} » ont été versés sur votre portefeuille Kavio.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({
        title: 'You’ve been paid',
        body: `${xaf(v.amount, 'en')} for "${v.jobTitle}".`,
      }),
      fr: (v) => ({
        title: 'Vous avez été payé',
        body: `${xaf(v.amount, 'fr')} pour « ${v.jobTitle} ».`,
      }),
    },
  },
};

const escrowRefunded: TemplateDefinition<'escrow.refunded'> = {
  key: 'escrow.refunded',
  category: NotificationCategory.PAYMENTS,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'Your escrow was refunded',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Funds returned to your wallet.',
          heading: 'Refund issued',
          bodyHtml: paragraphs(
            `${xaf(v.amount, 'en')} held for "${escapeHtml(v.jobTitle)}" has been refunded to your wallet.`,
            'You can withdraw it to your Mobile Money at any time.',
          ),
        }),
        text: `${xaf(v.amount, 'en')} for "${v.jobTitle}" has been refunded to your Kavio wallet.`,
      }),
      fr: (v) => ({
        subject: 'Votre séquestre a été remboursé',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Fonds retournés sur votre portefeuille.',
          heading: 'Remboursement effectué',
          bodyHtml: paragraphs(
            `${xaf(v.amount, 'fr')} retenus pour « ${escapeHtml(v.jobTitle)} » ont été remboursés sur votre portefeuille.`,
            'Vous pouvez les retirer vers votre Mobile Money à tout moment.',
          ),
        }),
        text: `${xaf(v.amount, 'fr')} pour « ${v.jobTitle} » ont été remboursés sur votre portefeuille Kavio.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'Refund issued', body: `${xaf(v.amount, 'en')} for "${v.jobTitle}".` }),
      fr: (v) => ({
        title: 'Remboursement',
        body: `${xaf(v.amount, 'fr')} pour « ${v.jobTitle} ».`,
      }),
    },
  },
};

const paymentFailed: TemplateDefinition<'payment.failed'> = {
  key: 'payment.failed',
  category: NotificationCategory.PAYMENTS,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'Your payment did not go through',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'A payment could not be completed.',
          heading: 'Payment failed',
          bodyHtml: paragraphs(
            `Your payment of ${xaf(v.amount, 'en')} could not be completed. ${failureLine(v.reasonKey, 'en')}`,
            'No money has left your account. Please try again from Kavio.',
          ),
        }),
        text: `Your payment of ${xaf(v.amount, 'en')} failed: ${failureLine(v.reasonKey, 'en')}`,
      }),
      fr: (v) => ({
        subject: 'Votre paiement n’a pas abouti',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Un paiement n’a pas pu être effectué.',
          heading: 'Échec du paiement',
          bodyHtml: paragraphs(
            `Votre paiement de ${xaf(v.amount, 'fr')} n’a pas pu être effectué. ${failureLine(v.reasonKey, 'fr')}`,
            'Aucun montant n’a été débité. Veuillez réessayer depuis Kavio.',
          ),
        }),
        text: `Votre paiement de ${xaf(v.amount, 'fr')} a échoué : ${failureLine(v.reasonKey, 'fr')}`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'Payment failed', body: failureLine(v.reasonKey, 'en') }),
      fr: (v) => ({ title: 'Échec du paiement', body: failureLine(v.reasonKey, 'fr') }),
    },
  },
};

const disputeOpened: TemplateDefinition<'dispute.opened'> = {
  key: 'dispute.opened',
  category: NotificationCategory.DISPUTES,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'A dispute was opened',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'The escrow is frozen pending review.',
          heading: 'Dispute opened',
          bodyHtml: paragraphs(
            `A dispute has been opened on "${escapeHtml(v.jobTitle)}". The escrow is frozen while our team reviews it.`,
            'Open Kavio to add your side and any evidence.',
          ),
        }),
        text: `A dispute was opened on "${v.jobTitle}". The escrow is frozen pending review.`,
      }),
      fr: (v) => ({
        subject: 'Un litige a été ouvert',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Le séquestre est gelé en attendant l’examen.',
          heading: 'Litige ouvert',
          bodyHtml: paragraphs(
            `Un litige a été ouvert sur « ${escapeHtml(v.jobTitle)} ». Le séquestre est gelé pendant l’examen par notre équipe.`,
            'Ouvrez Kavio pour donner votre version et vos preuves.',
          ),
        }),
        text: `Un litige a été ouvert sur « ${v.jobTitle} ». Le séquestre est gelé.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'Dispute opened', body: `On "${v.jobTitle}". Escrow frozen.` }),
      fr: (v) => ({ title: 'Litige ouvert', body: `Sur « ${v.jobTitle} ». Séquestre gelé.` }),
    },
  },
};

const disputeResolved: TemplateDefinition<'dispute.resolved'> = {
  key: 'dispute.resolved',
  category: NotificationCategory.DISPUTES,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'Your dispute has been resolved',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'An outcome has been decided.',
          heading: 'Dispute resolved',
          bodyHtml: paragraphs(
            `The dispute on "${escapeHtml(v.jobTitle)}" has been resolved by our team.`,
            'Open Kavio to see the outcome and your updated wallet.',
          ),
        }),
        text: `The dispute on "${v.jobTitle}" has been resolved. Open Kavio to see the outcome.`,
      }),
      fr: (v) => ({
        subject: 'Votre litige a été résolu',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Une décision a été prise.',
          heading: 'Litige résolu',
          bodyHtml: paragraphs(
            `Le litige sur « ${escapeHtml(v.jobTitle)} » a été résolu par notre équipe.`,
            'Ouvrez Kavio pour voir la décision et votre portefeuille mis à jour.',
          ),
        }),
        text: `Le litige sur « ${v.jobTitle} » a été résolu. Ouvrez Kavio pour voir la décision.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'Dispute resolved', body: `On "${v.jobTitle}".` }),
      fr: (v) => ({ title: 'Litige résolu', body: `Sur « ${v.jobTitle} ».` }),
    },
  },
};

// ── Messaging, reviews, matching (MSG-01, TRU-*, JOB-04) ─────────────────────

const messageReceived: TemplateDefinition<'message.received'> = {
  key: 'message.received',
  category: NotificationCategory.MESSAGES,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: `New message from ${v.senderName}`,
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'You have a new message on Kavio.',
          heading: `Message from ${escapeHtml(v.senderName)}`,
          bodyHtml: paragraphs(escapeHtml(v.preview), 'Open Kavio to reply.'),
        }),
        text: `New message from ${v.senderName}: ${v.preview}`,
      }),
      fr: (v) => ({
        subject: `Nouveau message de ${v.senderName}`,
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Vous avez un nouveau message sur Kavio.',
          heading: `Message de ${escapeHtml(v.senderName)}`,
          bodyHtml: paragraphs(escapeHtml(v.preview), 'Ouvrez Kavio pour répondre.'),
        }),
        text: `Nouveau message de ${v.senderName} : ${v.preview}`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: v.senderName, body: v.preview }),
      fr: (v) => ({ title: v.senderName, body: v.preview }),
    },
  },
};

const reviewReceived: TemplateDefinition<'review.received'> = {
  key: 'review.received',
  category: NotificationCategory.REVIEWS,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'You received a new review',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'A client reviewed your work.',
          heading: 'New review',
          bodyHtml: paragraphs(
            `A client left you a ${v.rating}-star review for "${escapeHtml(v.jobTitle)}".`,
            'Every review builds your Trust Score and helps the next client choose you.',
          ),
        }),
        text: `You received a ${v.rating}-star review for "${v.jobTitle}" on Kavio.`,
      }),
      fr: (v) => ({
        subject: 'Vous avez reçu un nouvel avis',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Un client a évalué votre travail.',
          heading: 'Nouvel avis',
          bodyHtml: paragraphs(
            `Un client vous a laissé un avis de ${v.rating} étoiles pour « ${escapeHtml(v.jobTitle)} ».`,
            'Chaque avis renforce votre Score de Confiance et aide le prochain client à vous choisir.',
          ),
        }),
        text: `Vous avez reçu un avis de ${v.rating} étoiles pour « ${v.jobTitle} » sur Kavio.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'New review', body: `${v.rating}★ for "${v.jobTitle}".` }),
      fr: (v) => ({ title: 'Nouvel avis', body: `${v.rating}★ pour « ${v.jobTitle} ».` }),
    },
  },
};

const jobMatched: TemplateDefinition<'job.matched'> = {
  key: 'job.matched',
  category: NotificationCategory.JOBS,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'A new job matches your skills',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'A job near you is looking for someone like you.',
          heading: 'New job for you',
          bodyHtml: paragraphs(
            `A new job "${escapeHtml(v.jobTitle)}"${v.categoryName ? ` in ${escapeHtml(v.categoryName)}` : ''} was just posted near you.`,
            'Open it to review the details and send a quote before someone else does.',
          ),
        }),
        text: `A new job "${v.jobTitle}" matching your skills was posted on Kavio.`,
      }),
      fr: (v) => ({
        subject: 'Une nouvelle mission correspond à vos compétences',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Une mission près de chez vous cherche quelqu’un comme vous.',
          heading: 'Nouvelle mission pour vous',
          bodyHtml: paragraphs(
            `Une nouvelle mission « ${escapeHtml(v.jobTitle)} »${v.categoryName ? ` en ${escapeHtml(v.categoryName)}` : ''} vient d’être publiée près de chez vous.`,
            'Ouvrez-la pour consulter les détails et envoyer un devis avant les autres.',
          ),
        }),
        text: `Une nouvelle mission « ${v.jobTitle} » correspondant à vos compétences a été publiée sur Kavio.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({ title: 'New job for you', body: `"${v.jobTitle}" near you.` }),
      fr: (v) => ({ title: 'Nouvelle mission', body: `« ${v.jobTitle} » près de chez vous.` }),
    },
  },
};

// ── Safety (SOS-01) ──────────────────────────────────────────────────────────

const safetySosTriggered: TemplateDefinition<'safety.sos_triggered'> = {
  key: 'safety.sos_triggered',
  category: NotificationCategory.SAFETY,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: `Emergency: ${v.userName} triggered an SOS`,
        html: renderEmailLayout({
          locale: 'en',
          preheader: `${v.userName} may need help.`,
          heading: `${escapeHtml(v.userName)} triggered an SOS`,
          bodyHtml: paragraphs(
            `${escapeHtml(v.contactName)}, ${escapeHtml(v.userName)} has triggered an emergency SOS on Kavio and listed you as an emergency contact.`,
            ...(v.message ? [`They added: "${escapeHtml(v.message)}"`] : []),
            'Please check on them now.',
          ),
          ...(v.mapUrl ? { cta: { label: 'See their location', url: v.mapUrl } } : {}),
        }),
        text: `EMERGENCY: ${v.userName} triggered an SOS on Kavio.${v.message ? ` Message: ${v.message}.` : ''}${v.mapUrl ? ` Location: ${v.mapUrl}` : ''}`,
      }),
      fr: (v) => ({
        subject: `Urgence : ${v.userName} a déclenché un SOS`,
        html: renderEmailLayout({
          locale: 'fr',
          preheader: `${v.userName} a peut-être besoin d’aide.`,
          heading: `${escapeHtml(v.userName)} a déclenché un SOS`,
          bodyHtml: paragraphs(
            `${escapeHtml(v.contactName)}, ${escapeHtml(v.userName)} a déclenché un SOS d’urgence sur Kavio et vous a désigné comme contact d’urgence.`,
            ...(v.message ? [`Message ajouté : « ${escapeHtml(v.message)} »`] : []),
            'Merci de prendre de ses nouvelles immédiatement.',
          ),
          ...(v.mapUrl ? { cta: { label: 'Voir sa position', url: v.mapUrl } } : {}),
        }),
        text: `URGENCE : ${v.userName} a déclenché un SOS sur Kavio.${v.message ? ` Message : ${v.message}.` : ''}${v.mapUrl ? ` Position : ${v.mapUrl}` : ''}`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({
        title: `SOS: ${v.userName}`,
        body: 'Tap to see their location.',
        url: v.mapUrl || undefined,
      }),
      fr: (v) => ({
        title: `SOS : ${v.userName}`,
        body: 'Appuyez pour voir sa position.',
        url: v.mapUrl || undefined,
      }),
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry + lookup
// ─────────────────────────────────────────────────────────────────────────────

/** Mapped so `TEMPLATES[key]` stays correlated with the key's variables type. */
type TemplateMap = { [K in TemplateKey]: TemplateDefinition<K> };

// ─────────────────────────────────────────────────────────────────────────────
// Moderation (ADM-08)
// ─────────────────────────────────────────────────────────────────────────────

/** Localized name for each decision. The enum never reaches a user's screen. */
const ACTION_COPY: Record<string, { en: string; fr: string }> = {
  WARN: { en: 'a warning', fr: 'un avertissement' },
  CONTENT_REMOVED: { en: 'content removed', fr: 'un contenu retiré' },
  SUSPEND: { en: 'a temporary suspension', fr: 'une suspension temporaire' },
  BAN: { en: 'a permanent suspension', fr: 'une suspension définitive' },
  REINSTATE: { en: 'your account restored', fr: 'votre compte rétabli' },
  DISMISS: { en: 'no action', fr: 'aucune action' },
};

function actionLabel(action: string, locale: Locale): string {
  return ACTION_COPY[action]?.[locale] ?? ACTION_COPY[action]?.en ?? action;
}

const moderationActionTaken: TemplateDefinition<'moderation.action_taken'> = {
  key: 'moderation.action_taken',
  category: NotificationCategory.ACCOUNT,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'An update about your Kavio account',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'A moderation decision was made about your account.',
          heading: 'An update about your account',
          bodyHtml: paragraphs(
            `After reviewing a report, our team applied ${escapeHtml(actionLabel(v.action, 'en'))} to your account.`,
            `Reason given: ${escapeHtml(v.reason)}`,
            ...(v.expiresAt
              ? [`This lapses on ${escapeHtml(new Date(v.expiresAt).toDateString())}.`]
              : []),
            'If you believe this is a mistake, reply to this email and a person will look again.',
          ),
        }),
        text: `Kavio applied ${actionLabel(v.action, 'en')} to your account. Reason: ${v.reason}.${v.expiresAt ? ` Lapses ${new Date(v.expiresAt).toDateString()}.` : ''}`,
      }),
      fr: (v) => ({
        subject: 'Une mise à jour concernant votre compte Kavio',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Une décision de modération concerne votre compte.',
          heading: 'Mise à jour de votre compte',
          bodyHtml: paragraphs(
            `Après examen d’un signalement, notre équipe a appliqué ${escapeHtml(actionLabel(v.action, 'fr'))} à votre compte.`,
            `Motif indiqué : ${escapeHtml(v.reason)}`,
            ...(v.expiresAt
              ? [`Cette mesure prend fin le ${escapeHtml(new Date(v.expiresAt).toDateString())}.`]
              : []),
            'Si vous pensez qu’il s’agit d’une erreur, répondez à cet e-mail et une personne réexaminera le dossier.',
          ),
        }),
        text: `Kavio a appliqué ${actionLabel(v.action, 'fr')} à votre compte. Motif : ${v.reason}.${v.expiresAt ? ` Fin le ${new Date(v.expiresAt).toDateString()}.` : ''}`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({
        title: 'An update about your account',
        body: `Our team applied ${actionLabel(v.action, 'en')}. Tap to read why.`,
      }),
      fr: (v) => ({
        title: 'Mise à jour de votre compte',
        body: `Notre équipe a appliqué ${actionLabel(v.action, 'fr')}. Appuyez pour en savoir plus.`,
      }),
    },
  },
};

const moderationReportReceived: TemplateDefinition<'moderation.report_received'> = {
  key: 'moderation.report_received',
  category: NotificationCategory.ACCOUNT,
  render: {
    [NotificationChannel.EMAIL]: {
      en: (v) => ({
        subject: 'New content report awaiting review',
        html: renderEmailLayout({
          locale: 'en',
          preheader: 'Something was reported and needs a decision.',
          heading: 'New content report',
          bodyHtml: paragraphs(
            `A ${escapeHtml(v.targetType.toLowerCase().replace(/_/g, ' '))} was reported${v.targetLabel ? `: "${escapeHtml(v.targetLabel)}"` : ''}.`,
            'Open the moderation workspace to review it.',
          ),
        }),
        text: `New content report on a ${v.targetType.toLowerCase().replace(/_/g, ' ')}${v.targetLabel ? `: "${v.targetLabel}"` : ''}.`,
      }),
      fr: (v) => ({
        subject: 'Nouveau signalement à examiner',
        html: renderEmailLayout({
          locale: 'fr',
          preheader: 'Un contenu a été signalé et attend une décision.',
          heading: 'Nouveau signalement',
          bodyHtml: paragraphs(
            `Un élément (${escapeHtml(v.targetType.toLowerCase().replace(/_/g, ' '))}) a été signalé${v.targetLabel ? ` : « ${escapeHtml(v.targetLabel)} »` : ''}.`,
            'Ouvrez l’espace de modération pour l’examiner.',
          ),
        }),
        text: `Nouveau signalement (${v.targetType.toLowerCase().replace(/_/g, ' ')})${v.targetLabel ? ` : « ${v.targetLabel} »` : ''}.`,
      }),
    },
    [NotificationChannel.WEB_PUSH]: {
      en: (v) => ({
        title: 'New content report',
        body: v.targetLabel ? `"${v.targetLabel}" was reported.` : 'Something was reported.',
      }),
      fr: (v) => ({
        title: 'Nouveau signalement',
        body: v.targetLabel ? `« ${v.targetLabel} » a été signalé.` : 'Un contenu a été signalé.',
      }),
    },
  },
};

const TEMPLATES: TemplateMap = {
  'system.test_notification': testNotification,
  'account.welcome': accountWelcome,
  'auth.otp_code': authOtpCode,
  'auth.password_reset': authPasswordReset,
  'admin.agent_invited': adminAgentInvited,
  'admin.announcement_published': adminAnnouncementPublished,
  'business.team_invited': businessTeamInvited,
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
  'job.cancelled': jobCancelled,
  'quote.received': quoteReceived,
  'quote.accepted': quoteAccepted,
  'quote.declined': quoteDeclined,
  'quote.counter_requested': quoteCounterRequested,
  'payment.required': paymentRequired,
  'payment.received': paymentReceived,
  'escrow.work_accepted': escrowWorkAccepted,
  'escrow.work_started': escrowWorkStarted,
  'escrow.work_completed': escrowWorkCompleted,
  'escrow.released': escrowReleased,
  'escrow.refunded': escrowRefunded,
  'payment.failed': paymentFailed,
  'dispute.opened': disputeOpened,
  'dispute.resolved': disputeResolved,
  'message.received': messageReceived,
  'review.received': reviewReceived,
  'job.matched': jobMatched,
  'safety.sos_triggered': safetySosTriggered,
  'moderation.action_taken': moderationActionTaken,
  'moderation.report_received': moderationReportReceived,
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];

export function isTemplateKey(value: string): value is TemplateKey {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, value);
}

export function getTemplate<K extends TemplateKey>(key: K): TemplateDefinition<K> {
  return TEMPLATES[key];
}

/**
 * Channels this template can actually be delivered on (has copy for).
 *
 * IN_APP has no renderers of its own: it reuses the WEB_PUSH copy, which is
 * already "one line + one deep link" in both locales for every template. So a
 * template that can be pushed can also land in the inbox, and the two can never
 * drift apart into different wordings of the same event.
 */
export function getSupportedChannels(key: TemplateKey): NotificationChannel[] {
  const { render } = getTemplate(key);

  // The four channels that own renderers are keys of `Renderers` — IN_APP
  // is derived below, so it is deliberately not in this list.
  const RENDERABLE = [
    NotificationChannel.EMAIL,
    NotificationChannel.WEB_PUSH,
    NotificationChannel.SMS,
    NotificationChannel.WHATSAPP,
  ] as const;

  const supported: NotificationChannel[] = RENDERABLE.filter(
    (channel) => render[channel] !== undefined,
  );

  if (render[NotificationChannel.WEB_PUSH] !== undefined) {
    supported.push(NotificationChannel.IN_APP);
  }

  return supported;
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
    case NotificationChannel.WHATSAPP: {
      const byLocale = render[NotificationChannel.WHATSAPP];
      if (!byLocale) return null;
      const fn = byLocale[locale] ?? byLocale.en;
      return { channel: 'WHATSAPP', content: fn(variables as never) };
    }
    case NotificationChannel.IN_APP: {
      // Deliberately no IN_APP renderers: the inbox reuses the push copy (see
      // getSupportedChannels). `url` is carried through as the deep link.
      const byLocale = render[NotificationChannel.WEB_PUSH];
      if (!byLocale) return null;
      const fn = byLocale[locale] ?? byLocale.en;
      const push = fn(variables as never);
      return {
        channel: 'IN_APP',
        content: {
          title: push.title,
          body: push.body,
          ...(push.url ? { url: push.url } : {}),
        },
      };
    }
    default:
      return null;
  }
}
