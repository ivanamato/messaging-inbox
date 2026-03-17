/**
 * useMessageSender - Manages sending messages (text, media, prebuilt).
 *
 * Single Responsibility: Message sending operations.
 * Extracted from useMessageThread for better testability and maintainability.
 */

import { useState, useCallback, type RefObject } from 'react';
import type { Message, MessagingProvider } from '@/lib/providers/types';
import { createOptimisticMessage, createOptimisticMediaMessage } from '@/domain/message';
import { getMediaType, sanitizeFilename, readFileAsBase64 } from '@/domain/media';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MessageSenderState = {
  sending: boolean;
};

export type MessageSenderActions = {
  sendText: (text: string) => Promise<void>;
  sendFile: (file: File, caption: string) => Promise<void>;
  sendPrebuiltAudio: (base64: string, mimeType: string) => Promise<void>;
  sendPrebuiltMedia: (base64: string, mediaType: 'image' | 'video', mimeType: string, label: string) => Promise<void>;
  sendPastedImage: (file: File, caption: string) => Promise<void>;
};

export type UseMessageSenderParams = {
  phoneNumber?: string;
  instance?: string;
  provider: MessagingProvider;
  /** Called after message is successfully sent */
  onMessageSent?: () => void;
  /** Callback to refresh messages after send */
  refreshMessages: () => Promise<void>;
  /** Ref to signal scroll-to-bottom for new messages */
  isNearBottomRef: RefObject<boolean>;
  /** Callback to add optimistic message to thread */
  addOptimisticMessage: (message: Message) => void;
  /** Callback to mark message as failed */
  markMessageFailed: (messageId: string) => void;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMessageSender({
  phoneNumber,
  instance,
  provider,
  onMessageSent,
  refreshMessages,
  isNearBottomRef,
  addOptimisticMessage,
  markMessageFailed,
}: UseMessageSenderParams): MessageSenderState & MessageSenderActions {
  const [sending, setSending] = useState(false);

  // ─── Text Messages ──────────────────────────────────────────────────────────

  const sendText = useCallback(async (text: string) => {
    if (!text.trim() || !phoneNumber || !instance || sending) return;

    const content = text.trim();
    const optimisticId = `optimistic-${Date.now()}`;

    const optimisticMessage: Message = {
      ...createOptimisticMessage({
        id: optimisticId,
        content,
        direction: 'outbound',
        phoneNumber,
      }),
      direction: 'outbound',
    };

    addOptimisticMessage(optimisticMessage);
    isNearBottomRef.current = true;
    setSending(true);

    try {
      await provider.sendText(instance, { to: phoneNumber, body: content });
      await refreshMessages();
      onMessageSent?.();
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Error sending message:', error instanceof Error ? error.message : String(error));
      }
      markMessageFailed(optimisticId);
    } finally {
      setSending(false);
    }
  }, [phoneNumber, instance, sending, provider, refreshMessages, onMessageSent, isNearBottomRef, addOptimisticMessage, markMessageFailed]);

  // ─── File Messages ──────────────────────────────────────────────────────────

  const sendFile = useCallback(async (file: File, caption: string) => {
    if (!phoneNumber || !instance || sending) return;

    const text = caption.trim();
    const optimisticId = `optimistic-${Date.now()}`;
    const mediaType = getMediaType(file.type);
    const localBlobUrl = URL.createObjectURL(file);

    const optimisticMessage: Message = {
      ...createOptimisticMessage({
        id: optimisticId,
        content: text || file.name,
        direction: 'outbound',
        phoneNumber,
        hasMedia: true,
        messageType: mediaType,
        caption: text || null,
        filename: file.name,
        mimeType: file.type,
        mediaData: { url: localBlobUrl, contentType: file.type, filename: file.name },
      }),
      direction: 'outbound',
    };

    addOptimisticMessage(optimisticMessage);
    isNearBottomRef.current = true;
    setSending(true);

    try {
      const base64 = await readFileAsBase64(file);
      await provider.sendMedia(instance, {
        to: phoneNumber,
        mediaType,
        media: base64,
        caption: text || undefined,
        fileName: sanitizeFilename(file.name, 'unnamed'),
        mimeType: file.type,
      });
      await refreshMessages();
      onMessageSent?.();
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Error sending file:', error instanceof Error ? error.message : String(error));
      }
      markMessageFailed(optimisticId);
    } finally {
      setSending(false);
    }
  }, [phoneNumber, instance, sending, provider, refreshMessages, onMessageSent, isNearBottomRef, addOptimisticMessage, markMessageFailed]);

  // ─── Pasted Images ──────────────────────────────────────────────────────────

  const sendPastedImage = useCallback(async (file: File, caption: string) => {
    if (!phoneNumber || !instance || sending) return;

    const text = caption.trim();
    const optimisticId = `optimistic-${Date.now()}`;
    const mediaType = getMediaType(file.type);
    const localBlobUrl = URL.createObjectURL(file);

    const optimisticMessage: Message = {
      ...createOptimisticMessage({
        id: optimisticId,
        content: text || file.name,
        direction: 'outbound',
        phoneNumber,
        hasMedia: true,
        messageType: mediaType,
        caption: text || null,
        filename: file.name,
        mimeType: file.type,
        mediaData: { url: localBlobUrl, contentType: file.type, filename: file.name },
      }),
      direction: 'outbound',
    };

    addOptimisticMessage(optimisticMessage);
    isNearBottomRef.current = true;
    setSending(true);

    try {
      const base64 = await readFileAsBase64(file);
      await provider.sendMedia(instance, {
        to: phoneNumber,
        mediaType,
        media: base64,
        caption: text || undefined,
        fileName: sanitizeFilename(file.name, 'pasted-image'),
        mimeType: file.type,
      });
      await refreshMessages();
      onMessageSent?.();
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Error sending pasted image:', error instanceof Error ? error.message : String(error));
      }
      markMessageFailed(optimisticId);
    } finally {
      setSending(false);
    }
  }, [phoneNumber, instance, sending, provider, refreshMessages, onMessageSent, isNearBottomRef, addOptimisticMessage, markMessageFailed]);

  // ─── Prebuilt Audio (Voice Notes) ───────────────────────────────────────────

  const sendPrebuiltAudio = useCallback(async (base64: string, mimeType: string) => {
    if (!phoneNumber || !instance || sending) return;

    const optimisticId = `optimistic-${Date.now()}`;
    const audioDataUrl = `data:${mimeType};base64,${base64}`;
    const optimisticMessage: Message = {
      ...createOptimisticMessage({
        id: optimisticId,
        content: 'Voice message',
        direction: 'outbound',
        phoneNumber,
        hasMedia: true,
        messageType: 'audio',
        filename: 'voice.ogg',
        mimeType,
        mediaData: { url: audioDataUrl, contentType: mimeType, filename: 'voice.ogg' },
      }),
      direction: 'outbound',
    };

    addOptimisticMessage(optimisticMessage);
    isNearBottomRef.current = true;
    setSending(true);

    try {
      await provider.sendMedia(instance, {
        to: phoneNumber,
        mediaType: 'audio',
        media: base64,
        fileName: 'voice.ogg',
        mimeType,
        ptt: true,
      });
      await refreshMessages();
      onMessageSent?.();
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Error sending prebuilt audio:', error instanceof Error ? error.message : String(error));
      }
      markMessageFailed(optimisticId);
    } finally {
      setSending(false);
    }
  }, [phoneNumber, instance, sending, provider, refreshMessages, onMessageSent, isNearBottomRef, addOptimisticMessage, markMessageFailed]);

  // ─── Prebuilt Media (Images/Videos from Prebuilt Messages) ────────────────

  const sendPrebuiltMedia = useCallback(async (
    base64: string,
    mediaType: 'image' | 'video',
    mimeType: string,
    label: string,
  ) => {
    if (!phoneNumber || !instance || sending) return;

    const filename = mediaType === 'image' ? 'image.jpg' : 'video.mp4';
    const optimisticId = `optimistic-${Date.now()}`;
    const mediaDataUrl = `data:${mimeType};base64,${base64}`;

    const optimisticMessage: Message = {
      ...createOptimisticMediaMessage(phoneNumber, mediaType, label, mimeType),
      id: optimisticId,
      direction: 'outbound',
      mediaData: { url: mediaDataUrl, contentType: mimeType, filename },
    };

    addOptimisticMessage(optimisticMessage);
    isNearBottomRef.current = true;
    setSending(true);

    try {
      await provider.sendMedia(instance, {
        to: phoneNumber,
        mediaType,
        media: base64,
        fileName: filename,
        mimeType,
      });
      await refreshMessages();
      onMessageSent?.();
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Error sending prebuilt media:', error instanceof Error ? error.message : String(error));
      }
      markMessageFailed(optimisticId);
    } finally {
      setSending(false);
    }
  }, [phoneNumber, instance, sending, provider, refreshMessages, onMessageSent, isNearBottomRef, addOptimisticMessage, markMessageFailed]);

  return {
    // State
    sending,
    // Actions
    sendText,
    sendFile,
    sendPrebuiltAudio,
    sendPrebuiltMedia,
    sendPastedImage,
  };
}
