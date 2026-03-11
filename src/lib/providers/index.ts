import { EvolutionProvider } from './evolution';
import { GenericServerProvider } from './generic-server';
import type { MessagingProvider, ProviderType, ProviderCapabilities, GenericServerEndpoints, DeviceConfig } from './types';
import type { RealtimeConnection } from '../realtime/types';
import { EvolutionRealtimeConnection } from '../realtime/evolution-realtime';
import { GenericServerRealtimeConnection } from '../realtime/generic-server-realtime';

export function createProvider(type: ProviderType, apiUrl: string, instanceToken: string, capabilities?: Partial<ProviderCapabilities>, endpoints?: GenericServerEndpoints): MessagingProvider {
  if (type === 'evolution') return new EvolutionProvider(apiUrl, instanceToken, capabilities);
  if (type === 'generic-server') return new GenericServerProvider(apiUrl, instanceToken, capabilities, endpoints);
  throw new Error(`Unknown provider: ${type}`);
}

function deriveWsUrl(apiUrl: string): string {
  return apiUrl.replace(/^http/, 'ws');
}

export function createRealtimeConnection(device: DeviceConfig): RealtimeConnection {
  const type = device.providerType || 'evolution';
  const wsConfig = device.websocket;

  if (type === 'evolution') {
    const wsUrl = wsConfig?.url || `${deriveWsUrl(device.apiUrl)}/{instanceName}`;
    return new EvolutionRealtimeConnection(wsUrl, device.instanceName, device.instanceToken, device.id);
  }

  if (type === 'generic-server') {
    const defaultWsPath = device.endpoints?.ws || `ws://${new URL(device.apiUrl).host}/ws/channels/{channelId}`;
    let wsUrl: string;
    if (wsConfig?.url) {
      wsUrl = wsConfig.url;
    } else if (device.endpoints?.ws) {
      // Custom endpoint template — resolve relative to apiUrl
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
  }

  throw new Error(`Unknown provider type for realtime: ${type}`);
}

export type { MessagingProvider, WhatsAppProvider, ProviderType, DeleteMessageParams, ProviderCapabilities, GenericServerEndpoints } from './types';
export type {
  Chat,
  Message,
  SendTextParams,
  SendMediaParams,
  SendButtonsParams,
  SendResult,
} from './types';
