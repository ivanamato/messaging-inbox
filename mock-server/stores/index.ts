/**
 * Mock server stores - focused, single-responsibility stores.
 *
 * Architecture:
 * - Each store handles one concern (messages, contacts, media, etc.)
 * - CompositeStore aggregates all stores with a unified API
 * - Follows Single Responsibility Principle (SRP)
 */

export { MessageStore, type IMessageStore } from './message-store.js';
export { DeletedStore, type IDeletedStore } from './deleted-store.js';
export { ContactStore, type IContactStore, type Contact } from './contact-store.js';
export { MediaStore, type IMediaStore, type MediaEntry } from './media-store.js';
export { UnreadStore, type IUnreadStore } from './unread-store.js';
export { MutationEmitter, type IMutationEmitter, type StoreMutationEvent } from './mutation-store.js';
export { CompositeStore } from './composite-store.js';
