import { useState, useMemo, useCallback, useEffect } from 'react';
import { useProvider, useDeviceContext } from '@/lib/provider-context';
import { useAutoPolling } from '@/hooks/use-auto-polling';
import { useRealtimeEvents } from '@/hooks/use-realtime-events';
import type { ChatTagsResolver, BulkChatTagsResolver, BulkChatTagsEntry, ChatTag } from '@/lib/providers/types';
import type { Conversation } from './types';

type Props = {
  instance?: string;
  chatTags?: ChatTagsResolver;
  chatTagsBulk?: BulkChatTagsResolver;
};

export function useChatList({ instance, chatTags, chatTagsBulk }: Props) {
  const provider = useProvider();
  const { viewMode, devices, getProviderForDevice, selectedDevice, eventBus, realtimeStates } = useDeviceContext();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagMap, setTagMap] = useState<Map<string, ChatTag[]>>(new Map());
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());

  const doFetch = useCallback(async (): Promise<Conversation[]> => {
    if (viewMode === 'all') {
      const MAX_CONCURRENT = 3;
      const results: PromiseSettledResult<Conversation[]>[] = [];
      const pending: Promise<void>[] = [];

      for (const device of devices) {
        const task = (async () => {
          try {
            const deviceProvider = getProviderForDevice(device);
            const chats = await deviceProvider.findChats(device.instanceName);
            results.push({
              status: 'fulfilled',
              value: chats.map(chat => ({
                id: chat.id,
                phoneNumber: chat.phoneNumber,
                status: 'active',
                lastActiveAt: chat.lastActiveAt || '',
                contactName: chat.contactName,
                profilePicUrl: chat.profilePicUrl,
                lastMessage: chat.lastMessage,
                unreadCount: chat.unreadCount,
                deviceId: device.id,
                deviceLabel: device.label || device.instanceName,
              })),
            });
          } catch (reason) {
            results.push({ status: 'rejected', reason });
          }
        })();

        pending.push(task);

        if (pending.length >= MAX_CONCURRENT) {
          await Promise.race(pending);
          for (let i = pending.length - 1; i >= 0; i--) {
            const settled = await Promise.race([pending[i].then(() => true), Promise.resolve(false)]);
            if (settled) pending.splice(i, 1);
          }
        }
      }

      await Promise.all(pending);

      const merged: Conversation[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled') merged.push(...result.value);
      }
      merged.sort((a, b) => {
        if (!a.lastActiveAt) return 1;
        if (!b.lastActiveAt) return -1;
        return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
      });
      return merged;
    }

    if (!instance) return [];
    const chats = await provider.findChats(instance);
    return chats.map(chat => ({
      id: chat.id,
      phoneNumber: chat.phoneNumber,
      status: 'active',
      lastActiveAt: chat.lastActiveAt || '',
      contactName: chat.contactName,
      profilePicUrl: chat.profilePicUrl,
      lastMessage: chat.lastMessage,
      unreadCount: chat.unreadCount,
    }));
  }, [viewMode, devices, getProviderForDevice, instance, provider]);

  const fetchConversations = useCallback(async () => {
    if (viewMode === 'single' && !instance) {
      setConversations([]);
      setLoading(false);
      return;
    }
    try {
      const mapped = await doFetch();
      setConversations(mapped);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Error fetching conversations:', error instanceof Error ? error.message : String(error));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [viewMode, instance, doFetch]);

  /** Imperatively refresh — returns the new conversation list. */
  const refresh = useCallback(async (): Promise<Conversation[]> => {
    if (viewMode === 'single' && !instance) return [];
    setRefreshing(true);
    try {
      const mapped = await doFetch();
      setConversations(mapped);
      return mapped;
    } catch {
      return [];
    } finally {
      setRefreshing(false);
    }
  }, [viewMode, instance, doFetch]);

  // Determine if all active devices are WS-connected (so we can skip polling)
  const wsConnectedForActive = useMemo(() => {
    if (viewMode === 'all') {
      return devices.every(d => realtimeStates[d.id] === 'connected');
    }
    if (selectedDevice) {
      return realtimeStates[selectedDevice.id] === 'connected';
    }
    return false;
  }, [viewMode, devices, selectedDevice, realtimeStates]);

  const { isPolling } = useAutoPolling({
    interval: 10000,
    enabled: (viewMode === 'all' || !!instance) && !wsConnectedForActive,
    onPoll: fetchConversations,
  });

  // Realtime: subscribe to chat events and do an incremental merge
  useRealtimeEvents(eventBus, { type: ['chat.updated', 'chat.new', 'message.new'] }, useCallback((event) => {
    if (event.type === 'message.new') {
      const { chatId, message } = event.payload;
      setConversations(prev => {
        const idx = prev.findIndex(c =>
          c.id === chatId || c.phoneNumber === message.phoneNumber,
        );
        if (idx < 0) return prev; // Unknown chat — full refresh will pick it up
        const updated = [...prev];
        const conv = { ...updated[idx] };
        conv.lastActiveAt = message.createdAt;
        conv.lastMessage = { content: message.content, direction: message.direction, type: message.messageType };
        if (message.direction === 'inbound') {
          conv.unreadCount = (conv.unreadCount ?? 0) + 1;
        }
        updated[idx] = conv;
        // Re-sort by recency
        updated.sort((a, b) => {
          if (!a.lastActiveAt) return 1;
          if (!b.lastActiveAt) return -1;
          return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
        });
        return updated;
      });
    } else if (event.type === 'chat.updated') {
      const { chat } = event.payload;
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === chat.id);
        if (idx < 0) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...chat };
        return updated;
      });
    } else if (event.type === 'chat.new') {
      const { chat } = event.payload;
      setConversations(prev => {
        if (prev.some(c => c.id === chat.id)) return prev;
        return [{
          id: chat.id,
          phoneNumber: chat.phoneNumber,
          status: 'active',
          lastActiveAt: chat.lastActiveAt || '',
          contactName: chat.contactName,
          profilePicUrl: chat.profilePicUrl,
          lastMessage: chat.lastMessage,
          unreadCount: chat.unreadCount,
          deviceId: event.deviceId,
        }, ...prev];
      });
    }
  }, []));

  // Tag resolution — uses bulk resolver when available, falls back to per-item.
  useEffect(() => {
    if (conversations.length === 0) {
      setTagMap(new Map());
      return;
    }

    let cancelled = false;

    if (chatTagsBulk) {
      const bulkEntries: BulkChatTagsEntry[] = [];
      for (const conv of conversations) {
        const device = conv.deviceId ? devices.find(d => d.id === conv.deviceId) : selectedDevice;
        if (!device) continue;
        const key = conv.deviceId ? `${conv.deviceId}::${conv.id}` : conv.id;
        bulkEntries.push({
          key,
          chat: {
            id: conv.id,
            phoneNumber: conv.phoneNumber,
            contactName: conv.contactName,
            profilePicUrl: conv.profilePicUrl,
            lastActiveAt: conv.lastActiveAt,
            lastMessage: conv.lastMessage
              ? {
                  content: conv.lastMessage.content,
                  direction: conv.lastMessage.direction as 'inbound' | 'outbound',
                  type: conv.lastMessage.type,
                }
              : undefined,
            unreadCount: conv.unreadCount,
          },
          device,
        });
      }
      (async () => {
        try {
          const result = await chatTagsBulk(bulkEntries);
          if (!cancelled) setTagMap(result);
        } catch {
          // skip
        }
      })();
    } else if (chatTags) {
      (async () => {
        const entries: [string, ChatTag[]][] = [];
        for (const conv of conversations) {
          const device = conv.deviceId ? devices.find(d => d.id === conv.deviceId) : selectedDevice;
          if (!device) continue;
          try {
            const tags = await chatTags(
              {
                id: conv.id,
                phoneNumber: conv.phoneNumber,
                contactName: conv.contactName,
                profilePicUrl: conv.profilePicUrl,
                lastActiveAt: conv.lastActiveAt,
                lastMessage: conv.lastMessage
                  ? {
                      content: conv.lastMessage.content,
                      direction: conv.lastMessage.direction as 'inbound' | 'outbound',
                      type: conv.lastMessage.type,
                    }
                  : undefined,
                unreadCount: conv.unreadCount,
              },
              device,
            );
            const key = conv.deviceId ? `${conv.deviceId}::${conv.id}` : conv.id;
            entries.push([key, tags]);
          } catch {
            // skip
          }
        }
        if (!cancelled) setTagMap(new Map(entries));
      })();
    } else {
      setTagMap(new Map());
    }

    return () => {
      cancelled = true;
    };
  }, [chatTagsBulk, chatTags, conversations, devices, selectedDevice]);

  // Collect unique tags across all resolved chats
  const availableTags = useMemo(() => {
    const seen = new Map<string, ChatTag>();
    for (const tags of tagMap.values()) {
      for (const tag of tags) {
        if (!seen.has(tag.id)) seen.set(tag.id, tag);
      }
    }
    return Array.from(seen.values());
  }, [tagMap]);

  // Prune selected tags that no longer exist
  useEffect(() => {
    if (selectedTagIds.size === 0) return;
    const validIds = new Set(availableTags.map(t => t.id));
    const pruned = new Set([...selectedTagIds].filter(id => validIds.has(id)));
    if (pruned.size !== selectedTagIds.size) setSelectedTagIds(pruned);
  }, [availableTags]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTagFilter = useCallback((tagId: string) => {
    setSelectedTagIds(prev => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }, []);

  const filteredConversations = useMemo(() => {
    let result = conversations;

    if (selectedTagIds.size > 0) {
      result = result.filter(conv => {
        const key = conv.deviceId ? `${conv.deviceId}::${conv.id}` : conv.id;
        const tags = tagMap.get(key);
        if (!tags) return false;
        const tagIds = new Set(tags.map(t => t.id));
        for (const id of selectedTagIds) {
          if (!tagIds.has(id)) return false;
        }
        return true;
      });
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        conv =>
          conv.phoneNumber.toLowerCase().includes(query) ||
          conv.contactName?.toLowerCase().includes(query) ||
          conv.deviceLabel?.toLowerCase().includes(query),
      );
    }

    return result;
  }, [conversations, searchQuery, selectedTagIds, tagMap]);

  const findByPhoneNumber = useCallback(
    (phoneNumber: string): Conversation | undefined => conversations.find(c => c.phoneNumber === phoneNumber),
    [conversations],
  );

  return {
    conversations,
    filteredConversations,
    loading,
    refreshing,
    refresh,
    fetchConversations,
    searchQuery,
    setSearchQuery,
    selectedTagIds,
    toggleTagFilter,
    availableTags,
    tagMap,
    isPolling,
    findByPhoneNumber,
  };
}
