/**
 * Segregated provider interfaces following Interface Segregation Principle (ISP).
 *
 * Each interface represents a specific capability of a messaging provider.
 * The MessagingProvider interface composes all of these for backward compatibility.
 */

export type { ChatReader } from './chat-reader';
export type { MessageReader } from './message-reader';
export type { MessageSender } from './message-sender';
export type { ChatOperations } from './chat-operations';
export type { ConnectionStatus } from './connection-status';
export type { MediaAccess } from './media-access';
