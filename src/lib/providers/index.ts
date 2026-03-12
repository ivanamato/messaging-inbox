/**
 * Provider system with registry pattern for extensibility.
 * @module providers/index
 *
 * New providers can be registered without modifying this file by importing
 * the registry and calling providerRegistry.register().
 */

import { EvolutionProvider } from './evolution';
import { GenericServerProvider } from './generic-server';
import { EvolutionRealtimeConnection } from '../realtime/evolution-realtime';
import { GenericServerRealtimeConnection } from '../realtime/generic-server-realtime';
import {
  providerRegistry,
  createProvider,
  createRealtimeConnection,
} from './registry';
import type { DeviceConfig } from './types';

// ─── Register Built-in Providers ────────────────────────────────────────────

/**
 * Evolution API provider (WhatsApp via Evolution API v2)
 */
providerRegistry.register('evolution', {
  createProvider: (apiUrl, instanceToken, capabilities) =>
    new EvolutionProvider(apiUrl, instanceToken, capabilities),

  createRealtime: (device: DeviceConfig) => {
    const wsConfig = device.websocket;
    const wsUrl = wsConfig?.url || `${deriveWsUrl(device.apiUrl)}/${device.instanceName}`;
    return new EvolutionRealtimeConnection(wsUrl, device.instanceName, device.instanceToken, device.id);
  },
});

/**
 * Generic server provider (normalized messaging API)
 */
providerRegistry.register('generic-server', {
  createProvider: (apiUrl, instanceToken, capabilities, endpoints) =>
    new GenericServerProvider(apiUrl, instanceToken, capabilities, endpoints),

  createRealtime: (device: DeviceConfig) => {
    const wsConfig = device.websocket;
    const defaultWsPath = device.endpoints?.ws || `ws://${new URL(device.apiUrl).host}/ws/channels/{channelId}`;
    let wsUrl: string;

    if (wsConfig?.url) {
      wsUrl = wsConfig.url;
    } else if (device.endpoints?.ws) {
      const base = deriveWsUrl(device.apiUrl);
      const template = device.endpoints.ws;
      // If template starts with /, prepend base
      wsUrl = template.startsWith('/') || template.startsWith('ws') ? template : `${base}${template}`;
      if (wsUrl.startsWith('/')) {
        wsUrl = `${deriveWsUrl(device.apiUrl)}${wsUrl}`;
      }
    } else {
      wsUrl = defaultWsPath;
    }

    return new GenericServerRealtimeConnection(wsUrl, device.instanceName, device.instanceToken, device.id);
  },
});

// ─── Helper ───────────────────────────────────────────────────────────────

function deriveWsUrl(apiUrl: string): string {
  return apiUrl.replace(/^http/, 'ws');
}

// ─── Re-exports ────────────────────────────────────────────────────────────

// Export registry for external provider registration
export { providerRegistry, createProvider, createRealtimeConnection };

// Export types
export type {
  MessagingProvider,
  WhatsAppProvider,
  ProviderType,
  DeleteMessageParams,
  ProviderCapabilities,
  GenericServerEndpoints,
  Chat,
  Message,
  SendTextParams,
  SendMediaParams,
  SendButtonsParams,
  SendResult,
} from './types';
