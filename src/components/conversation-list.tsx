import { useRef, useCallback, forwardRef, useImperativeHandle, useMemo } from 'react';
import { format, isValid, isToday, isYesterday } from 'date-fns';
import { useVirtualizer } from '@tanstack/react-virtual';
import { RefreshCw, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SoundToggle, NotificationToggle } from '@/components/notification-toggles';
import { useDeviceContext } from '@/lib/provider-context';
import { useTranslations } from '@/lib/i18n';
import { sanitizeUrl } from '@/lib/url-utils';
import { getAvatarInitials } from '@/lib/avatar-utils';
import { ChatActionsTrigger, ChatActionsDialog } from '@/components/chat-actions-menu';
import { useChatList } from '@/use-cases/use-chat-list';
import type { Conversation } from '@/use-cases/types';
import type { ChatActionsResolver, ChatTagsResolver, BulkChatTagsResolver, DeviceConfig } from '@/lib/providers/types';
import { resolveInitiationCapability } from '@/lib/providers/types';
import { useState } from 'react';

function formatConversationDate(timestamp: string, yesterdayLabel: string): string {
  try {
    const date = new Date(timestamp);
    if (!isValid(date)) return '';

    if (isToday(date)) return format(date, 'HH:mm');
    if (isYesterday(date)) return yesterdayLabel;
    return format(date, 'MMM d');
  } catch {
    return '';
  }
}

type Props = {
  onSelectConversation: (conversation: Conversation) => void;
  selectedConversationId?: string;
  isHidden?: boolean;
  instance?: string;
  provider?: string;
  chatActions?: ChatActionsResolver;
  chatTags?: ChatTagsResolver;
  chatTagsBulk?: BulkChatTagsResolver;
  // Notification controls
  isMuted?: boolean;
  onToggleMute?: () => void;
  notificationsEnabled?: boolean;
  notificationPermission?: NotificationPermission;
  onToggleNotifications?: () => void;
};

export type ConversationListRef = {
  refresh: () => Promise<Conversation[]>;
  selectByPhoneNumber: (phoneNumber: string, deviceId?: string) => Promise<void>;
  select: (conversation: Conversation) => void;
  openChat: (phoneNumber: string, deviceId?: string) => Promise<void>;
  getTotalUnread: () => number;
};

