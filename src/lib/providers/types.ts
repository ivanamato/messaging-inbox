// Normalized types used across all providers

// Re-export segregated interfaces for consumers
export type { ChatReader, MessageReader, MessageSender, ChatOperations, ConnectionStatus, MediaAccess } from './interfaces';

import type { ChatReader, MessageReader, MessageSender, ChatOperations, ConnectionStatus, MediaAccess } from './interfaces';

export type ProviderType = 'evolution' | 'generic-server';

export type ConversationIdentifierType = 'phone' | 'username' | 'opaque';

export type ConversationInitiationCapability = {
  /** Whether the platform allows the business to start new conversations. */
  canInitiate: boolean;
  /** What kind of identifier is used to address contacts. Default: 'phone'. */
  identifierType: ConversationIdentifierType;
  /** UI label for the identifier input (e.g. "Phone number", "Username"). Falls back to identifierType. */
  identifierLabel?: string;
};

const DEFAULT_INITIATION: ConversationInitiationCapability = {
  canInitiate: true,
  identifierType: 'phone',
};

/** Resolve conversation initiation capability with backward-compatible defaults. */
export function resolveInitiationCapability(
  caps: ProviderCapabilities,
): ConversationInitiationCapability {
  return caps.conversationInitiation ?? DEFAULT_INITIATION;
}

export type ProviderCapabilities = {
  templates: boolean;
  messagingWindow24h: boolean;
  pushToTalk: boolean;
  interactiveButtons: boolean;
  deleteForEveryone: boolean;
  markAsRead: boolean;
  /** How/whether new conversations can be initiated. Defaults to phone-based free initiation. */
  conversationInitiation?: ConversationInitiationCapability;
};

export type DeleteMessageParams = {
  messageId: string;
  /** Provider-specific metadata (e.g. { remoteJid, fromMe } for Evolution). */
  metadata?: Record<string, unknown>;
};

export type ViewMode = 'single' | 'all';

export type PrebuiltMessage = {
  id: string;
  /** Short label shown in the picker list */
  label: string;
  /**
   * For type='text' (default): the text to fill in the composer.
   * For type='audio': base64-encoded audio data sent as a PTT voice message.
   */
  content: string;
  /**
   * 'text' (default) fills the composer.
   * 'audio' sends immediately as a PTT voice note.
   * 'image' sends immediately as an image.
   * 'video' sends immediately as a video.
   */
  type?: 'text' | 'audio' | 'image' | 'video';
  /** For media types: MIME type (e.g. 'audio/ogg', 'image/jpeg', 'video/mp4'). Defaults per type. */
  mimeType?: string;
};

/**
 * Endpoint map for the generic-server provider.
 *
 * Each value is a string in the format `"METHOD /path/with/{placeholders}"`.
 * Supported placeholders: `{channelId}`, `{chatId}`, `{messageId}`, `{page}`, `{pageSize}`.
 * All placeholders are URI-encoded automatically.
 *
 * Defaults (used when a key is omitted):
 * - status:      `"GET /channels/{channelId}/status"`
 * - chats:       `"GET /channels/{channelId}/chats"`
 * - messages:    `"GET /channels/{channelId}/chats/{chatId}/messages?page={page}&pageSize={pageSize}"`
 * - sendText:    `"POST /channels/{channelId}/messages/text"`
 * - sendMedia:   `"POST /channels/{channelId}/messages/media"`
 * - sendButtons: `"POST /channels/{channelId}/messages/buttons"`
 * - media:       `"GET /channels/{channelId}/media/{messageId}"`
 * - deleteMsg:   `"DELETE /channels/{channelId}/messages/{messageId}"`
 * - markAsRead:  `"POST /channels/{channelId}/chats/{chatId}/read"`
 */
export type GenericServerEndpoints = {
  status?: string;
  chats?: string;
  messages?: string;
  sendText?: string;
  sendMedia?: string;
  sendButtons?: string;
  media?: string;
  deleteMsg?: string;
  markAsRead?: string;
  /** WebSocket endpoint template. Placeholder: `{channelId}`. Default: `wss://<apiUrl>/ws/channels/{channelId}` */
  ws?: string;
};

