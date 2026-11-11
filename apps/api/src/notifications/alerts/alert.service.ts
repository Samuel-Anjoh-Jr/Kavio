import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import type { Prisma } from '@kavio/database';
import admin from 'firebase-admin';
import webpush from 'web-push';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Job } from 'bullmq';
import { createLogger } from '../../lib/logger';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueService } from '../../queue/queue.service';
import { QUEUE_NAMES } from '../../queue/queue.constants';
import { getAppBaseUrl } from '../notification.config';
import { buildAlertMessages, type AlertContent } from './alert-fcm';
import {
  alertActions,
  normalizeAlertSettings,
  resolveAlert,
  type AlertSettings,
  type ResolvedAlert,
} from './alert-profiles';
import { pickProvider, toE164Cameroon } from './escalation-providers';

const logger = createLogger('notifications:alerts');

export const ALERT_SETTING_KEYS = {
  alerts: 'notifications.alerts',
  ringLoopSeconds: 'notifications.ringLoopSeconds',
} as const;

const SETTINGS_TTL_MS = 15_000;
const MAX_ESCALATION_AGE_MS = 60 * 60_000;
const GONE_STATUS = new Set([404, 410]);
const FCM_ENDPOINT_PREFIX = 'fcm:';

interface EscalationJob {
  deliveryId: string;
  stepIndex: number;
}

export interface DeliveryInput {
  userId: string;
  templateKey: string;
  category?: string;
  userSoundKey?: string | null;
  locale: 'en' | 'fr';
  title: string;
  body: string;
  /** Absolute or app-relative URL the notification opens. */
  url?: string;
  tag?: string;
  relevantRole?: string;
  /** For rings: what the alert is about, so it can be resolved/escalated. */
  entity?: { type: 'booking' | 'job' | 'sos'; id: string } | null;
}

/**
 * Device delivery and ringing for Kavio (NOT-02 + alerts):
 *  - fans one push out to every active device of the user — web-push
 *    subscriptions (VAPID) and native app tokens (FCM, Capacitor build);
 *  - applies the admin alert profile (ring / once / silent) to the payload;
 *  - records ringing alerts and runs the escalation ladder on BullMQ until
 *    acknowledged or the booking no longer needs that person.
 */
