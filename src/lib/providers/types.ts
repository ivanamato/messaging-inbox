// Normalized types used across all providers

export type ProviderType = 'evolution' | 'generic-server';

export type ProviderCapabilities = {
  templates: boolean;
  messagingWindow24h: boolean;
  pushToTalk: boolean;
  interactiveButtons: boolean;
  deleteForEveryone: boolean;
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

export type DeviceConfig = {
  id: string;
  label?: string;
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

export interface MessagingProvider {
  readonly type: ProviderType;
  readonly capabilities: ProviderCapabilities;

  getConnectionState(channelId: string): Promise<'open' | 'close' | 'connecting'>;
  findChats(channelId: string): Promise<Chat[]>;
  findMessages(channelId: string, chatId: string, limit?: number): Promise<Message[]>;
  findMessagesPaginated(channelId: string, chatId: string, options?: FindMessagesOptions): Promise<PaginatedMessages>;
  sendText(channelId: string, params: SendTextParams): Promise<SendResult>;
  sendMedia(channelId: string, params: SendMediaParams): Promise<SendResult>;
  sendButtons(channelId: string, params: SendButtonsParams): Promise<SendResult>;
  getMediaUrl(channelId: string, messageId: string): Promise<string | null>;
  deleteMessage(channelId: string, params: DeleteMessageParams): Promise<void>;
}

/** @deprecated Use MessagingProvider */
export type WhatsAppProvider = MessagingProvider;
