import { useState, useCallback, useEffect, useRef } from 'react';

const NOTIFICATION_ENABLED_KEY = 'whatsapp-inbox-notifications-enabled';

export interface BrowserNotificationOptions {
  title: string;
  body?: string;
  icon?: string;
  tag?: string;
  onClick?: () => void;
}

/**
 * Hook to manage browser notification permissions and sending.
 */
export function useBrowserNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isEnabled, setIsEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(NOTIFICATION_ENABLED_KEY);
    return stored === 'true';
  });

  const onClickCallbackRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      return 'denied' as NotificationPermission;
    }

    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  const toggleEnabled = useCallback(async () => {
    if (!isEnabled) {
      // Trying to enable - check/request permission
      if (permission !== 'granted') {
        const result = await requestPermission();
        if (result !== 'granted') {
          return; // Don't enable if permission denied
        }
      }
      setIsEnabled(true);
      localStorage.setItem(NOTIFICATION_ENABLED_KEY, 'true');
    } else {
      setIsEnabled(false);
      localStorage.setItem(NOTIFICATION_ENABLED_KEY, 'false');
    }
  }, [isEnabled, permission, requestPermission]);

  const sendNotification = useCallback((options: BrowserNotificationOptions) => {
    if (!isEnabled || permission !== 'granted') return null;

    try {
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon,
        tag: options.tag,
      });

      if (options.onClick) {
        onClickCallbackRef.current = options.onClick;
        notification.onclick = () => {
          options.onClick?.();
          notification.close();
          // Focus the window
          window.focus();
        };
      }

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);

      return notification;
    } catch {
      return null;
    }
  }, [isEnabled, permission]);

  const canNotify = isEnabled && permission === 'granted';

  return {
    permission,
    isEnabled,
    canNotify,
    requestPermission,
    toggleEnabled,
    sendNotification,
  };
}
