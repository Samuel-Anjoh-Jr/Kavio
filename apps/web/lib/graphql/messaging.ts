import { gql } from '@apollo/client';

/**
 * Messaging READS (DUAL API RULE). Writes are REST (lib/messaging.ts).
 *
 * Mirrors apps/api/src/messaging/models/message.model.ts. Note what the API does
 * NOT return: a raw metadata blob. Location pins and card references arrive as
 * typed scalars (latitude/longitude/refId), so a bubble renders without parsing
 * an opaque object.
 */

export type MessageKind = 'TEXT' | 'IMAGE' | 'VOICE' | 'LOCATION' | 'QUOTE' | 'JOB' | 'PAYMENT';
export type MessageStatus = 'SENT' | 'DELIVERED' | 'READ';

export interface ConversationPeer {
  id: string;
  name: string | null;
  avatar: string | null;
}

export interface MessageAttachment {
  id: string;
  url: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  kind: MessageKind;
  body: string | null;
  status: MessageStatus;
  mediaUrl: string | null;
  attachments: MessageAttachment[];
  latitude: number | null;
  longitude: number | null;
  refId: string | null;
  deleted: boolean;
  createdAt: string;
}

export interface Conversation {
  id: string;
  jobId: string | null;
  jobTitle: string | null;
  peer: ConversationPeer | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  peerBlocked: boolean;
}

export const CONVERSATIONS_QUERY = gql`
  query MyConversations {
    myConversations {
      id
      jobId
      jobTitle
      peer {
        id
        name
        avatar
      }
      lastMessagePreview
      lastMessageAt
      unreadCount
      peerBlocked
    }
  }
`;

export interface ConversationsQueryResult {
  myConversations: Conversation[];
}

export const CONVERSATION_QUERY = gql`
  query Conversation($id: ID!, $limit: Int) {
    conversation(id: $id, limit: $limit) {
      conversation {
        id
        jobId
        jobTitle
        peer {
          id
          name
          avatar
        }
        lastMessagePreview
        lastMessageAt
        unreadCount
        peerBlocked
      }
      messages {
        id
        conversationId
        senderId
        kind
        body
        status
        mediaUrl
        attachments {
          id
          url
        }
        latitude
        longitude
        refId
        deleted
        createdAt
      }
    }
  }
`;

export interface ConversationQueryResult {
  conversation: {
    conversation: Conversation;
    messages: Message[];
  } | null;
}

/** The app-shell badge (MSG-02). */
export const UNREAD_MESSAGES_QUERY = gql`
  query UnreadMessageCount {
    unreadMessageCount
  }
`;

export interface UnreadMessagesQueryResult {
  unreadMessageCount: number;
}
