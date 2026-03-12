/**
 * useMessageThread - Facade hook composing focused message thread hooks.
 *
 * This hook composes:
 * - useMessageFetching: Data fetching and pagination
 * - useMessageSender: Sending messages
 * - useVoiceRecording: Voice recording
 * - useFileUpload: File selection and validation
 *
 * Maintains backward compatibility with the original API.
 */

import { useState, useRef, useCallback, useEffect, type RefObject } from 'react';
import { useProvider, useDeviceContext } from '@/lib/provider-context';
import { useAutoPolling } from '@/hooks/use-auto-polling';
import { useRealtimeEvents } from '@/hooks/use-realtime-events';
import { useTranslations } from '@/lib/i18n';
import type { Message, MessagingProvider } from '@/lib/providers/types';
import { processMessages, isWithin24HourWindow, createOptimisticMessage } from '@/domain/message';
import { getMediaType, validateFile, hasSuspiciousHeader, sanitizeFilename, readFileAsBase64 } from '@/domain/media';
import { useMessageFetching } from './use-message-fetching';
import { useVoiceRecording } from './use-voice-recording';
import { useFileUpload } from './use-file-upload';
import { useMessageSender } from './use-message-sender';

// Re-export for backward compatibility
export { processMessages, isWithin24HourWindow };
export { getMediaType, sanitizeFilename, readFileAsBase64 } from '@/domain/media';

/**
 * @deprecated Use getDisabledInputMessage from '@/domain/message' instead
 */
