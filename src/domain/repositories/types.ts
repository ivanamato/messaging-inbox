/**
 * Domain repository interfaces.
 * These define the contracts for data access, following the Dependency Inversion Principle.
 * The domain layer owns these interfaces; infrastructure layer provides implementations.
 */

import type {
  Chat,
  Message,
  PaginatedMessages,
  FindMessagesOptions,
  SendTextParams,
  SendMediaParams,
  SendButtonsParams,
  SendResult,
  DeleteMessageParams,
} from '@/lib/providers/types';

/**
 * Repository for chat/conversation data access.
 */
export interface ChatRepository {
  /**
   * Fetch all chats for a channel/instance.
   */
  findAll(channelId: string): Promise<Chat[]>;

  /**
   * Find a specific chat by phone number.
   */
  findByPhoneNumber(channelId: string, phoneNumber: string): Promise<Chat | undefined>;

  /**
   * Mark all messages in a chat as read.
   */
  markAsRead(channelId: string, chatId: string): Promise<void>;
}

/**
 * Repository for message data access and sending.
 */
export interface MessageRepository {
  /**
   * Fetch messages for a specific chat.
   */
  findByChat(channelId: string, chatId: string, limit?: number): Promise<Message[]>;

  /**
   * Fetch messages with pagination support.
   */
  findByChatPaginated(
    channelId: string,
    chatId: string,
    options?: FindMessagesOptions
  ): Promise<PaginatedMessages>;

  /**
   * Send a text message.
   */
  sendText(channelId: string, params: SendTextParams): Promise<SendResult>;

  /**
   * Send a media message (image, video, audio, document).
   */
  sendMedia(channelId: string, params: SendMediaParams): Promise<SendResult>;

  /**
   * Send an interactive button message.
   */
  sendButtons(channelId: string, params: SendButtonsParams): Promise<SendResult>;

  /**
   * Delete a message for everyone.
   */
  delete(channelId: string, params: DeleteMessageParams): Promise<void>;
}

/**
 * Repository for media URL access.
 */
export interface MediaRepository {
  /**
   * Get the URL for a media message.
   * Returns a data URI or null if not found.
   */
  getUrl(channelId: string, messageId: string): Promise<string | null>;
}

/**
 * Repository for connection status.
 */
export interface ConnectionRepository {
  /**
   * Get the connection state for a channel.
   */
  getState(channelId: string): Promise<'open' | 'close' | 'connecting'>;
}

/**
 * Repository for message operations (alias for clarity).
 * Extends MessageRepository with additional operations.
 */

/**
 * Combined repository set for convenience.
 */
export interface RepositorySet {
  chat: ChatRepository;
  message: MessageRepository;
  media: MediaRepository;
  connection: ConnectionRepository;
}
