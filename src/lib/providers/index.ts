import { EvolutionProvider } from './evolution';
import { GenericServerProvider } from './generic-server';
import type { MessagingProvider, ProviderType, ProviderCapabilities } from './types';

export function createProvider(type: ProviderType, apiUrl: string, instanceToken: string, capabilities?: Partial<ProviderCapabilities>): MessagingProvider {
  if (type === 'evolution') return new EvolutionProvider(apiUrl, instanceToken);
  if (type === 'generic-server') return new GenericServerProvider(apiUrl, instanceToken, capabilities);
  throw new Error(`Unknown provider: ${type}`);
}

export type { MessagingProvider, WhatsAppProvider, ProviderType, DeleteMessageParams, ProviderCapabilities } from './types';
export type {
  Chat,
  Message,
  SendTextParams,
  SendMediaParams,
  SendButtonsParams,
  SendResult,
} from './types';
