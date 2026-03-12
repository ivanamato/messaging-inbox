import { useState, useRef, useCallback, useEffect, type RefObject } from 'react';
import { differenceInHours, isValid } from 'date-fns';
import { useProvider, useDeviceContext } from '@/lib/provider-context';
import { useAutoPolling } from '@/hooks/use-auto-polling';
import { useRealtimeEvents } from '@/hooks/use-realtime-events';
import { useTranslations } from '@/lib/i18n';
import type { Message, MessagingProvider } from '@/lib/providers/types';

// ─── Pure helpers ────────────────────────────────────────────────────────────

export function isWithin24HourWindow(messages: Message[]): boolean {
  const inbound = messages.filter(m => m.direction === 'inbound');
  if (inbound.length === 0) return false;
  const last = inbound[inbound.length - 1];
  try {
    const date = new Date(last.createdAt);
    return isValid(date) && differenceInHours(new Date(), date) < 24;
  } catch {
    return false;
  }
}

export function getDisabledInputMessage(messages: Message[], noInbound: string, outside24h: string): string {
  return messages.some(m => m.direction === 'inbound') ? outside24h : noInbound;
}

export function processMessages(data: Message[]): Message[] {
  const reactions = data.filter(m => m.messageType === 'reaction');
  const regular = data.filter(m => m.messageType !== 'reaction');
  const reactionMap = new Map<string, string>();
  reactions.forEach(r => {
    if (r.reactedToMessageId && r.reactionEmoji) {
      reactionMap.set(r.reactedToMessageId, r.reactionEmoji);
    }
  });
  return regular
    .map(m => {
      const emoji = reactionMap.get(m.id);
      return emoji ? { ...m, reactionEmoji: emoji } : m;
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getMediaType(mimeType: string): 'image' | 'video' | 'audio' | 'document' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

// ─── Hook ────────────────────────────────────────────────────────────────────

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

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [canSendRegularMessage, setCanSendRegularMessage] = useState(true);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showInteractiveDialog, setShowInteractiveDialog] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'processing'>('idle');
  const [recordingDuration, setRecordingDuration] = useState(0);

  const currentPageRef = useRef(1);
  const loadingMoreRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appliedPrefillIdRef = useRef<number | null>(null);

  // ─── Prefill ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (prefillToken && prefillToken.id !== appliedPrefillIdRef.current) {
      appliedPrefillIdRef.current = prefillToken.id;
      setMessageInput(prefillToken.message);
    }
  }, [conversationId, prefillToken]);

  // ─── Data fetching ──────────────────────────────────────────────────────

  const fetchInitialMessages = useCallback(async () => {
    if (!conversationId || !instance) return;
    try {
      const result = await provider.findMessagesPaginated(instance, conversationId, { page: 1 });
      const processed = processMessages(result.messages);
      setHasMore(result.pagination.hasMore);
      setMessages(prev => {
        const withoutOptimistic = prev.filter(m => !m.id.startsWith('optimistic-'));
        if (currentPageRef.current === 1) {
          if (withoutOptimistic.length !== processed.length) return processed;
          const changed = processed.some(
            (msg, i) =>
              msg.id !== withoutOptimistic[i]?.id ||
              msg.status !== withoutOptimistic[i]?.status ||
              msg.reactionEmoji !== withoutOptimistic[i]?.reactionEmoji,
          );
          return changed ? processed : prev;
        }
        // Auto-poll with older pages loaded — merge without losing older messages
        const olderMessages = withoutOptimistic.filter(m => !processed.some(p => p.id === m.id));
        const merged = [...olderMessages, ...processed];
        merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const changed =
          merged.length !== withoutOptimistic.length ||
          merged.some(
            (msg, i) =>
              msg.id !== withoutOptimistic[i]?.id ||
              msg.status !== withoutOptimistic[i]?.status ||
              msg.reactionEmoji !== withoutOptimistic[i]?.reactionEmoji,
          );
        return changed ? merged : prev;
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (process.env.NODE_ENV !== 'production') {
        console.error('Error fetching messages:', error instanceof Error ? error.message : String(error));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [conversationId, instance, provider]);

  const fetchOlderMessages = useCallback(async () => {
    if (!conversationId || !instance || !hasMore || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const nextPage = currentPageRef.current + 1;
    try {
      const result = await provider.findMessagesPaginated(instance, conversationId, { page: nextPage });
      const processed = processMessages(result.messages);
      currentPageRef.current = nextPage;
      setHasMore(result.pagination.hasMore);
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const newOlder = processed.filter(m => !existingIds.has(m.id));
        const merged = [...newOlder, ...prev];
        merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return merged;
      });
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Error fetching older messages:', error instanceof Error ? error.message : String(error));
      }
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [conversationId, instance, provider, hasMore]);

  // Reset on conversation switch
  useEffect(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    currentPageRef.current = 1;
    setHasMore(false);
    setMessages([]);
    setFileError(null);
    loadingMoreRef.current = false;
    if (conversationId && instance) {
      setLoading(true);
      fetchInitialMessages();
      if (provider.capabilities.markAsRead && (selectedDevice?.autoRead !== false)) {
        provider.markChatAsRead(instance, conversationId).catch(() => {});
      }
    }
  }, [conversationId, instance]); // eslint-disable-line react-hooks/exhaustive-deps

  // 24-hour window gate (providers with messagingWindow24h capability only)
  useEffect(() => {
    setCanSendRegularMessage(has24HWindow ? isWithin24HourWindow(messages) : true);
  }, [messages, has24HWindow]);

  // Disable polling when WS is connected for the active device
  const wsConnected = selectedDevice ? realtimeStates[selectedDevice.id] === 'connected' : false;

  useAutoPolling({
    interval: 5000,
    enabled: !!conversationId && !!instance && !wsConnected,
    onPoll: fetchInitialMessages,
  });

  // Realtime: subscribe to message events for the current chat
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
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, status } : m));
    } else if (event.type === 'message.deleted') {
      const { chatId, messageId } = event.payload;
      if (chatId !== conversationId) return;
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: '', messageType: 'deleted', hasMedia: false } : m));
    }
  }, [conversationId, phoneNumber, isNearBottomRef]));

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchInitialMessages();
  }, [fetchInitialMessages]);

  // ─── File handling ──────────────────────────────────────────────────────

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setFilePreview(null);
    setFileError(null);
  }, []);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setFileError(null);

      if (file.size > 16 * 1024 * 1024) {
        setFileError(t('messageView.fileTooLarge') || 'File exceeds 16 MB limit');
        e.target.value = '';
        return;
      }

      const allowedPrefixes = ['image/', 'video/', 'audio/'];
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];
      if (
        !allowedPrefixes.some(p => file.type.startsWith(p)) &&
        !allowedTypes.includes(file.type)
      ) {
        setFileError(t('messageView.fileTypeNotAllowed') || 'File type not supported');
        e.target.value = '';
        return;
      }

      try {
        const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
        const headerText = new TextDecoder().decode(header);
        if (headerText.startsWith('<') || headerText.startsWith('<!')) {
          setFileError(t('messageView.fileTypeNotAllowed') || 'File type not supported');
          e.target.value = '';
          return;
        }
      } catch {
        // If we can't read the header, allow it (fallback to server-side validation)
      }

      setSelectedFile(file);

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => setFilePreview(reader.result as string);
        reader.readAsDataURL(file);
      } else {
        setFilePreview(null);
      }
    },
    [t],
  );

  // ─── Send ───────────────────────────────────────────────────────────────

  const send = useCallback(async () => {
    if ((!messageInput.trim() && !selectedFile) || !phoneNumber || !instance || sending) return;

    const text = messageInput.trim();
    const file = selectedFile;

    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      direction: 'outbound',
      content: file ? (text || file.name) : text,
      createdAt: new Date().toISOString(),
      status: 'pending',
      phoneNumber,
      hasMedia: !!file,
      messageType: file ? getMediaType(file.type) : 'text',
      caption: file && text ? text : null,
      reactionEmoji: null,
      reactedToMessageId: null,
      filename: file?.name || null,
      mimeType: file?.type || null,
    };

    setMessages(prev => [...prev, optimisticMessage]);
    setMessageInput('');
    handleRemoveFile();
    // Signal the component to scroll to bottom on the next messages effect
    isNearBottomRef.current = true;

    setSending(true);
    try {
      if (file) {
        const base64 = await readFileAsBase64(file);
        await provider.sendMedia(instance, {
          to: phoneNumber,
          mediaType: getMediaType(file.type),
          media: base64,
          caption: text || undefined,
          fileName: file.name
            .replace(/[\x00-\x1f/\\:*?"<>|]/g, '_')
            .replace(/^\.+/, '_')
            .replace(/[.\s]+$/, '')
            .slice(0, 255) || 'unnamed',
          mimeType: file.type,
        });
      } else {
        await provider.sendText(instance, { to: phoneNumber, body: text });
      }
      await fetchInitialMessages();
      onMessageSent?.();
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Error sending message:', error instanceof Error ? error.message : String(error));
      }
      setMessages(prev => prev.map(m => (m.id === optimisticId ? { ...m, status: 'failed' } : m)));
    } finally {
      setSending(false);
    }
  }, [messageInput, selectedFile, phoneNumber, instance, sending, provider, handleRemoveFile, fetchInitialMessages, isNearBottomRef]);

  const handleTemplateSentInternal = useCallback(async () => {
    await fetchInitialMessages();
    if (phoneNumber && onTemplateSent) {
      await onTemplateSent(phoneNumber);
    }
  }, [fetchInitialMessages, phoneNumber, onTemplateSent]);

  const sendPastedFile = useCallback(async (file: File, caption: string) => {
    if (!phoneNumber || !instance || sending) return;
    const text = caption.trim();
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      direction: 'outbound',
      content: text || file.name,
      createdAt: new Date().toISOString(),
      status: 'pending',
      phoneNumber,
      hasMedia: true,
      messageType: getMediaType(file.type),
      caption: text || null,
      reactionEmoji: null,
      reactedToMessageId: null,
      filename: file.name,
      mimeType: file.type,
    };
    setMessages(prev => [...prev, optimisticMessage]);
    isNearBottomRef.current = true;
    setSending(true);
    try {
      const base64 = await readFileAsBase64(file);
      await provider.sendMedia(instance, {
        to: phoneNumber,
        mediaType: getMediaType(file.type),
        media: base64,
        caption: text || undefined,
        fileName: file.name
          .replace(/[\x00-\x1f/\\:*?"<>|]/g, '_')
          .replace(/^\.+/, '_')
          .replace(/[.\s]+$/, '')
          .slice(0, 255) || 'unnamed',
        mimeType: file.type,
      });
      await fetchInitialMessages();
      onMessageSent?.();
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Error sending pasted file:', error instanceof Error ? error.message : String(error));
      }
      setMessages(prev => prev.map(m => (m.id === optimisticId ? { ...m, status: 'failed' } : m)));
    } finally {
      setSending(false);
    }
  }, [phoneNumber, instance, sending, provider, fetchInitialMessages, onMessageSent, isNearBottomRef]);

  const sendPrebuiltAudio = useCallback(async (base64: string, mimeType: string) => {
    if (!phoneNumber || !instance || sending) return;
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      direction: 'outbound',
      content: 'Voice message',
      createdAt: new Date().toISOString(),
      status: 'pending',
      phoneNumber,
      hasMedia: true,
      messageType: 'audio',
      caption: null,
      reactionEmoji: null,
      reactedToMessageId: null,
      filename: 'voice.ogg',
      mimeType,
    };
    setMessages(prev => [...prev, optimisticMessage]);
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
      await fetchInitialMessages();
      onMessageSent?.();
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Error sending prebuilt audio:', error instanceof Error ? error.message : String(error));
      }
      setMessages(prev => prev.map(m => (m.id === optimisticId ? { ...m, status: 'failed' } : m)));
    } finally {
      setSending(false);
    }
  }, [phoneNumber, instance, sending, provider, fetchInitialMessages, onMessageSent, isNearBottomRef]);

  const sendPrebuiltMedia = useCallback(async (
    base64: string,
    mediaType: 'image' | 'video',
    mimeType: string,
    label: string,
  ) => {
    if (!phoneNumber || !instance || sending) return;
    const filename = mediaType === 'image' ? 'image.jpg' : 'video.mp4';
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      direction: 'outbound',
      content: label,
      createdAt: new Date().toISOString(),
      status: 'pending',
      phoneNumber,
      hasMedia: true,
      messageType: mediaType,
      caption: null,
      reactionEmoji: null,
      reactedToMessageId: null,
      filename,
      mimeType,
    };
    setMessages(prev => [...prev, optimisticMessage]);
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
      await fetchInitialMessages();
      onMessageSent?.();
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Error sending prebuilt media:', error instanceof Error ? error.message : String(error));
      }
      setMessages(prev => prev.map(m => (m.id === optimisticId ? { ...m, status: 'failed' } : m)));
    } finally {
      setSending(false);
    }
  }, [phoneNumber, instance, sending, provider, fetchInitialMessages, onMessageSent, isNearBottomRef]);

  // ─── Voice recording ────────────────────────────────────────────────────

  const stopRecordingCleanup = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setRecordingDuration(0);
    recordingChunksRef.current = [];
    mediaRecorderRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordingChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const chunks = recordingChunksRef.current;
        stopRecordingCleanup();

        if (chunks.length === 0 || !phoneNumber || !instance) {
          setRecordingState('idle');
          return;
        }

        setRecordingState('processing');
        const blob = new Blob(chunks, { type: recorder.mimeType });

        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const optimisticId = `optimistic-${Date.now()}`;
          const optimisticMessage: Message = {
            id: optimisticId,
            direction: 'outbound',
            content: 'Voice message',
            createdAt: new Date().toISOString(),
            status: 'pending',
            phoneNumber,
            hasMedia: true,
            messageType: 'audio',
            caption: null,
            reactionEmoji: null,
            reactedToMessageId: null,
            filename: 'voice.ogg',
            mimeType: blob.type,
          };
          setMessages(prev => [...prev, optimisticMessage]);
          isNearBottomRef.current = true;

          await provider.sendMedia(instance, {
            to: phoneNumber,
            mediaType: 'audio',
            media: base64,
            fileName: 'voice.ogg',
            mimeType: blob.type,
            ptt: true,
          });
          await fetchInitialMessages();
          onMessageSent?.();
        } catch (error) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('Error sending voice message:', error instanceof Error ? error.message : String(error));
          }
        } finally {
          setRecordingState('idle');
        }
      };

      recorder.start(100);
      setRecordingState('recording');
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(d => d + 1);
      }, 1000);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Could not start recording:', error instanceof Error ? error.message : String(error));
      }
    }
  }, [phoneNumber, instance, provider, fetchInitialMessages, onMessageSent, stopRecordingCleanup, isNearBottomRef]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }, []);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null;
      recorder.onstop = () => {
        recorder.stream?.getTracks().forEach(t => t.stop());
      };
      recorder.stop();
    }
    stopRecordingCleanup();
    setRecordingState('idle');
  }, [stopRecordingCleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

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
