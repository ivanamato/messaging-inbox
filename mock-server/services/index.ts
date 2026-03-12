/**
 * Mock server services - business logic extracted from route handlers.
 *
 * Each service handles a specific domain concern:
 * - JidResolver: Reconstructing full JIDs from bare numbers
 * - ContactNameResolver: Resolving display names for contacts
 * - ChatMerger: Merging fixture chats with dynamic messages
 * - DeliveryScheduler: Simulating message delivery progression
 *
 * This follows the Single Responsibility Principle (SRP) and makes
 * the route handlers thin orchestrators.
 */

export { JidResolver } from './jid-resolver.js';
export { ContactNameResolver } from './contact-name-resolver.js';
export { ChatMerger } from './chat-merger.js';
export { DeliveryScheduler, DELIVERY_TIMING } from './delivery-scheduler.js';
