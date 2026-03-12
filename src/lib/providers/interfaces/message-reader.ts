/**
 * Message reading capabilities.
 * Used for fetching message history.
 */
import type { Message, FindMessagesOptions, PaginatedMessages } from '../types';

export interface MessageReader {
  /**
   * Fetch messages for a specific chat.
   */
  findMessages(channelId: string, chatId: string, limit?: number): Promise<Message[]>;

  /**
   * Fetch messages with pagination support.
   */
  findMessagesPaginated(channelId: string, chatId: string, options?: FindMessagesOptions): Promise<PaginatedMessages>;
}
