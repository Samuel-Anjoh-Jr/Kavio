import { NotificationCategory, NotificationChannel, NotificationStatus } from '@kavio/database';
import { NotificationRequestedEvent } from './events/notification.events';
import { getChannelPriority } from './notification.config';
import { NotificationDispatcher } from './notification-dispatcher.service';
import { NotificationPreferenceService } from './notification-preference.service';
import type { NotificationSoundPreferenceService } from './notification-sound-preference.service';
import { EmailProvider } from './providers/email.provider';
import { InAppProvider } from './providers/in-app.provider';
import { NotificationProviderRegistry } from './providers/provider.registry';
import { SmsProvider } from './providers/sms.provider';
import { WebPushProvider } from './providers/web-push.provider';
import type { PrismaService } from '../prisma/prisma.service';
import type { QueueService } from '../queue/queue.service';
import type { NotificationDeliveryJob } from './notification.types';

/** A sound service stub — these tests exercise channel selection, not sound resolution. */
const sounds = {
  resolve: jest.fn().mockResolvedValue('default'),
} as unknown as NotificationSoundPreferenceService;

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'awa@example.cm',
  phone: '+237655555555',
  locale: 'en',
};

/** The shape the dispatcher writes to notificationLog.create — typed so the
 * assertions below are checked rather than reaching through `any`. */
interface CreateLogArgs {
  data: {
    userId: string | null;
    channel: NotificationChannel;
    provider: string;
    recipient: string;
    templateKey: string;
    status: NotificationStatus;
    metadata: Record<string, unknown>;
  };
  select: { id: true };
}

type CreateLogMock = jest.Mock<Promise<{ id: string }>, [CreateLogArgs]>;
type EnqueueMock = jest.Mock<Promise<{ id: string }>, [string, string, NotificationDeliveryJob]>;
type FindPreferencesMock = jest.Mock<
  Promise<Array<{ channel: NotificationChannel; enabled: boolean }>>,
  [unknown]
>;

interface Harness {
  dispatcher: NotificationDispatcher;
  createLog: CreateLogMock;
  enqueue: EnqueueMock;
  findPreferences: FindPreferencesMock;
  /** Delivery jobs handed to the "notifications" queue. */
  jobs: () => NotificationDeliveryJob[];
  /** The data payload of the nth NotificationLog row written. */
  loggedRow: (index?: number) => CreateLogArgs['data'];
  /**
   * The NotificationLog row for one channel. Preferred over `loggedRow(0)` since
   * IN_APP was added ahead of the outward channels in the priority order — an
   * index-based assertion silently starts testing a different channel.
   */
  loggedRowFor: (channel: NotificationChannel) => CreateLogArgs['data'] | undefined;
}

/**
 * Builds a dispatcher over mocked Prisma/queue with a real provider registry, so
 * the feature-flag behaviour under test is the production code path.
 */
function makeHarness(
  env: NodeJS.ProcessEnv = {},
  options: { user?: typeof USER | null; disabled?: NotificationChannel[] } = {},
): Harness {
  const user = options.user === undefined ? USER : options.user;

  const findUnique = jest.fn().mockResolvedValue(user);
  const createLog: CreateLogMock = jest
    .fn<Promise<{ id: string }>, [CreateLogArgs]>()
    .mockImplementation(() => Promise.resolve({ id: `log-${createLog.mock.calls.length}` }));
  const findPreferences: FindPreferencesMock = jest
    .fn<Promise<Array<{ channel: NotificationChannel; enabled: boolean }>>, [unknown]>()
    .mockResolvedValue((options.disabled ?? []).map((channel) => ({ channel, enabled: false })));

  const prisma = {
    client: {
      user: { findUnique },
      notificationLog: { create: createLog },
      notificationPreference: { findMany: findPreferences },
      // P76: the dispatcher reads the device registry to decide push reachability.
      deviceRegistration: { findMany: jest.fn().mockResolvedValue([]) },
    },
  } as unknown as PrismaService;

  const enqueue: EnqueueMock = jest
    .fn<Promise<{ id: string }>, [string, string, NotificationDeliveryJob]>()
    .mockResolvedValue({ id: 'job-1' });
  const queue = { enqueue } as unknown as QueueService;

  const registry = new NotificationProviderRegistry(
    new EmailProvider(env),
    new WebPushProvider(prisma, sounds, env),
    new SmsProvider(env),
    new InAppProvider(prisma, sounds),
  );

  const dispatcher = new NotificationDispatcher(
    prisma,
    new NotificationPreferenceService(prisma),
    registry,
    queue,
    getChannelPriority(env),
  );

  return {
    dispatcher,
    createLog,
    enqueue,
    findPreferences,
    jobs: () => enqueue.mock.calls.map((call) => call[2]),
    loggedRow: (index = 0) => createLog.mock.calls[index]![0].data,
    loggedRowFor: (channel) =>
      createLog.mock.calls.map((call) => call[0].data).find((row) => row.channel === channel),
  };
}

