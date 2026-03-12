/**
 * Provider-backed implementation of ConnectionRepository.
 * Delegates to a MessagingProvider which already implements all required methods.
 */

import type { ConnectionRepository } from '@/domain/repositories/types';
import type { MessagingProvider } from '@/lib/providers/types';

export class ProviderConnectionRepository implements ConnectionRepository {
  constructor(private readonly provider: MessagingProvider) {}

  async getState(channelId: string): Promise<'open' | 'close' | 'connecting'> {
    return this.provider.getConnectionState(channelId);
  }
}
