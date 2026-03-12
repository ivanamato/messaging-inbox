/**
 * Provider instance cache.
 * Manages provider instances per device to avoid recreating providers on every render.
 * Implements the Singleton pattern forfor provider instances.
 */

import type { MessagingProvider, DeviceConfig, ProviderType } from '@/lib/providers/types';
import { createProvider } from '@/lib/providers/registry';
import { DebugStore, DebugProviderProxy } from '@/lib/debug';

/**
 * Cache key format: `${deviceId}|${providerType}`
 */
type CacheKey = string;

/**
 * Provider instance cache that maintains one provider per unique device configuration.
 * Keyed by device ID (not token) to avoid token exposure in cache keys.
 */
export class ProviderInstanceCache {
  private cache = new Map<CacheKey, MessagingProvider>();

  constructor(private readonly debugStore?: DebugStore | null) {}

  /**
   * Build a cache key for a device.
   */
  private buildKey(device: DeviceConfig): CacheKey {
    const type = (device.providerType || 'evolution') as ProviderType;
    return `${device.id}|${type}`;
  }

  /**
   * Get or create a provider for a device.
   * Provider instances are cached and reused across renders.
   */
  get(device: DeviceConfig): MessagingProvider {
    const key = this.buildKey(device);

    if (!this.cache.has(key)) {
      let provider = createProvider(
        (device.providerType || 'evolution') as ProviderType,
        device.apiUrl,
        device.instanceToken,
        device.capabilities,
        device.endpoints,
      );

      // Wrap with debug proxy if debugging is enabled
      if (this.debugStore) {
        provider = new DebugProviderProxy(provider, this.debugStore, device.id);
      }

      this.cache.set(key, provider);
    }

    return this.cache.get(key)!;
  }

  /**
   * Clear all cached providers.
   * Useful when device configurations change significantly.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Check if a provider is cached for a device.
   */
  has(device: DeviceConfig): boolean {
    return this.cache.has(this.buildKey(device));
  }

  /**
   * Get the number of cached providers.
   */
  get size(): number {
    return this.cache.size;
  }
}
