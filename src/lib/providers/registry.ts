/**
 * Provider registry implementing the Open/Closed Principle.
 * New providers can be registered without modifying this file.
 */

import type { MessagingProvider, ProviderType, ProviderCapabilities, GenericServerEndpoints, DeviceConfig } from './types';
import type { RealtimeConnection } from '../realtime/types';

// ─── Types ────────────────────────────────────────────────────────────────

export type ProviderFactory = (
  apiUrl: string,
  instanceToken: string,
  capabilities?: Partial<ProviderCapabilities>,
  endpoints?: GenericServerEndpoints,
) => MessagingProvider;

export type RealtimeConnectionFactory = (
  device: DeviceConfig,
) => RealtimeConnection;

type ProviderRegistryEntry = {
  createProvider: ProviderFactory;
  createRealtime: RealtimeConnectionFactory;
};

// ─── Registry ────────────────────────────────────────────────────────────────

class ProviderRegistry {
  private providers = new Map<ProviderType, ProviderRegistryEntry>();

  /**
   * Register a new provider type.
   * @param type Unique identifier for the provider type
   * @param entry Factory functions for creating provider and realtime instances
   */
  register(type: ProviderType, entry: ProviderRegistryEntry): void {
    if (this.providers.has(type)) {
      console.warn(`Provider type "${type}" is already registered. Overwriting.`);
    }
    this.providers.set(type, entry);
  }

  /**
   * Check if a provider type is registered.
   */
  has(type: ProviderType): boolean {
    return this.providers.has(type);
  }

  /**
   * Get all registered provider types.
   */
  getRegisteredTypes(): ProviderType[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Create a provider instance.
   * @throws Error if provider type is not registered
   */
  createProvider(
    type: ProviderType,
    apiUrl: string,
    instanceToken: string,
    capabilities?: Partial<ProviderCapabilities>,
    endpoints?: GenericServerEndpoints,
  ): MessagingProvider {
    const entry = this.providers.get(type);
    if (!entry) {
      throw new Error(`Unknown provider type: ${type}. Registered types: ${this.getRegisteredTypes().join(', ')}`);
    }
    return entry.createProvider(apiUrl, instanceToken, capabilities, endpoints);
  }

  /**
   * Create a realtime connection instance.
   * @throws Error if provider type is not registered
   */
  createRealtime(device: DeviceConfig): RealtimeConnection {
    const type = device.providerType || 'evolution';
    const entry = this.providers.get(type as ProviderType);
    if (!entry) {
      throw new Error(`Unknown provider type for realtime: ${type}`);
    }
    return entry.createRealtime(device);
  }
}

// ─── Singleton Instance ────────────────────────────────────────────────────────

/**
 * Global provider registry instance.
 * Providers are registered at module load time.
 */
export const providerRegistry = new ProviderRegistry();

// ─── Convenience Functions ─────────────────────────────────────────────────────

/**
 * Create a provider using the global registry.
 */
export function createProvider(
  type: ProviderType,
  apiUrl: string,
  instanceToken: string,
  capabilities?: Partial<ProviderCapabilities>,
  endpoints?: GenericServerEndpoints,
): MessagingProvider {
  return providerRegistry.createProvider(type, apiUrl, instanceToken, capabilities, endpoints);
}

/**
 * Create a realtime connection using the global registry.
 */
export function createRealtimeConnection(device: DeviceConfig): RealtimeConnection {
  return providerRegistry.createRealtime(device);
}