export type DeviceConfig = {
  id: string;
  label?: string;
  /** Optional icon URL (or data URI) displayed alongside the device name */
  icon?: string;
  apiUrl: string;
  /** Per-instance token from Evolution API (NOT the global API key) */
  instanceToken: string;
  instanceName: string;
  providerType?: ProviderType;
  readonly?: boolean;
  /** Optional list of pre-built messages available in the composer for this device */
  prebuiltMessages?: PrebuiltMessage[];
  /** Declare which features the provider backend supports. Defaults to all false for generic-server. */
  capabilities?: Partial<ProviderCapabilities>;
  /** Custom endpoint map for generic-server provider. Ignored for evolution provider. */
  endpoints?: GenericServerEndpoints;
  /** Automatically mark chats as read when opened. Default: true. */
  autoRead?: boolean;
  /** WebSocket real-time configuration. When enabled, the inbox receives push updates instead of polling. */
  websocket?: {
    enabled: boolean;
    /** Override WebSocket URL. Default: derived from apiUrl (http→ws, https→wss). */
    url?: string;
  };
};

export type ChatAction = {
  id: string;
  label: string;
  icon?: import('react').ComponentType<{ className?: string }>;
  onClick: (chat: Chat, device: DeviceConfig) => void;
};

export type ChatActionsResolver = (chat: Chat, device: DeviceConfig) => ChatAction[] | Promise<ChatAction[]>;

export type ChatTag = {
  id: string;
  label: string;
  color?: string;
  background?: string;
};

export type ChatTagsResolver = (chat: Chat, device: DeviceConfig) => ChatTag[] | Promise<ChatTag[]>;

export type BulkChatTagsEntry = {
  /** Composite key matching the internal ConversationList key: `${device.id}::${chat.id}` or `${chat.id}` */
  key: string;
  chat: Chat;
  device: DeviceConfig;
};

export type BulkChatTagsResolver = (entries: BulkChatTagsEntry[]) => Promise<Map<string, ChatTag[]>>;

export type WhatsAppMultiDeviceConfig = {
  devices: DeviceConfig[];
  defaultDeviceId?: string;
  translations?: Partial<import('../i18n').Translations>;
  chatActions?: ChatActionsResolver;
  chatTags?: ChatTagsResolver;
  /** Preferred over chatTags: resolves all chat tags in a single batch call. */
  chatTagsBulk?: BulkChatTagsResolver;
  /** Enable the debug panel for development and troubleshooting. */
  debug?: boolean;
  /** Called when a WebSocket connection fails. Receives the device ID and error message. */
  onWebSocketError?: (deviceId: string, error: string) => void;
};

export type Chat = {
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

export type Message = {
  id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  createdAt: string;
  status?: string;
  phoneNumber: string;
  hasMedia: boolean;
  mediaData?: {
    url: string;
    contentType?: string;
    filename?: string;
    byteSize?: number;
  };
  messageType: string;
  reactionEmoji?: string | null;
  reactedToMessageId?: string | null;
  caption?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  metadata?: Record<string, unknown>;
  /** ID of the message this is a reply to */
  quotedMessageId?: string | null;
  /** Preview content of the quoted message */
  quotedContent?: string | null;
  /** Display name of the sender (from pushName). Shown above inbound message bubbles. */
  senderName?: string;
};

export type SendTextParams = {
  to: string;
  body: string;
};

export type SendMediaParams = {
  to: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  media: string;
  caption?: string;
  fileName?: string;
  mimeType?: string;
  ptt?: boolean;
};

export type SendButtonsParams = {
  to: string;
  body: string;
  header?: string;
  buttons: Array<{ id: string; title: string }>;
};

export type SendResult = {
  messageId: string;
  status?: string;
};

export type FindMessagesOptions = {
  page?: number;      // 1-based, default 1
  pageSize?: number;  // items per page, default 50
};

export type PaginatedMessages = {
  messages: Message[];
  pagination: {
    currentPage: number;
    totalPages: number;
    total: number;
    hasMore: boolean;
  };
};

/**
 * MessagingProvider - Composite interface extending all segregated interfaces.
 *
 * This interface combines all provider capabilities for backward compatibility.
 * New code should prefer using the specific interfaces (ChatReader, MessageSender, etc.)
 * when only a subset of capabilities is needed (Interface Segregation Principle).
 */
export interface MessagingProvider
  extends ChatReader, MessageReader, MessageSender, ChatOperations, ConnectionStatus, MediaAccess {
  /** Provider type identifier */
  readonly type: ProviderType;
  /** Feature capabilities supported by this provider */
  readonly capabilities: ProviderCapabilities;
}

/** @deprecated Use MessagingProvider */
export type WhatsAppProvider = MessagingProvider;
