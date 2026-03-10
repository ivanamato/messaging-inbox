import { createRoot, type Root } from 'react-dom/client';
import { createElement, createRef } from 'react';
import { ProviderProvider } from './lib/provider-context';
import { ImperativeApiBridge, type ImperativeApi } from './imperative-bridge';
import './app/globals.css';


export type { MessagingProvider, WhatsAppProvider, ProviderType, ProviderCapabilities, ConversationIdentifierType, ConversationInitiationCapability, DeleteMessageParams, Chat, Message, SendTextParams, SendMediaParams, SendButtonsParams, SendResult, DeviceConfig, WhatsAppMultiDeviceConfig, ChatAction, ChatActionsResolver, ChatTag, ChatTagsResolver, BulkChatTagsEntry, BulkChatTagsResolver, PrebuiltMessage } from './lib/providers/types';
export { resolveInitiationCapability } from './lib/providers/types';
export type { Translations } from './lib/i18n';
export { defaultTranslations, useTranslations, TranslationsProvider } from './lib/i18n';
export { EvolutionProvider } from './lib/providers/evolution';
export { GenericServerProvider } from './lib/providers/generic-server';
export { ProviderProvider, useProvider, useDeviceContext } from './lib/provider-context';
export { createProvider } from './lib/providers/index';
export { ConversationList } from './components/conversation-list';
export { MessageView } from './components/message-view';
export { InstanceSelector } from './components/instance-selector';
export { App } from './App';

import type { WhatsAppMultiDeviceConfig, Chat, Message, SendResult, SendTextParams } from './lib/providers/types';

export type WhatsAppInbox = {
  getChats: () => Promise<Chat[]>;
  getMessages: (chatId: string, limit?: number) => Promise<Message[]>;
  sendText: (params: SendTextParams) => Promise<SendResult>;
  getConnectionState: () => Promise<'open' | 'close' | 'connecting'>;
  getActiveDevice: () => string | null;
  setActiveDevice: (deviceId: string) => void;
  selectConversation: (phoneNumber: string, prefillMessage?: string, deviceId?: string) => void;
  /**
   * Open a conversation by phone number. If no existing chat is found, opens a blank
   * message view so you can send the first message — unlike selectConversation which does nothing.
   */
  openChat: (phoneNumber: string, options?: { prefillMessage?: string; deviceId?: string }) => void;
  unmount: () => void;
};

const roots = new WeakMap<HTMLElement, Root>();

export function mount(element: HTMLElement, config: WhatsAppMultiDeviceConfig): WhatsAppInbox {
  const existing = roots.get(element);
  if (existing) {
    existing.unmount();
    roots.delete(element);
  }

  const root = createRoot(element);
  roots.set(element, root);

  const bridgeRef = createRef<ImperativeApi>();

  root.render(
    createElement(ProviderProvider, { config },
      createElement(ImperativeApiBridge, { ref: bridgeRef, chatActions: config.chatActions, chatTags: config.chatTags, chatTagsBulk: config.chatTagsBulk })
    )
  );

  function getBridge(): ImperativeApi {
    if (!bridgeRef.current) {
      throw new Error('WhatsApp Inbox is not mounted yet');
    }
    return bridgeRef.current;
  }

  return {
    getChats: () => getBridge().getChats(),
    getMessages: (chatId, limit?) => getBridge().getMessages(chatId, limit),
    sendText: (params) => getBridge().sendText(params),
    getConnectionState: () => getBridge().getConnectionState(),
    getActiveDevice: () => getBridge().getActiveDevice(),
    setActiveDevice: (deviceId) => getBridge().setActiveDevice(deviceId),
    selectConversation: (phoneNumber, prefillMessage?, deviceId?) => getBridge().selectConversation(phoneNumber, prefillMessage, deviceId),
    openChat: (phoneNumber, options?) => getBridge().openChat(phoneNumber, options),
    unmount: () => {
      root.unmount();
      roots.delete(element);
    },
  };
}

export function unmount(element: HTMLElement): void {
  const root = roots.get(element);
  if (root) {
    root.unmount();
    roots.delete(element);
  }
}
