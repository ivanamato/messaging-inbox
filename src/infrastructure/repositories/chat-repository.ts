/**
 * Provider-backed implementation of ChatRepository.
 * Delegates to a MessagingProvider which already implements all required methods.
 */

import type { ChatRepository } from '@/domain/repositories/types';
import type { MessagingProvider, Chat } from '@/lib/providers/types';

export class ProviderChatRepository implements ChatRepository {
  constructor(private readonly provider: MessagingProvider) {}

  async findAll(channelId: string): Promise<Chat[]> {
    return this.provider.findChats(channelId);
  }

  async findByPhoneNumber(channelId: string, phoneNumber: string): Promise<Chat | undefined> {
    const chats = await this.provider.findChats(channelId);
    return chats.find(c => c.phoneNumber === phoneNumber);
  }

  async markAsRead(channelId: string, chatId: string): Promise<void> {
    return this.provider.markChatAsRead(channelId, chatId);
  }
}
