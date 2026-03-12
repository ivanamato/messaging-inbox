/**
 * Infrastructure repository implementations.
 * Re-exports domain types and provides factory functions.
 */

export type {
  ChatRepository,
  MessageRepository,
  MediaRepository,
  ConnectionRepository,
  RepositorySet,
} from '@/domain/repositories/types';

export { ProviderChatRepository } from './chat-repository';
export { ProviderMessageRepository } from './message-repository';
export { ProviderMediaRepository } from './media-repository';
export { ProviderConnectionRepository } from './connection-repository';

import type { MessagingProvider } from '@/lib/providers/types';
import type { RepositorySet } from '@/domain/repositories/types';
import { ProviderChatRepository } from './chat-repository';
import { ProviderMessageRepository } from './message-repository';
import { ProviderMediaRepository } from './media-repository';
import { ProviderConnectionRepository } from './connection-repository';

/**
 * Create a complete repository set from a MessagingProvider.
 * This factory function creates all repository instances backed by a single provider.
 */
export function createRepositories(provider: MessagingProvider): RepositorySet {
  return {
    chat: new ProviderChatRepository(provider),
    message: new ProviderMessageRepository(provider),
    media: new ProviderMediaRepository(provider),
    connection: new ProviderConnectionRepository(provider),
  };
}
