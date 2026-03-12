/**
 * Chat reading capabilities.
 * Used for fetching chat/conversation lists.
 */
import type { Chat } from '../types';

export interface ChatReader {
  /**
   * Fetch all chats for a channel/instance.
   */
  findChats(channelId: string): Promise<Chat[]>;
}
