import { useEffect, useRef } from 'react';
import type { RealtimeEvent, RealtimeEventFilter } from '../lib/realtime/types';
import type { RealtimeEventBus } from '../lib/realtime/event-bus';

export function useRealtimeEvents(
  eventBus: RealtimeEventBus | null,
  filter: RealtimeEventFilter,
  handler: (event: RealtimeEvent) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  // Stable key for the filter so we only resubscribe when filter values change
  const filterKey = `${filter.deviceId ?? ''}|${Array.isArray(filter.type) ? filter.type.join(',') : filter.type ?? ''}`;

  useEffect(() => {
    if (!eventBus) return;

    const unsub = eventBus.subscribeFiltered(filter, (event) => {
      handlerRef.current(event);
    });

    return unsub;
  }, [eventBus, filterKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
