import { useState, useRef, useEffect, useCallback, type RefObject } from 'react';
import { useDeviceContext } from '@/lib/provider-context';
import type { Conversation } from './types';
import type { ProviderType } from '@/lib/providers/types';

/** Minimal ref interface — avoids importing from the component layer. */
type ConversationListHandle = {
  refresh: () => Promise<Conversation[]>;
};

export function useAppState(conversationListRef: RefObject<ConversationListHandle | null>) {
  const { selectedDevice, readonly: isReadonly, viewMode, devices, getProviderForDevice } = useDeviceContext();
  const [selectedConversation, setSelectedConversation] = useState<Conversation | undefined>();

  // Clear conversation and refresh chat list when device changes
  const prevDeviceIdRef = useRef(selectedDevice?.id);
  useEffect(() => {
    if (selectedDevice && prevDeviceIdRef.current !== selectedDevice.id) {
      prevDeviceIdRef.current = selectedDevice.id;
      setSelectedConversation(undefined);
      conversationListRef.current?.refresh();
    }
  }, [selectedDevice, conversationListRef]);

  // Clear conversation and refresh chat list when view mode changes
  const prevViewModeRef = useRef(viewMode);
  useEffect(() => {
    if (prevViewModeRef.current !== viewMode) {
      prevViewModeRef.current = viewMode;
      setSelectedConversation(undefined);
      conversationListRef.current?.refresh();
    }
  }, [viewMode, conversationListRef]);

  // Keyboard navigation: Escape to go back to list
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedConversation) {
        const hasDialog =
        document.querySelector('[data-radix-dialog-overlay]') ||
        document.querySelector('[data-testid="prebuilt-messages-dialog"]');
      if (!hasDialog) setSelectedConversation(undefined);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedConversation]);

  // Resolve instance, provider, readOnly, and providerOverride based on view mode
  const chatDevice =
    viewMode === 'all' && selectedConversation?.deviceId
      ? devices.find(d => d.id === selectedConversation.deviceId)
      : undefined;

  const instance = viewMode === 'all' ? chatDevice?.instanceName : selectedDevice?.instanceName;
  const provider = ((viewMode === 'all' ? chatDevice?.providerType : selectedDevice?.providerType) ?? 'evolution') as ProviderType;
  const effectiveReadOnly = viewMode === 'all' ? (chatDevice?.readonly ?? false) : isReadonly;
  const providerOverride = viewMode === 'all' && chatDevice ? getProviderForDevice(chatDevice) : undefined;

  const handleTemplateSent = useCallback(
    async (phoneNumber: string) => {
      const conversations = await conversationListRef.current?.refresh();
      if (conversations) {
        const found = conversations.find(c => c.phoneNumber === phoneNumber);
        if (found) setSelectedConversation(found);
      }
    },
    [conversationListRef],
  );

  const handleBackToList = useCallback(() => setSelectedConversation(undefined), []);

  return {
    selectedConversation,
    setSelectedConversation,
    handleBackToList,
    handleTemplateSent,
    instance,
    provider,
    effectiveReadOnly,
    providerOverride,
  };
}
