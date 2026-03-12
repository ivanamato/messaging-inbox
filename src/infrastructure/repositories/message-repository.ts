/**
 * Provider-backed implementation of MessageRepository.
 * Delegates to a MessagingProvider which already implements all required methods.
 */

import type { MessageRepository } from '@/domain/repositories/types';
import type { MessagingProvider } from '@/lib/providers/types';

export class ProviderMessageRepository implements MessageRepository {
  constructor(private readonly provider: MessagingProvider) {}

  async findByChat(channelId: string, chatId: string, limit?: number) {
    return this.provider.findMessages(channelId, chatId, limit);
  }

  async findByChatPaginated(channelId: string, chatId: string, options?: import('@/lib/providers/types').FindMessagesOptions) {
    return this.provider.findMessagesPaginated(channelId, chatId, options);
  }

  async sendText(channelId: string, params: import('@/lib/providers/types').SendTextParams) {
    return this.provider.sendText(channelId, params);
  }

  async sendMedia(channelId: string, params: import('@/lib/providers/types').SendMediaParams) {
    return this.provider.sendMedia(channelId, params);
  }

  async sendButtons(channelId: string, params: import('@/lib/providers/types').SendButtonsParams) {
    return this.provider.sendButtons(channelId, params);
  }

  async delete(channelId: string, params: import('@/lib/providers/types').DeleteMessageParams) {
    return this.provider.deleteMessage(channelId, params);
  }
}
