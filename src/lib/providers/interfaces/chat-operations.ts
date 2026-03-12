/**
 * Chat operation capabilities.
 * Used for modifying chat state (marking as read, deleting messages).
 */
import type { DeleteMessageParams } from '../types';

export interface ChatOperations {
  /**
   * Delete a message for everyone in the chat.
   */
  deleteMessage(channelId: string, params: DeleteMessageParams): Promise<void>;

  /**
   * Mark all messages in a chat as read.
   */
  markChatAsRead(channelId: string, chatId: string): Promise<void>;
}
