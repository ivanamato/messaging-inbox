/**
 * Mock server configuration.
 * Centralizes all magic numbers and configurable values.
 */

/**
 * Delivery timing configuration for message status progression.
 * Simulates realistic WhatsApp message delivery behavior.
 */
export const DELIVERY_TIMING = {
  /** Time until SERVER_ACK status (message reached server) */
  SERVER_ACK_MS: 300,
  /** Time until DELIVERY_ACK status (message delivered to device) */
  DELIVERY_ACK_MS: 1500,
  /** Minimum time until READ status + auto-reply */
  REPLY_MIN_MS: 2000,
  /** Maximum time until READ status + auto-reply */
  REPLY_MAX_MS: 3000,
} as const;

/**
 * Pagination defaults for message fetching.
 */
export const PAGINATION = {
  /** Maximum messages per page */
  MESSAGES_PER_PAGE: 20,
  /** Default message limit when not paginated */
  DEFAULT_MESSAGE_LIMIT: 50,
} as const;

/**
 * Valid API tokens mapped to instance names.
 * Used for authentication in the Evolution API mock.
 */
export const VALID_TOKENS = new Map([
  ['mock-token-123', 'MOCK1'],
  ['mock-token-456', 'MOCK2'],
]);

/**
 * Media configuration.
 */
export const MEDIA = {
  /** Maximum response size (10 MB) */
  MAX_RESPONSE_BYTES: 10 * 1024 * 1024,
  /** Fallback image for missing media */
  FALLBACK_IMAGE_BASE64: '', // Set from fixtures
} as const;