@Injectable()
export class AlertService implements OnModuleInit {
  private settingsCache: { at: number; value: AlertSettings } | null = null;
  private readonly vapid?: { subject: string; publicKey: string; privateKey: string };
  private firebaseReady: boolean | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly queue?: QueueService,
  ) {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      this.vapid = {
        subject: process.env.VAPID_SUBJECT?.trim() || 'mailto:support@kavio.cm',
        publicKey: process.env.VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY,
      };
    }
  }

  onModuleInit(): void {
    this.queue?.registerWorker<EscalationJob>(QUEUE_NAMES.alerts, (job: Job<EscalationJob>) =>
      this.runStep(job.data.deliveryId, job.data.stepIndex),
    );
  }

  hasWebPush(): boolean {
    return Boolean(this.vapid);
  }

  async settings(): Promise<AlertSettings> {
    if (this.settingsCache && Date.now() - this.settingsCache.at < SETTINGS_TTL_MS) {
      return this.settingsCache.value;
    }
    try {
      const rows = await this.prisma.client.systemSetting.findMany({
        where: { key: { in: [ALERT_SETTING_KEYS.alerts, ALERT_SETTING_KEYS.ringLoopSeconds] } },
        select: { key: true, value: true },
      });
      const byKey = new Map(rows.map((r) => [r.key, r.value]));
      const value = normalizeAlertSettings(
        byKey.get(ALERT_SETTING_KEYS.alerts),
        byKey.get(ALERT_SETTING_KEYS.ringLoopSeconds),
      );
      this.settingsCache = { at: Date.now(), value };
      return value;
    } catch (error) {
      logger.warn('Alert settings read failed; using defaults', {
        payload: { error: error instanceof Error ? error.message : String(error) },
      });
      return this.settingsCache?.value ?? normalizeAlertSettings({});
    }
  }

  /**
   * Sends one notification to every active device of the user. Returns how
   * many devices accepted it and how many failed transiently (for retries).
   */
  async deliver(input: DeliveryInput): Promise<{ delivered: number; transientFailures: number }> {
    const settings = await this.settings();
    const alert = resolveAlert(settings, input.templateKey, input.category, input.userSoundKey);

    let alertId: string | undefined;
    if (alert.tier === 'ring' && input.entity) {
      const row = await this.prisma.client.alertDelivery
        .create({
          data: {
            userId: input.userId,
            templateKey: input.templateKey,
            entityType: input.entity.type,
            entityId: input.entity.id,
            title: input.title,
            body: input.body,
            path: input.url ?? '/',
            locale: input.locale,
          },
          select: { id: true },
        })
        .catch(() => null);
      alertId = row?.id;
    }

    const result = await this.sendToDevices(input.userId, alert, {
      title: input.title,
      body: input.body,
      data: input.relevantRole ? { relevantRole: input.relevantRole } : {},
      path: input.url ?? '/',
      // Distinct notices never replace each other; the same subject does.
      tag: input.entity
        ? `${input.entity.type}-${input.entity.id}`
        : (input.tag ?? `${input.templateKey}:${Date.now()}`),
      alertId,
      ackUrl: alertId ? this.ackUrl(alertId) : undefined,
      actions: alertActions(input.templateKey, input.locale),
    });

    if (alertId && alert.escalate && this.queue) {
      await Promise.all(
        settings.escalation.steps.map((step, stepIndex) =>
          this.queue!.enqueue<EscalationJob>(
            QUEUE_NAMES.alerts,
            'step',
            { deliveryId: alertId, stepIndex },
            { jobId: `esc:${alertId}:${stepIndex}`, delay: step.afterSeconds * 1000, attempts: 2 },
          ),
        ),
      ).catch((error: unknown) =>
        logger.warn('Escalation scheduling failed', {
          payload: { error: error instanceof Error ? error.message : String(error) },
        }),
      );
    }
    return result;
  }

  private async sendToDevices(
    userId: string,
    alert: ResolvedAlert,
    content: AlertContent,
  ): Promise<{ delivered: number; transientFailures: number }> {
    const devices = await this.prisma.client.deviceRegistration.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        endpoint: true,
        p256dh: true,
        auth: true,
        platform: true,
        alertsVersion: true,
      },
    });
    let delivered = 0;
    let transientFailures = 0;

    const native = devices.filter((d) => d.endpoint.startsWith(FCM_ENDPOINT_PREFIX));
    const web = devices.filter((d) => !d.endpoint.startsWith(FCM_ENDPOINT_PREFIX));

    if (web.length && this.vapid) {
      const ttl =
        alert.tier === 'ring' ? alert.loopSeconds + 300 : alert.tier === 'silent' ? 600 : 86_400;
      const payload = JSON.stringify({
        // Fields the service worker always understood…
        title: content.title,
        body: content.body,
        url: content.path,
        tag: content.tag,
        relevantRole: content.data.relevantRole,
        soundKey: alert.tier === 'silent' ? 'silent' : alert.sound,
        // …and the alerts-v2 profile (public/sw.js).
        kv: '2',
        event: alert.event,
        tier: alert.tier,
        sound: alert.sound,
        loopSeconds: alert.loopSeconds,
        vibration: alert.vibration,
        actions: content.actions,
        alertId: content.alertId,
        ackUrl: content.ackUrl,
      });
      for (const sub of web) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            {
              vapidDetails: this.vapid,
              TTL: ttl,
              urgency: alert.tier === 'ring' ? 'high' : alert.tier === 'silent' ? 'low' : 'normal',
            },
          );
          delivered += 1;
          await this.prisma.client.deviceRegistration.update({
            where: { id: sub.id },
            data: { lastSeenAt: new Date() },
          });
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode !== undefined && GONE_STATUS.has(statusCode)) {
            await this.prisma.client.deviceRegistration.update({
              where: { id: sub.id },
              data: { isActive: false },
            });
          } else {
            transientFailures += 1;
            logger.warn('Web push delivery failed (will retry)', {
              payload: { endpointHost: safeHost(sub.endpoint), statusCode },
            });
          }
        }
      }
    }

    if (native.length && this.ensureFirebase()) {
      const targets = native.map((d) => ({
        token: d.endpoint.slice(FCM_ENDPOINT_PREFIX.length),
        platform: d.platform === 'IOS' ? 'ios' : 'android',
        alertsVersion: d.alertsVersion,
      }));
      const messages = buildAlertMessages(targets, alert, content);
      try {
        const response = await admin.messaging().sendEach(messages);
        response.responses.forEach((res, i) => {
          if (res.success) {
            delivered += 1;
            return;
          }
          const code = res.error?.code ?? '';
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            void this.prisma.client.deviceRegistration
              .update({ where: { id: native[i]!.id }, data: { isActive: false } })
              .catch(() => undefined);
          } else {
            transientFailures += 1;
          }
        });
      } catch (error) {
        transientFailures += native.length;
        logger.warn('Native push failed', {
          payload: { error: error instanceof Error ? error.message : String(error) },
        });
      }
    }
    return { delivered, transientFailures };
  }

  private ensureFirebase(): boolean {
    if (this.firebaseReady !== null) return this.firebaseReady;
    if (admin.apps.length > 0) return (this.firebaseReady = true);
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) return (this.firebaseReady = false);
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    return (this.firebaseReady = true);
  }

  async ack(alertId: string, source: string, userId?: string): Promise<boolean> {
    const row = await this.prisma.client.alertDelivery.findUnique({
      where: { id: alertId },
      select: { id: true, userId: true, ackedAt: true, entityType: true, entityId: true },
    });
    if (!row || (userId && row.userId !== userId)) return false;
    if (!row.ackedAt) {
      await this.prisma.client.alertDelivery.update({
        where: { id: alertId },
        data: { ackedAt: new Date(), ackSource: source.slice(0, 60) },
      });
      // Answered on one device: stop the ring on the person's other phones.
      await this.cancelOnDevices([row.userId], `${row.entityType}-${row.entityId}`, 'acked');
    }
    return true;
  }

  /** The booking/job no longer needs these people: stop ladders, stop rings. */
  async resolve(
    entityType: 'booking' | 'job' | 'sos',
    entityId: string,
    reason: string,
    onlyUserId?: string,
  ): Promise<void> {
    try {
      const open = await this.prisma.client.alertDelivery.findMany({
        where: {
          entityType,
          entityId,
          ackedAt: null,
          ...(onlyUserId ? { userId: onlyUserId } : {}),
        },
        select: { id: true, userId: true },
      });
      if (!open.length) return;
      await this.prisma.client.alertDelivery.updateMany({
        where: { id: { in: open.map((r) => r.id) }, ackedAt: null },
        data: { ackedAt: new Date(), ackSource: `resolved:${reason}`.slice(0, 60) },
      });
      await this.cancelOnDevices(
        [...new Set(open.map((r) => r.userId))],
        `${entityType}-${entityId}`,
        reason,
      );
    } catch (error) {
      logger.warn('Alert resolve failed', {
        payload: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  async runStep(deliveryId: string, stepIndex: number): Promise<void> {
    const row = await this.prisma.client.alertDelivery.findUnique({ where: { id: deliveryId } });
    if (!row || row.ackedAt) return;
    if (Date.now() - row.sentAt.getTime() > MAX_ESCALATION_AGE_MS) {
      await this.prisma.client.alertDelivery.update({
        where: { id: deliveryId },
        data: { ackedAt: new Date(), ackSource: 'expired' },
      });
      return;
    }
    const settings = await this.settings();
    const step = settings.escalation.steps[stepIndex];
    if (!settings.escalation.enabled || !step) return;
    const channel = settings.escalation.channels[step.channel] as {
      enabled: boolean;
      provider?: string;
    };
    if (!channel?.enabled) return;
    const locale: 'en' | 'fr' = row.locale === 'en' ? 'en' : 'fr';
    let outcome: { ok: boolean; provider: string; ref?: string; error?: string };

    if (step.channel === 'push') {
      const alert = resolveAlert(settings, row.templateKey);
      const r = await this.sendToDevices(row.userId, alert, {
        title: row.title,
        body: row.body,
        data: {},
        path: row.path,
        tag: `${row.entityType}-${row.entityId}`,
        alertId: row.id,
        ackUrl: this.ackUrl(row.id),
        actions: alertActions(row.templateKey, locale),
        isRepeat: true,
      });
      outcome = { ok: r.delivered > 0, provider: 'push' };
    } else {
      const user = await this.prisma.client.user.findUnique({
        where: { id: row.userId },
        select: { phone: true },
      });
      const to = toE164Cameroon(user?.phone);
      const providerName = channel.provider ?? 'twilio';
      const provider = pickProvider(step.channel, providerName);
      const link = row.path.startsWith('http') ? row.path : `${getAppBaseUrl()}${row.path}`;
      if (!to) outcome = { ok: false, provider: providerName, error: 'no usable phone number' };
      else if (!provider)
        outcome = { ok: false, provider: providerName, error: 'provider keys missing' };
      else {
        const fr = locale === 'fr';
        try {
          const r = await provider.send({
            to,
            locale,
            text: `${fr ? 'Kavio : action requise' : 'Kavio: action needed'}. ${row.title}. ${row.body} ${link}`,
            templateVars: [row.title, row.body, link],
            voiceText: fr
              ? `Bonjour, ici Kavio. ${row.title}. Ouvrez l'application Kavio pour répondre.`
              : `Hello, this is Kavio. ${row.title}. Please open the Kavio app to respond.`,
          });
          outcome = { ok: r.ok, provider: provider.name, ref: r.providerRef, error: r.error };
        } catch (error) {
          outcome = {
            ok: false,
            provider: provider.name,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    }
    logger.info('Escalation step ran', {
      payload: {
        deliveryId,
        step: stepIndex,
        channel: step.channel,
        provider: outcome.provider,
        ok: outcome.ok,
        error: outcome.error,
      },
    });
    const previous = Array.isArray(row.outcomes) ? row.outcomes : [];
    await this.prisma.client.alertDelivery.update({
      where: { id: deliveryId },
      data: {
        step: Math.max(row.step, stepIndex + 1),
        outcomes: [
          ...previous,
          { step: stepIndex + 1, channel: step.channel, ...outcome, at: new Date().toISOString() },
        ] as Prisma.InputJsonValue,
      },
    });
  }

  private secret(): string {
    return (
      process.env.ALERTS_ACK_SECRET ||
      process.env.JWT_ACCESS_SECRET ||
      process.env.AUTH_SECRET ||
      'kavio-alerts-dev'
    );
  }

  /**
   * Data-only "cancel" to the native app (alerts v2), which stops the ring
   * service and removes the banner with that tag. Web push is not sent a
   * cancel: browsers require every push to show a notification, and a web
   * ring stops on its own after the loop length.
   */
  private async cancelOnDevices(userIds: string[], tag: string, reason: string): Promise<void> {
    if (!userIds.length || !this.ensureFirebase()) return;
    try {
      const devices = await this.prisma.client.deviceRegistration.findMany({
        where: {
          userId: { in: userIds },
          isActive: true,
          endpoint: { startsWith: FCM_ENDPOINT_PREFIX },
          alertsVersion: { gte: 2 },
        },
        select: { endpoint: true },
      });
      if (!devices.length) return;
      await admin.messaging().sendEach(
        devices.map((d) => ({
          token: d.endpoint.slice(FCM_ENDPOINT_PREFIX.length),
          data: { kv: '2', tier: 'cancel', tag, reason },
          android: { priority: 'high' as const, ttl: 120_000 },
        })),
      );
    } catch (error) {
      logger.warn('Alert cancel failed', {
        payload: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  ackToken(alertId: string): string {
    return createHmac('sha256', this.secret())
      .update(`ack:${alertId}`)
      .digest('base64url')
      .slice(0, 32);
  }

  verifyAckToken(alertId: string, token: string): boolean {
    const a = Buffer.from(this.ackToken(alertId));
    const b = Buffer.from(String(token || ''));
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private ackUrl(alertId: string): string {
    const base = (
      process.env.ALERTS_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'https://api.kavio.cm'
    ).replace(/\/$/, '');
    return `${base}/alerts/${encodeURIComponent(alertId)}/ack?t=${this.ackToken(alertId)}`;
  }
}

function safeHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'invalid-endpoint';
  }
}
