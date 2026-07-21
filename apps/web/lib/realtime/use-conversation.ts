'use client';

import { useEffect, useRef, useState } from 'react';
import { createRealtimeSocket, type Socket } from './socket';

/**
 * Live conversation channel (PROMPT 71; MSG-01, MSG-02). Subscribes to one
 * conversation's room and surfaces new messages, typing state and peer presence
 * as they arrive. Sending a message is NOT here — it is a REST write (the DUAL
 * API RULE); this hook only carries the live delivery back.
 */

export interface LiveMessage {
  id: string;
  conversationId: string;
  senderId: string;
  kind: string;
  body: string | null;
  status: string;
  createdAt: string;
}

export interface UseConversationResult {
  connected: boolean;
  /** Messages received live since mount (does not include the initial GraphQL page). */
  liveMessages: LiveMessage[];
  /** Ids of peers currently typing. */
  typingUserIds: string[];
  /** Peers currently online in this conversation. */
  onlineUserIds: string[];
  /** Emit a typing indicator to the peer. */
  setTyping: (typing: boolean) => void;
  /** Mark the thread read up to now (also persisted server-side). */
  markRead: () => void;
}

export function useConversation(
  conversationId: string | null,
  token: string | null,
): UseConversationResult {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [liveMessages, setLiveMessages] = useState<LiveMessage[]>([]);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (!conversationId || !token) {
      return;
    }

    const socket = createRealtimeSocket('/messaging', { token });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit(
        'conversation:join',
        { conversationId },
        (ack: { ok: boolean; online?: string[] }) => {
          if (ack?.ok) setOnlineUserIds(ack.online ?? []);
        },
      );
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('message:new', (message: LiveMessage) => {
      if (message.conversationId === conversationId) {
        setLiveMessages((prev) => [...prev, message]);
      }
    });

    socket.on('typing', (payload: { conversationId: string; userId: string; typing: boolean }) => {
      if (payload.conversationId !== conversationId) return;
      setTypingUserIds((prev) => {
        const without = prev.filter((id) => id !== payload.userId);
        return payload.typing ? [...without, payload.userId] : without;
      });
    });

    return () => {
      socket.emit('conversation:leave', { conversationId });
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
      setTypingUserIds([]);
    };
  }, [conversationId, token]);

  const setTyping = (typing: boolean) => {
    socketRef.current?.emit('typing', { conversationId, typing });
  };

  const markRead = () => {
    socketRef.current?.emit('conversation:read', { conversationId });
  };

  return { connected, liveMessages, typingUserIds, onlineUserIds, setTyping, markRead };
}
