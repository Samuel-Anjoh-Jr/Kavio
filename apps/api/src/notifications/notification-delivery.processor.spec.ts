import { NotificationCategory, NotificationChannel, NotificationStatus } from '@trustpro/database';
import type { Job } from 'bullmq';
import { NotificationDeliveryProcessor } from './notification-delivery.processor';
import { EmailProvider } from './providers/email.provider';
import { InAppProvider } from './providers/in-app.provider';
import { NotificationProviderRegistry } from './providers/provider.registry';
import { SmsProvider } from './providers/sms.provider';
import { WebPushProvider } from './providers/web-push.provider';
import type { PrismaService } from '../prisma/prisma.service';
import type { QueueService } from '../queue/queue.service';
import type { NotificationDeliveryJob } from './notification.types';

function makeJob(overrides: Partial<NotificationDeliveryJob> = {}): Job<NotificationDeliveryJob> {
  return {
    attemptsMade: 1,
    data: {
      logId: 'log-1',
      channel: NotificationChannel.EMAIL,
      providerName: 'console',
      address: 'awa@example.cm',
      templateKey: 'system.test_notification',
      category: NotificationCategory.ACCOUNT,
      locale: 'en',
      variables: { message: 'hello' },
      userId: 'user-1',
      ...overrides,
    },
  } as Job<NotificationDeliveryJob>;
}

/** The shape the processor writes back to notificationLog.update. */
interface UpdateLogArgs {
  where: { id: string };
  data: {
    status: NotificationStatus;
    sentAt?: Date;
    errorMessage: string | null;
    subject?: string;
  };
}

type UpdateMock = jest.Mock<Promise<unknown>, [UpdateLogArgs]>;

function makeProcessor(env: NodeJS.ProcessEnv = { NOTIFICATIONS_EMAIL_PROVIDER: 'console' }) {
  const update: UpdateMock = jest.fn<Promise<unknown>, [UpdateLogArgs]>().mockResolvedValue({});
  const prisma = {
    client: { notificationLog: { update } },
  } as unknown as PrismaService;

  const email = new EmailProvider(env);
  const registry = new NotificationProviderRegistry(
    email,
    new WebPushProvider(prisma, env),
    new SmsProvider(env),
    new InAppProvider(prisma),
  );

  const registerWorker = jest.fn();
  const queue = { registerWorker } as unknown as QueueService;
  const processor = new NotificationDeliveryProcessor(prisma, registry, queue);

  /** The data payload of the nth log update. */
  const updatedRow = (index = 0): UpdateLogArgs['data'] => update.mock.calls[index]![0].data;

  return { processor, update, updatedRow, email, registerWorker };
}

describe('NotificationDeliveryProcessor', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('registers itself as a worker on the notifications queue at boot', () => {
    const { processor, registerWorker } = makeProcessor();

    processor.onModuleInit();

    expect(registerWorker).toHaveBeenCalledWith('notifications', expect.any(Function));
  });

  it('marks the log SENT after a successful delivery and records the subject', async () => {
    const { processor, update, updatedRow } = makeProcessor();

    await processor.process(makeJob());

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]![0].where).toEqual({ id: 'log-1' });
    expect(updatedRow()).toMatchObject({
      status: NotificationStatus.SENT,
      errorMessage: null,
      subject: 'TrustPro test notification',
    });
    expect(updatedRow().sentAt).toBeInstanceOf(Date);
  });

  it('marks the log FAILED with the provider reason and rethrows so BullMQ retries', async () => {
    const { processor, updatedRow, email } = makeProcessor();
    jest.spyOn(email, 'send').mockRejectedValue(new Error('smtp unreachable'));

    await expect(processor.process(makeJob())).rejects.toThrow('smtp unreachable');

    // The attempt is recorded even though it failed — no silent drops.
    expect(updatedRow()).toMatchObject({
      status: NotificationStatus.FAILED,
      errorMessage: 'smtp unreachable',
    });
  });

  it('truncates an oversized provider error before persisting it', async () => {
    const { processor, updatedRow, email } = makeProcessor();
    jest.spyOn(email, 'send').mockRejectedValue(new Error('x'.repeat(900)));

    await expect(processor.process(makeJob())).rejects.toThrow();

    expect(updatedRow().errorMessage).toHaveLength(500);
  });

  it('fails permanently (no rethrow) for an unknown templateKey', async () => {
    const { processor, updatedRow } = makeProcessor();

    // A retry could never succeed, so the job must not be requeued.
    await expect(
      processor.process(makeJob({ templateKey: 'removed.template' })),
    ).resolves.toBeUndefined();

    expect(updatedRow().status).toBe(NotificationStatus.FAILED);
    expect(updatedRow().errorMessage).toContain('Unknown templateKey');
  });

  it('fails permanently when the template has no content for the channel', async () => {
    const { processor, updatedRow } = makeProcessor();

    // password_reset is email-only; a queued SMS job for it can never render.
    await expect(
      processor.process(
        makeJob({
          templateKey: 'auth.password_reset',
          channel: NotificationChannel.SMS,
          variables: { resetUrl: 'https://trustpro.cm/r/1', expiresInMinutes: 30 },
        }),
      ),
    ).resolves.toBeUndefined();

    expect(updatedRow().status).toBe(NotificationStatus.FAILED);
    expect(updatedRow().errorMessage).toContain('has no SMS content');
  });

  it('delivers through the SMS stub once the flag is enabled', async () => {
    const { processor, updatedRow } = makeProcessor({ NOTIFICATIONS_SMS_ENABLED: 'true' });

    await processor.process(
      makeJob({
        channel: NotificationChannel.SMS,
        providerName: 'sms-stub',
        address: '+237655555555',
      }),
    );

    expect(updatedRow()).toMatchObject({ status: NotificationStatus.SENT });
  });
});
