/**
 * Provider-backed implementation of MediaRepository.
 * Delegates to a MessagingProvider which already implements all required methods.
 */

import type { MediaRepository } from '@/domain/repositories/types';
import type { MessagingProvider } from '@/lib/providers/types';

export class ProviderMediaRepository implements MediaRepository {
  constructor(private readonly provider: MessagingProvider) {}

  async getUrl(channelId: string, messageId: string): Promise<string | null> {
    return this.provider.getMediaUrl(channelId, messageId);
  }
}