export const ConversationList = forwardRef<ConversationListRef, Props>(
  ({ onSelectConversation, selectedConversationId, isHidden = false, instance, chatActions, chatTags, chatTagsBulk, isMuted = false, onToggleMute, notificationsEnabled = false, notificationPermission = 'default', onToggleNotifications }, ref) => {
  const { viewMode, devices, selectedDevice, getProviderForDevice } = useDeviceContext();
  const t = useTranslations();
  const [searchFocused, setSearchFocused] = useState(false);
  const [dialogTarget, setDialogTarget] = useState<{ conversation: Conversation; device: DeviceConfig } | null>(null);
  const scrollParentRef = useRef<HTMLDivElement>(null);

  const {
    conversations,
    filteredConversations,
    loading,
    refreshing,
    refresh,
    searchQuery,
    setSearchQuery,
    selectedTagIds,
    toggleTagFilter,
    availableTags,
    tagMap,
    isPolling,
    clearUnread,
  } = useChatList({ instance, chatTags, chatTagsBulk });

  const handleRefresh = () => { refresh(); };

  // Calculate total unread count
  const totalUnread = useMemo(() => {
    return conversations.reduce((sum, conv) => sum + (conv.unreadCount ?? 0), 0);
  }, [conversations]);

  // Merge device-level capability overrides onto provider capabilities
  const getEffectiveCaps = (device: DeviceConfig) => {
    const providerCaps = getProviderForDevice(device).capabilities;
    return device.capabilities ? { ...providerCaps, ...device.capabilities } : providerCaps;
  };

  const canInitiateChat = selectedDevice
    ? resolveInitiationCapability(getEffectiveCaps(selectedDevice)).canInitiate
    : true;

  /** Select a conversation and optimistically clear its unread badge when autoRead is on. */
  const selectAndClearUnread = useCallback((conversation: Conversation) => {
    onSelectConversation(conversation);
    const device = conversation.deviceId
      ? devices.find(d => d.id === conversation.deviceId)
      : selectedDevice;
    if (device && device.autoRead !== false) {
      const provider = getProviderForDevice(device);
      if (provider.capabilities.markAsRead) {
        clearUnread(conversation.id, conversation.deviceId);
      }
    }
  }, [onSelectConversation, devices, selectedDevice, getProviderForDevice, clearUnread]);

  useImperativeHandle(ref, () => ({
    refresh,
    select: (conversation: Conversation) => { onSelectConversation(conversation); },
    getTotalUnread: () => totalUnread,
    selectByPhoneNumber: async (phoneNumber: string, deviceId?: string) => {
      const match = (c: Conversation) =>
        c.phoneNumber === phoneNumber && (!deviceId || c.deviceId === deviceId);
      const immediate = conversations.find(match);
      if (immediate) { onSelectConversation(immediate); return; }
      // Not in current list — refresh first (handles just-switched device or merged mode)
      const fresh = await refresh();
      const found = fresh.find(match);
      if (found) onSelectConversation(found);
    },
    openChat: async (phoneNumber: string, deviceId?: string) => {
      const match = (c: Conversation) =>
        c.phoneNumber === phoneNumber && (!deviceId || c.deviceId === deviceId);
      // Try existing chats first
      const immediate = conversations.find(match);
      if (immediate) { onSelectConversation(immediate); return; }
      const fresh = await refresh();
      const found = fresh.find(match);
      if (found) { onSelectConversation(found); return; }
      // Not found — check if platform supports initiating new conversations
      const targetDeviceId = deviceId ?? selectedDevice?.id;
      const targetDevice = devices.find(d => d.id === targetDeviceId) ?? selectedDevice;
      if (targetDevice) {
        const initCap = resolveInitiationCapability(getEffectiveCaps(targetDevice));
        if (!initCap.canInitiate) return;
      }
      onSelectConversation({
        id: phoneNumber,
        phoneNumber,
        deviceId: targetDevice?.id,
        deviceLabel: targetDevice?.label,
      });
    },
  }));

  const rowVirtualizer = useVirtualizer({
    count: filteredConversations.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 72,
    overscan: 8,
  });

  // Loading skeleton
  if (loading) {
    return (
      <div className={cn(
        "wa-sidebar wa:w-full wa:border-r wa:border-[#e9edef] wa:bg-white wa:flex wa:flex-col",
        isHidden && "wa-sidebar--hidden"
      )}>
        <div className="wa:px-3 wa:pt-2.5 wa:pb-1.5">
          <div className="wa:flex wa:items-center wa:justify-between wa:mb-2.5">
            <Skeleton className="wa:h-6 wa:w-16" />
            <Skeleton className="wa:h-8 wa:w-8 wa:rounded-full" />
          </div>
          <Skeleton className="wa:h-[35px] wa:w-full wa:rounded-lg" />
        </div>
        <div className="wa:flex-1 wa:space-y-0">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="wa:flex wa:gap-3 wa:px-3 wa:py-3">
              <Skeleton className="wa:h-[49px] wa:w-[49px] wa:rounded-full wa:flex-shrink-0" />
              <div className="wa:flex-1 wa:space-y-2 wa:pt-1">
                <Skeleton className="wa:h-4 wa:w-32" />
                <Skeleton className="wa:h-3 wa:w-48" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // No instance selected (only in single mode)
  if (viewMode === 'single' && !instance) {
    return (
      <div className={cn(
        "wa-sidebar wa:w-full wa:border-r wa:border-[#e9edef] wa:bg-white wa:flex wa:flex-col wa:items-center wa:justify-center",
        isHidden && "wa-sidebar--hidden"
      )}>
        <p className="wa:text-[#667781] wa:text-[14px]">{t('conversationList.selectInstance')}</p>
      </div>
    );
  }

  return (
    <div data-testid="conversation-list" className={cn(
      "wa-sidebar wa:w-full wa:border-r wa:border-[#e9edef] wa:bg-white wa:flex wa:flex-col",
      isHidden && "wa-sidebar--hidden"
    )}>
      {/* Header with title + search */}
      <div className="wa:flex-shrink-0">
        <div style={{ padding: '12px 16px 4px' }} className="wa:flex wa:items-center wa:justify-between">
          <div className="wa:flex wa:items-center wa:gap-2">
            <h1 className="wa:text-[22px] wa:font-bold wa:text-[#111b21] wa:leading-none">{t('conversationList.chats')}</h1>
            {isPolling && (
              <div
                className="wa:h-2 wa:w-2 wa:rounded-full wa:bg-green-500 wa:animate-pulse"
                title={t('conversationList.autoUpdating')}
              />
            )}
          </div>
          <div className="wa:flex wa:items-center wa:gap-1">
            <SoundToggle isMuted={isMuted} onToggle={onToggleMute || (() => {})} />
            <NotificationToggle
              isEnabled={notificationsEnabled}
              permission={notificationPermission}
              onToggle={onToggleNotifications || (() => {})}
            />
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              variant="ghost"
              size="icon"
              className="wa:text-[#54656f] hover:wa:bg-transparent wa:h-10 wa:w-10"
            >
              <RefreshCw className={cn("wa:h-[18px] wa:w-[18px]", refreshing && "wa:animate-spin")} />
            </Button>
          </div>
        </div>

        {/* WhatsApp-style search bar */}
        <div style={{ padding: '0 16px 8px' }}>
          <div style={{ padding: '0 16px' }} className={cn(
            "wa:flex wa:items-center wa:gap-3 wa:rounded-lg wa:h-[35px] wa:transition-colors",
            searchFocused ? "wa:bg-white wa:ring-2 wa:ring-[#00a884]" : "wa:bg-[#f0f2f5]"
          )}>
            <div className="wa:flex-shrink-0">
              <Search className={cn(
                "wa:h-[15px] wa:w-[15px] wa:transition-colors",
                searchFocused ? "wa:text-[#00a884]" : "wa:text-[#54656f]"
              )} />
            </div>
            <input
              data-testid="search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder={canInitiateChat ? t('conversationList.searchPlaceholder') : t('conversationList.searchOnlyPlaceholder')}
              className="wa:flex-1 wa:bg-transparent wa:border-none wa:outline-none wa:text-[13px] wa:text-[#111b21] wa:placeholder-[#667781] wa:h-full"
            />
          </div>
        </div>

        {/* Tag filter chips */}
        {availableTags.length > 0 && (
          <div style={{ padding: '0 16px 8px' }} className="wa:flex wa:flex-wrap wa:gap-1.5">
            {availableTags.map(tag => {
              const isActive = selectedTagIds.has(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTagFilter(tag.id)}
                  style={{
                    fontSize: 11,
                    lineHeight: '16px',
                    padding: '2px 10px',
                    borderRadius: 12,
                    background: isActive ? (tag.background || '#00a884') : 'transparent',
                    color: isActive ? (tag.color || 'white') : '#54656f',
                    border: isActive ? 'none' : '1px solid #d1d7db',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    transition: 'all 150ms',
                  }}
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Virtualized conversation list */}
      <div ref={scrollParentRef} className="wa:flex-1 wa:overflow-auto" style={{ contain: 'strict' }}>
        {filteredConversations.length === 0 ? (
          <div className="wa:py-8 wa:text-center wa:text-[#667781] wa:text-[14px]">
            {(searchQuery || selectedTagIds.size > 0) ? t('conversationList.noConversationsFound') : t('conversationList.noConversationsYet')}
          </div>
        ) : (
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const conversation = filteredConversations[virtualRow.index];
              const compositeKey = conversation.deviceId
                ? `${conversation.deviceId}::${conversation.id}`
                : conversation.id;
              const isSelected = viewMode === 'all'
                ? selectedConversationId === compositeKey
                : selectedConversationId === conversation.id;

              return (
                <button
                  key={compositeKey}
                  data-testid="chat-item"
                  data-chat-name={conversation.contactName || conversation.phoneNumber}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  onClick={() => selectAndClearUnread(conversation)}
                  className={cn(
                    'wa-chat-row wa:w-full wa:text-left wa:transition-colors wa:relative wa:overflow-hidden wa:flex wa:items-center wa:cursor-pointer',
                    'hover:wa:bg-[#f5f6f6]',
                    isSelected && 'wa:bg-[#f0f2f5]'
                  )}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    padding: '5px 15px 5px 13px',
                  }}
                >
                  {isSelected && (
                    <div className="wa:absolute wa:left-0 wa:top-0 wa:bottom-0 wa:w-[3px] wa:bg-[#00a884]" />
                  )}

                  <div className="wa:flex wa:gap-3.5 wa:items-center wa:flex-1 wa:py-3.5 wa:overflow-hidden wa:min-w-0">
                    <Avatar className="wa:h-[49px] wa:w-[49px] wa:flex-shrink-0">
                      {sanitizeUrl(conversation.profilePicUrl) && (
                        <AvatarImage src={sanitizeUrl(conversation.profilePicUrl)!} alt={conversation.contactName || conversation.phoneNumber} />
                      )}
                      <AvatarFallback className="wa:bg-[#dfe5e7] wa:text-[#54656f] wa:text-sm wa:font-medium">
                        {getAvatarInitials(conversation.contactName, conversation.phoneNumber)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="wa:flex-1 wa:min-w-0 wa:overflow-hidden">
                      <div className="wa:flex wa:justify-between wa:items-baseline wa:gap-2">
                        <p className="wa:text-[17px] wa:font-normal wa:text-[#111b21] wa:truncate wa:leading-[21px]">
                          {conversation.contactName || conversation.phoneNumber}
                        </p>
                        <span className={cn(
                          "wa:text-[12px] wa:flex-shrink-0 wa:leading-[14px]",
                          conversation.unreadCount && conversation.unreadCount > 0
                            ? "wa:text-[#00a884]"
                            : "wa:text-[#667781]"
                        )}>
                          {formatConversationDate(conversation.lastActiveAt, t('conversationList.yesterday'))}
                        </span>
                      </div>
                      {(() => {
                        const tags = tagMap.get(compositeKey) || [];
                        return tags.length > 0 ? (
                          <div className="wa:flex wa:flex-wrap wa:gap-1 wa:mt-0.5">
                            {tags.map(tag => (
                              <span
                                key={tag.id}
                                style={{
                                  fontSize: 10,
                                  lineHeight: '14px',
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  background: tag.background || '#00a884',
                                  color: tag.color || 'white',
                                  fontWeight: 500,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {tag.label}
                              </span>
                            ))}
                          </div>
                        ) : null;
                      })()}
                      {viewMode === 'all' && conversation.deviceLabel && (
                        <p className="wa:text-[11px] wa:text-[#667781] wa:truncate wa:leading-[14px]">
                          {conversation.deviceLabel}
                        </p>
                      )}
                      <div className="wa:flex wa:justify-between wa:items-center wa:gap-2 wa:mt-[2px]">
                        {conversation.lastMessage ? (
                          <p className="wa:text-[14px] wa:text-[#667781] wa:truncate wa:leading-[20px]">
                            {conversation.lastMessage.direction === 'outbound' && (
                              <span className="wa:text-[#53bdeb]">✓ </span>
                            )}
                            {conversation.lastMessage.content}
                          </p>
                        ) : (
                          <span />
                        )}
                        {conversation.unreadCount != null && conversation.unreadCount > 0 && (
                          <span data-testid="unread-badge" className="wa:flex-shrink-0 wa:bg-[#00a884] wa:text-white wa:text-[11px] wa:font-bold wa:rounded-full wa:min-w-[20px] wa:h-[20px] wa:flex wa:items-center wa:justify-center wa:px-1">
                            {conversation.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {(() => {
                    const device = conversation.deviceId
                      ? devices.find(d => d.id === conversation.deviceId)
                      : selectedDevice;
                    return device ? (
                      <ChatActionsTrigger
                        onOpen={() => setDialogTarget({ conversation, device })}
                      />
                    ) : null;
                  })()}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Chat actions dialog — rendered outside the button tree */}
      {dialogTarget && (
        <ChatActionsDialog
          open={!!dialogTarget}
          onClose={() => setDialogTarget(null)}
          resolver={chatActions}
          conversation={dialogTarget.conversation}
          device={dialogTarget.device}
        />
      )}
    </div>
  );
});

ConversationList.displayName = 'ConversationList';
