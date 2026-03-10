// Normalized fixture data for the generic mock server (GENERIC1 instance).
// Types mirror src/lib/providers/types.ts but are defined locally to avoid
// importing from the frontend source tree.

export type NormalizedChat = {
  id: string;
  phoneNumber: string;
  contactName?: string;
  profilePicUrl?: string;
  lastActiveAt?: string;
  lastMessage?: {
    content: string;
    direction: 'inbound' | 'outbound';
    type?: string;
  };
  unreadCount?: number;
};

export type NormalizedMessage = {
  id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  createdAt: string;
  status?: string;
  phoneNumber: string;
  hasMedia: boolean;
  messageType: string;
  reactionEmoji?: string | null;
  reactedToMessageId?: string | null;
  caption?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  metadata?: Record<string, unknown>;
  senderName?: string;
};

export type GenericInstanceFixtures = {
  chats: NormalizedChat[];
  messagesByChatId: Record<string, NormalizedMessage[]>;
};

const now = Date.now();

const GENERIC1: GenericInstanceFixtures = {
  chats: [
    {
      id: '14151234567',
      phoneNumber: '14151234567',
      contactName: 'Alice Martin',
      lastActiveAt: new Date(now - 10 * 60 * 1000).toISOString(),
      lastMessage: { content: 'Hi, I need help with my order', direction: 'inbound', type: 'text' },
      unreadCount: 2,
    },
    {
      id: '16505559876',
      phoneNumber: '16505559876',
      contactName: 'Bob Chen',
      lastActiveAt: new Date(now - 60 * 60 * 1000).toISOString(),
      lastMessage: { content: 'Perfect, thanks!', direction: 'inbound', type: 'text' },
      unreadCount: 0,
    },
  ],
  messagesByChatId: {
    '14151234567': [
      {
        id: 'gen-msg-001',
        direction: 'outbound',
        content: 'Hello! How can I help you?',
        createdAt: new Date(now - 30 * 60 * 1000).toISOString(),
        status: 'read',
        phoneNumber: '14151234567',
        hasMedia: false,
        messageType: 'text',
        reactionEmoji: null,
        reactedToMessageId: null,
      },
      {
        id: 'gen-msg-002',
        direction: 'inbound',
        content: "I'd like to check on my order status",
        createdAt: new Date(now - 25 * 60 * 1000).toISOString(),
        status: 'read',
        phoneNumber: '14151234567',
        hasMedia: false,
        messageType: 'text',
        reactionEmoji: null,
        reactedToMessageId: null,
      },
      {
        id: 'gen-msg-003',
        direction: 'outbound',
        content: "Sure! What's your order number?",
        createdAt: new Date(now - 20 * 60 * 1000).toISOString(),
        status: 'read',
        phoneNumber: '14151234567',
        hasMedia: false,
        messageType: 'text',
        reactionEmoji: null,
        reactedToMessageId: null,
      },
      {
        id: 'gen-msg-004',
        direction: 'inbound',
        content: 'Hi, I need help with my order',
        createdAt: new Date(now - 10 * 60 * 1000).toISOString(),
        status: 'delivered',
        phoneNumber: '14151234567',
        hasMedia: false,
        messageType: 'text',
        reactionEmoji: null,
        reactedToMessageId: null,
      },
    ],
    '16505559876': [
      {
        id: 'gen-msg-101',
        direction: 'inbound',
        content: 'Can you send me the invoice?',
        createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        status: 'read',
        phoneNumber: '16505559876',
        hasMedia: false,
        messageType: 'text',
        reactionEmoji: null,
        reactedToMessageId: null,
      },
      {
        id: 'gen-msg-102',
        direction: 'outbound',
        content: 'Sure, sending it now',
        createdAt: new Date(now - 90 * 60 * 1000).toISOString(),
        status: 'read',
        phoneNumber: '16505559876',
        hasMedia: false,
        messageType: 'text',
        reactionEmoji: null,
        reactedToMessageId: null,
      },
      {
        id: 'gen-msg-103',
        direction: 'inbound',
        content: 'Perfect, thanks!',
        createdAt: new Date(now - 60 * 60 * 1000).toISOString(),
        status: 'read',
        phoneNumber: '16505559876',
        hasMedia: false,
        messageType: 'text',
        reactionEmoji: null,
        reactedToMessageId: null,
      },
    ],
  },
};

/** Maps Bearer token → instanceId */
export const GENERIC_TOKEN_TO_INSTANCE: Record<string, string> = {
  'generic-token-789': 'GENERIC1',
};

export const genericFixturesByInstance: Record<string, GenericInstanceFixtures> = {
  GENERIC1,
};
