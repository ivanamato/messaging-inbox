import { useEffect, useRef } from 'react';

/**
 * Hook to update the document title with unread count badge.
 * Format: "(3) WhatsApp Inbox" or just "WhatsApp Inbox" when 0.
 */
export function useTabTitle(totalUnread: number, baseTitle: string = 'WhatsApp Inbox') {
  const prevTitleRef = useRef<string>(document.title);

  useEffect(() => {
    const newTitle = totalUnread > 0
      ? `(${totalUnread}) ${baseTitle}`
      : baseTitle;

    if (document.title !== newTitle) {
      document.title = newTitle;
    }

    return () => {
      // Restore original title on unmount
      document.title = prevTitleRef.current;
    };
  }, [totalUnread, baseTitle]);
}
