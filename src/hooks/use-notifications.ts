import { useCallback, useRef } from 'react';
import { useTabTitle } from './use-tab-title';
import { useSoundNotifications } from './use-sound-notifications';
import { useBrowserNotifications } from './use-browser-notifications';
import type { Message } from '@/lib/providers/types';

interface UseNotificationsOptions {
  totalUnread: number;
  currentConversationId?: string;
  onNotificationClick?: (chatId: string) => void;
}

/**
 * Unified hook for all notification features.
 * Coordinates tab title, sound, and browser notifications.
 */
export function useNotifications({
  totalUnread,
  currentConversationId,
  onNotificationClick,
}: UseNotificationsOptions) {
  // Tab title updates
  useTabTitle(totalUnread);

  // Sound notifications
  const { isMuted, toggleMute, playSound } = useSoundNotifications();

  // Browser notifications
  const {
    permission,
    isEnabled: notificationsEnabled,
    canNotify,
    toggleEnabled: toggleNotifications,
    sendNotification,
  } = useBrowserNotifications();

  // Track last notification time to avoid spam
  const lastNotifTimeRef = useRef(0);

  /**
   * Call this when a new inbound message arrives.
   * Will play sound and/or show browser notification based on settings.
   */
  const notifyNewMessage = useCallback((
    message: Message,
    chatId: string,
    contactName?: string,
  ) => {
    // Don't notify for messages in the current conversation
    if (chatId === currentConversationId) return;

    // Rate limit: max 1 notification per 2 seconds
    const now = Date.now();
    if (now - lastNotifTimeRef.current < 2000) return;
    lastNotifTimeRef.current = now;

    // Play sound if not muted
    if (!isMuted) {
      playSound();
    }

    // Show browser notification if enabled
    if (canNotify) {
      const content = message.content || message.caption || 'New message';
      const body = contactName
        ? `${contactName}: ${content.slice(0, 100)}`
        : content.slice(0, 100);

      sendNotification({
        title: contactName || 'New Message',
        body,
        tag: chatId,
        onClick: () => onNotificationClick?.(chatId),
      });
    }
  }, [currentConversationId, isMuted, playSound, canNotify, sendNotification, onNotificationClick]);

  return {
    // Sound
    isMuted,
    toggleMute,
    playSound,
    // Browser notifications
    notificationPermission: permission,
    notificationsEnabled,
    canNotify,
    toggleNotifications,
    // Actions
    notifyNewMessage,
  };
}