describe('NotificationDispatcher', () => {
  describe('email delivery (console backend in dev)', () => {
    it('dispatches a test event over email and logs a PENDING attempt', async () => {
      const h = makeHarness({ NOTIFICATIONS_EMAIL_PROVIDER: 'console' });

      const logIds = await h.dispatcher.dispatch(
        new NotificationRequestedEvent({
          userId: USER.id,
          templateKey: 'system.test_notification',
          variables: { message: 'hello' },
        }),
      );

      // Two attempts: the in-app inbox row and the email. IN_APP is a channel
      // like any other and leads the priority order (NOT-02).
      expect(logIds).toHaveLength(2);
      expect(h.createLog).toHaveBeenCalledTimes(2);

      // A row exists for the attempt before any provider call, keyed by
      // templateKey — never rendered content.
      const logged = h.loggedRowFor(NotificationChannel.EMAIL);
      expect(logged).toMatchObject({
        userId: USER.id,
        channel: NotificationChannel.EMAIL,
        provider: 'console',
        recipient: USER.email,
        templateKey: 'system.test_notification',
        status: NotificationStatus.PENDING,
      });

      // Delivery is queued, not sent inline.
      const job = h.jobs().find((j) => j.channel === NotificationChannel.EMAIL);
      expect(job).toMatchObject({
        channel: NotificationChannel.EMAIL,
        templateKey: 'system.test_notification',
        category: NotificationCategory.ACCOUNT,
        locale: 'en',
      });
    });

    it('uses the resend backend when an API key is configured', async () => {
      const h = makeHarness({ RESEND_API_KEY: 'test-key' });

      await h.dispatcher.dispatch(
        new NotificationRequestedEvent({
          userId: USER.id,
          templateKey: 'system.test_notification',
          variables: { message: 'hello' },
        }),
      );

      expect(h.loggedRowFor(NotificationChannel.EMAIL)?.provider).toBe('resend');
    });

    it('honours the recipient locale so FR users get FR copy', async () => {
      const h = makeHarness({}, { user: { ...USER, locale: 'fr' } });

      await h.dispatcher.dispatch(
        new NotificationRequestedEvent({
          userId: USER.id,
          templateKey: 'system.test_notification',
          variables: { message: 'bonjour' },
        }),
      );

      expect(h.jobs()[0]?.locale).toBe('fr');
    });
  });

  describe('preferences', () => {
    it('respects a disabled preference and produces no delivery', async () => {
      // Both reachable channels are opted out — IN_APP is a preference cell like
      // any other, so muting only EMAIL would still leave an inbox row.
      const h = makeHarness(
        {},
        { disabled: [NotificationChannel.EMAIL, NotificationChannel.IN_APP] },
      );

      const logIds = await h.dispatcher.dispatch(
        new NotificationRequestedEvent({
          userId: USER.id,
          templateKey: 'system.test_notification',
          variables: { message: 'hello' },
        }),
      );

      expect(logIds).toEqual([]);
      expect(h.createLog).not.toHaveBeenCalled();
      expect(h.enqueue).not.toHaveBeenCalled();
    });

    it('lets a security-critical template bypass a disabled preference', async () => {
      const h = makeHarness({}, { disabled: [NotificationChannel.EMAIL] });

      const logIds = await h.dispatcher.dispatch(
        new NotificationRequestedEvent({
          userId: USER.id,
          templateKey: 'auth.password_reset',
          variables: { resetUrl: 'https://kavio.cm/reset/abc', expiresInMinutes: 30 },
        }),
      );

      // Delivered anyway, by email, and the preference table is never consulted.
      expect(logIds).toHaveLength(1);
      expect(h.findPreferences).not.toHaveBeenCalled();
      expect(h.loggedRow().channel).toBe(NotificationChannel.EMAIL);
    });

    it('treats a missing preference row as enabled', async () => {
      const h = makeHarness({}, { disabled: [] });

      const logIds = await h.dispatcher.dispatch(
        new NotificationRequestedEvent({
          userId: USER.id,
          templateKey: 'system.test_notification',
          variables: { message: 'hello' },
        }),
      );

      // In-app + email: both reachable, neither opted out.
      expect(logIds).toHaveLength(2);
    });
  });

  describe('SMS feature flag', () => {
    const event = () =>
      new NotificationRequestedEvent({
        userId: USER.id,
        templateKey: 'system.test_notification',
        variables: { message: 'hello' },
      });

    it('skips SMS entirely while the flag is OFF', async () => {
      const h = makeHarness({ NOTIFICATIONS_SMS_ENABLED: 'false' });

      await h.dispatcher.dispatch(event());

      expect(h.jobs().map((j) => j.channel)).toEqual([
        NotificationChannel.IN_APP,
        NotificationChannel.EMAIL,
      ]);
    });

    it('routes to the SMS stub when the flag is flipped ON, with no call-site change', async () => {
      // Identical event, identical dispatch site — only the flag differs.
      const h = makeHarness({ NOTIFICATIONS_SMS_ENABLED: 'true' });

      await h.dispatcher.dispatch(event());

      const jobs = h.jobs();
      const sms = jobs.find((j) => j.channel === NotificationChannel.SMS);
      expect(sms).toBeDefined();
      expect(sms?.providerName).toBe('sms-stub');
      // The E.164 number captured at sign-up is already send-ready.
      expect(sms?.address).toBe(USER.phone);
      // Email still goes out too; SMS is additive, ordered by channel priority.
      expect(jobs.map((j) => j.channel)).toEqual([
        NotificationChannel.IN_APP,
        NotificationChannel.EMAIL,
        NotificationChannel.SMS,
      ]);
    });
  });

  describe('channel selection', () => {
    it('skips web push when no device subscription exists yet', async () => {
      const h = makeHarness({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' });

      await h.dispatcher.dispatch(
        new NotificationRequestedEvent({
          userId: USER.id,
          templateKey: 'system.test_notification',
          variables: { message: 'hello' },
        }),
      );

      // Push is enabled but unreachable (no live subscription) → falls through to
      // the channels that can reach them: the in-app inbox and email.
      expect(h.jobs().map((j) => j.channel)).toEqual([
        NotificationChannel.IN_APP,
        NotificationChannel.EMAIL,
      ]);
    });

    it('follows a configured channel priority order', async () => {
      const h = makeHarness({
        NOTIFICATIONS_SMS_ENABLED: 'true',
        NOTIFICATIONS_CHANNEL_PRIORITY: 'SMS,EMAIL',
      });

      await h.dispatcher.dispatch(
        new NotificationRequestedEvent({
          userId: USER.id,
          templateKey: 'system.test_notification',
          variables: { message: 'hello' },
        }),
      );

      expect(h.jobs().map((j) => j.channel)).toEqual([
        NotificationChannel.SMS,
        NotificationChannel.EMAIL,
      ]);
    });

    it('delivers to an explicit address when the recipient has no account yet', async () => {
      const h = makeHarness({}, { user: null });

      const logIds = await h.dispatcher.dispatch(
        new NotificationRequestedEvent({
          userId: null,
          templateKey: 'auth.otp_code',
          variables: { code: '123456', expiresInMinutes: 10 },
          to: { email: 'newcomer@example.cm' },
        }),
      );

      expect(logIds).toHaveLength(1);
      expect(h.loggedRow().recipient).toBe('newcomer@example.cm');
    });

    it('skips a template with no content for any reachable channel', async () => {
      // password_reset is email-only; a user with no email is unreachable.
      const h = makeHarness({}, { user: { ...USER, email: null as unknown as string } });

      const logIds = await h.dispatcher.dispatch(
        new NotificationRequestedEvent({
          userId: USER.id,
          templateKey: 'auth.password_reset',
          variables: { resetUrl: 'https://kavio.cm/reset/abc', expiresInMinutes: 30 },
        }),
      );

      expect(logIds).toEqual([]);
    });
  });

  it('never lets a dispatch failure escape the event listener', async () => {
    const h = makeHarness();
    jest.spyOn(h.dispatcher, 'dispatch').mockRejectedValue(new Error('db down'));

    // The emitting request must not fail because a notification could not be sent.
    await expect(
      h.dispatcher.handleNotificationRequested(
        new NotificationRequestedEvent({
          userId: USER.id,
          templateKey: 'system.test_notification',
          variables: { message: 'hello' },
        }),
      ),
    ).resolves.toBeUndefined();
  });
});
