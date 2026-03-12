/**
 * Mock store - single entry point for mock server state.
 *
 * This file re-exports CompositeStore as the singleton `store` instance,
 * maintaining backward compatibility with existing code that imports from
 * `./store.js`.
 *
 * The implementation has been refactored into focused stores (message-store,
 * contact-store, etc.) following the Single Responsibility Principle.
 * CompositeStore aggregates these stores with the same public API.
 *
 * @see {@link ./stores/composite-store.ts} for the aggregated implementation
 * @see {@link ./stores/} for individual focused stores
 */

import { CompositeStore, type StoreMutationEvent } from './stores/index.js';

// Re-export the mutation event type for backward compatibility
export type { StoreMutationEvent };

// Singleton instance - same API as the original MockStore
export const store = new CompositeStore();