export function getDisabledInputMessage(messages: Message[], noInbound: string, outside24h: string): string {
  return messages.some(m => m.direction === 'inbound') ? outside24h : noInbound;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PrefillToken = { id: number; message: string } | null;

type Props = {
  conversationId?: string;
  phoneNumber?: string;
  instance?: string;
  /** Provider type string, used by sub-components (MessageContextMenu, etc.) */
  providerType?: string;
  providerOverride?: MessagingProvider;
  onTemplateSent?: (phoneNumber: string) => Promise<void>;
  onMessageSent?: () => void;
  /**
   * Ref owned by the component that tracks whether the scroll position is
   * near the bottom. The hook sets it to true after an optimistic send so
   * the component's scroll effect will auto-scroll.
   */
  isNearBottomRef: RefObject<boolean>;
  /** When set, pre-fills the message input once per unique token id when the conversation opens. */
  prefillToken?: PrefillToken;
};

// ─── Main Hook (Facade) ───────────────────────────────────────────────────────

export function useMessageThread({
  conversationId,
  phoneNumber,
  prefillToken,
  instance,
  providerType,
  providerOverride,
  onTemplateSent,
  onMessageSent,
  isNearBottomRef,
}: Props) {
  const contextProvider = useProvider();
  const provider = providerOverride ?? contextProvider;
  const t = useTranslations();
  const { eventBus, realtimeStates, selectedDevice } = useDeviceContext();

  const supportsTemplates = provider.capabilities.templates;
  const has24HWindow = provider.capabilities.messagingWindow24h;

  // ─── Composed Hooks ────────────────────────────────────────────────────────

  // Message fetching
  const {
    messages,
    loading,
    refreshing,
    hasMore,
    loadingMore,
    fetchInitialMessages,
    fetchOlderMessages,
    handleRefresh,
    setMessages,
    addOptimisticMessage,
    updateMessageStatus,
    markMessageDeleted,
  } = useMessageFetching({
    conversationId,
    instance,
    provider,
    onMessagesLoaded: useCallback((msgs: Message[]) => {
      // Auto-mark as read if capability + setting enabled
      if (provider.capabilities.markAsRead && selectedDevice?.autoRead !== false && conversationId && instance) {
        provider.markChatAsRead(instance, conversationId).catch(() => {});
      }
    }, [provider, selectedDevice, conversationId, instance]),
  });

  // File upload
  const {
    selectedFile,
    filePreview,
    fileError,
    handleFileSelect,
    handleRemoveFile,
    setFileError,
  } = useFileUpload();

  // Voice recording
  const {
    recordingState,
    recordingDuration,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceRecording({
    phoneNumber,
    instance,
    provider,
    onMessageSent,
    isNearBottomRef,
    addOptimisticMessage,
  });

  // Message sender
  const {
    sending,
    sendText,
    sendFile,
    sendPrebuiltAudio,
    sendPrebuiltMedia,
    sendPastedImage,
  } = useMessageSender({
    phoneNumber,
    instance,
    provider,
    onMessageSent,
    refreshMessages: fetchInitialMessages,
    isNearBottomRef,
    addOptimisticMessage,
    markMessageFailed: useCallback((id: string) => updateMessageStatus(id, 'failed'), [updateMessageStatus]),
  });

  // ─── Local State ────────────────────────────────────────────────────────────

  const [messageInput, setMessageInput] = useState('');
  const [canSendRegularMessage, setCanSendRegularMessage] = useState(true);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showInteractiveDialog, setShowInteractiveDialog] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);

  const appliedPrefillIdRef = useRef<number | null>(null);
  const currentPageRef = useRef(1);

  // ─── Prefill ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (prefillToken && prefillToken.id !== appliedPrefillIdRef.current) {
      appliedPrefillIdRef.current = prefillToken.id;
      setMessageInput(prefillToken.message);
    }
  }, [conversationId, prefillToken]);

  // ─── 24-hour Window Gate ─────────────────────────────────────────────────────

  useEffect(() => {
    setCanSendRegularMessage(has24HWindow ? isWithin24HourWindow(messages) : true);
  }, [messages, has24HWindow]);

  // ─── Auto-polling (fallback when WS not connected) ──────────────────────────

  const wsConnected = selectedDevice ? realtimeStates[selectedDevice.id] === 'connected' : false;

  useAutoPolling({
    interval: 5000,
    enabled: !!conversationId && !!instance && !wsConnected,
    onPoll: fetchInitialMessages,
  });

  // ─── Realtime Event Handling ────────────────────────────────────────────────

  useRealtimeEvents(eventBus, {
    type: ['message.new', 'message.updated', 'message.deleted'],
  }, useCallback((event) => {
    if (!conversationId) return;

    if (event.type === 'message.new') {
      const { chatId, message } = event.payload;
      // Only process events for the currently viewed chat
      if (chatId !== conversationId && message.phoneNumber !== phoneNumber) return;

      setMessages(prev => {
        // Deduplicate against optimistic messages and existing messages
        if (prev.some(m => m.id === message.id)) {
          // Update existing message (reconcile optimistic)
          return prev.map(m => m.id === message.id ? { ...m, ...message } : m);
        }
        // Remove matching optimistic message if we can identify it
        const withoutOptimistic = prev.filter(m => {
          if (!m.id.startsWith('optimistic-')) return true;
          // Match by content + direction + proximity in time
          return !(m.direction === message.direction && m.content === message.content);
        });
        const merged = [...withoutOptimistic, message];
        merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return merged;
      });
      // Auto-scroll for new incoming messages
      isNearBottomRef.current = true;
    } else if (event.type === 'message.updated') {
      const { chatId, messageId, status } = event.payload;
      if (chatId !== conversationId) return;
      updateMessageStatus(messageId, status);
    } else if (event.type === 'message.deleted') {
      const { chatId, messageId } = event.payload;
      if (chatId !== conversationId) return;
      markMessageDeleted(messageId);
    }
  }, [conversationId, phoneNumber, isNearBottomRef, setMessages, updateMessageStatus, markMessageDeleted]));

  // ─── Combined Send Function ─────────────────────────────────────────────────

  const send = useCallback(async () => {
    if ((!messageInput.trim() && !selectedFile) || sending) return;

    if (selectedFile) {
      await sendFile(selectedFile, messageInput);
      handleRemoveFile();
    } else {
      await sendText(messageInput);
    }
    setMessageInput('');
  }, [messageInput, selectedFile, sending, sendFile, sendText, handleRemoveFile]);

  // ─── Template Handler ────────────────────────────────────────────────────────

  const handleTemplateSentInternal = useCallback(async () => {
    await fetchInitialMessages();
    if (phoneNumber && onTemplateSent) {
      await onTemplateSent(phoneNumber);
    }
  }, [fetchInitialMessages, phoneNumber, onTemplateSent]);

  // ─── Pasted File Handler ────────────────────────────────────────────────────

  const sendPastedFile = useCallback(async (file: File, caption: string) => {
    await sendPastedImage(file, caption);
  }, [sendPastedImage]);

  // ─── Return API (Backward Compatible) ───────────────────────────────────────

  return {
    messages,
    loading,
    refreshing,
    hasMore,
    loadingMore,
    messageInput,
    setMessageInput,
    sending,
    selectedFile,
    filePreview,
    fileError,
    setFileError,
    canSendRegularMessage,
    showTemplateDialog,
    setShowTemplateDialog,
    showInteractiveDialog,
    setShowInteractiveDialog,
    forwardMessage,
    setForwardMessage,
    fetchInitialMessages,
    fetchOlderMessages,
    handleFileSelect,
    handleRemoveFile,
    send,
    handleTemplateSentInternal,
    handleRefresh,
    supportsTemplates,
    has24HourWindow: has24HWindow,
    currentPageRef,
    recordingState,
    recordingDuration,
    startRecording,
    stopRecording,
    cancelRecording,
    sendPastedFile,
    sendPrebuiltAudio,
    sendPrebuiltMedia,
  };
}
