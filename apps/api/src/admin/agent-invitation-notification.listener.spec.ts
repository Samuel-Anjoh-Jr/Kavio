import { NotificationChannel } from '@kavio/database';
import { AgentInvitationNotificationListener } from './agent-invitation-notification.listener';
import { AgentInvitationSentEvent } from './admin.events';
import type { NotificationProviderRegistry } from '../notifications/providers/provider.registry';

function makeRegistry(send: jest.Mock) {
  return {
    get: jest.fn().mockReturnValue({ send }),
  } as unknown as NotificationProviderRegistry;
}

describe('AgentInvitationNotificationListener', () => {
  it('sends the invitation email with an accept link built from the token', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const listener = new AgentInvitationNotificationListener(makeRegistry(send));

    const event = new AgentInvitationSentEvent({
      invitationId: 'inv-1',
      invitedById: 'admin-1',
      name: 'Paul Ngassa',
      email: 'paul.agent@example.cm',
      token: 'raw-token-value',
      expiresAt: new Date(Date.now() + 14 * 86_400_000),
    });

    await listener.onInvitationSent(event);

    expect(send).toHaveBeenCalledTimes(1);
    const [address, message, context] = send.mock.calls[0]!;
    expect(address).toBe('paul.agent@example.cm');
    expect(message.content.text).toContain('raw-token-value');
    expect(context).toMatchObject({ templateKey: 'admin.agent_invited', userId: null });
  });

  it('does nothing when the EMAIL provider is not registered', async () => {
    const registry = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as NotificationProviderRegistry;
    const listener = new AgentInvitationNotificationListener(registry);

    await listener.onInvitationSent(
      new AgentInvitationSentEvent({
        invitationId: 'inv-2',
        invitedById: 'admin-1',
        name: 'Paul Ngassa',
        email: 'paul.agent@example.cm',
        token: 'raw-token-value',
        expiresAt: new Date(Date.now() + 86_400_000),
      }),
    );

    expect(registry.get).toHaveBeenCalledWith(NotificationChannel.EMAIL);
  });
});
