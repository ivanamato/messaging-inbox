/**
 * Infrastructure layer exports.
 * Re-exports all infrastructure modules for convenient imports.
 */

// Cache
export { ProviderInstanceCache } from './cache';

// WebSocket
export { useWebSocketManager } from './websocket';
export type { WebSocketManagerConfig, WebSocketManagerState } from './websocket';

// Device
export { useDeviceState } from './device';
export type { DeviceStateConfig, DeviceState } from './device';

// Repositories
export {
  createRepositories,
  ProviderChatRepository,
  ProviderMessageRepository,
  ProviderMediaRepository,
  ProviderConnectionRepository,
} from './repositories';
export type {
  ChatRepository,
  MessageRepository,
  MediaRepository,
  ConnectionRepository,
  RepositorySet,
} from './repositories';
