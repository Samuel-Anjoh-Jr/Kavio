import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import { userRoom } from './ws-auth';

/**
 * Online presence (SRS §13). Presence is derived from socket.io rooms rather than
 * a stored flag: a user is online exactly when they have at least one live socket
 * in their per-identity room. Because the gateways run the Redis adapter, this
 * count spans every API instance — a user connected to instance A shows online to
 * a peer on instance B — and it self-heals on a crash, since a dead socket leaves
 * its room automatically. No presence key to leak or leave stale.
 */
@Injectable()
export class PresenceService {
  /** Whether the identity has any live socket, across all instances. */
  async isOnline(server: Server, userId: string): Promise<boolean> {
    const sockets = await server.in(userRoom(userId)).fetchSockets();
    return sockets.length > 0;
  }

  /** The subset of `userIds` currently online — one adapter round-trip per id. */
  async onlineAmong(server: Server, userIds: string[]): Promise<string[]> {
    const results = await Promise.all(
      userIds.map(async (id) => ((await this.isOnline(server, id)) ? id : null)),
    );
    return results.filter((id): id is string => id !== null);
  }
}
