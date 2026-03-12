/**
 * useMessageFetching - Manages message list fetching and pagination.
 *
 * Single Responsibility: Data fetching for message threads.
 * Extracted from useMessageThread for better testability and maintainability.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { Message, MessagingProvider } from '@/lib/providers/types';
import { processMessages } from '@/domain/message';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MessageFetchingState = {
  messages: Message[];
  loading: boolean;
  refreshing: boolean;
  hasMore: boolean;
  loadingMore: boolean;
};

export type MessageFetchingActions = {
  fetchInitialMessages: () => Promise<void>;
  fetchOlderMessages: () => Promise<void>;
  handleRefresh: () => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  addOptimisticMessage: (message: Message) => void;
  updateMessageStatus: (messageId: string, status: string) => void;
  markMessageDeleted: (messageId: string) => void;
  reconcileMessage: (optimisticId: string, serverMessage: Message) => void;
};

export type UseMessageFetchingParams = {
  conversationId?: string;
  instance?: string;
  provider: MessagingProvider;
  /** Called after successful fetch (for auto-read, etc.) */
  onMessagesLoaded?: (messages: Message[]) => void;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16 MB

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMessageFetching({
  conversationId,
  instance,
  provider,
  onMessagesLoaded,
}: UseMessageFetchingParams): MessageFetchingState & MessageFetchingActions {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const currentPageRef = useRef(1);
  const loadingMoreRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ─── Core Fetching ──────────────────────────────────────────────────────────

  const fetchInitialMessages = useCallback(async () => {
    if (!conversationId || !instance) return;

    try {
      const result = await provider.findMessagesPaginated(instance, conversationId, { page: 1 });
      const processed = processMessages(result.messages);
      setHasMore(result.pagination.hasMore);

      setMessages(prev => {
        // Remove optimistic messages before reconciliation
        const withoutOptimistic = prev.filter(m => !m.id.startsWith('optimistic-'));

        if (currentPageRef.current === 1) {
          // First page - check if anything changed
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

      onMessagesLoaded?.(processed);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (process.env.NODE_ENV !== 'production') {
        console.error('Error fetching messages:', error instanceof Error ? error.message : String(error));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [conversationId, instance, provider, onMessagesLoaded]);

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

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchInitialMessages();
  }, [fetchInitialMessages]);

  // ─── Optimistic Updates ─────────────────────────────────────────────────────

  const addOptimisticMessage = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const updateMessageStatus = useCallback((messageId: string, status: string) => {
    setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, status } : m)));
  }, []);

  const markMessageDeleted = useCallback((messageId: string) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === messageId ? { ...m, content: '', messageType: 'deleted', hasMedia: false } : m,
      ),
    );
  }, []);

  const reconcileMessage = useCallback((optimisticId: string, serverMessage: Message) => {
    setMessages(prev => {
      // Check if server message already exists
      if (prev.some(m => m.id === serverMessage.id)) {
        // Update existing message (reconcile optimistic)
        return prev.map(m => m.id === serverMessage.id ? { ...m, ...serverMessage } : m);
      }
      // Remove matching optimistic message and add server message
      const withoutOptimistic = prev.filter(m => {
        if (m.id !== optimisticId) return true;
        // Match by content + direction
        return !(m.direction === serverMessage.direction && m.content === serverMessage.content);
      });
      const merged = [...withoutOptimistic, serverMessage];
      merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return merged;
    });
  }, []);

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  // Reset on conversation switch
  useEffect(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    currentPageRef.current = 1;
    setHasMore(false);
    setMessages([]);
    loadingMoreRef.current = false;

    if (conversationId && instance) {
      setLoading(true);
      fetchInitialMessages();
    }
  }, [conversationId, instance]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // State
    messages,
    loading,
    refreshing,
    hasMore,
    loadingMore,
    // Actions
    fetchInitialMessages,
    fetchOlderMessages,
    handleRefresh,
    setMessages,
    addOptimisticMessage,
    updateMessageStatus,
    markMessageDeleted,
    reconcileMessage,
  };
}
