import type { RealtimeEvent, RealtimeEventFilter } from './types';

type Handler = (event: RealtimeEvent) => void;

function matchesFilter(event: RealtimeEvent, filter: RealtimeEventFilter): boolean {
  if (filter.deviceId && event.deviceId !== filter.deviceId) return false;
  if (filter.type) {
    const types = Array.isArray(filter.type) ? filter.type : [filter.type];
    if (!types.includes(event.type)) return false;
  }
  return true;
}

export class RealtimeEventBus {
  private handlers = new Set<Handler>();
  private filteredHandlers = new Map<Handler, { filter: RealtimeEventFilter; handler: Handler }>();

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

  subscribeFiltered(filter: RealtimeEventFilter, handler: Handler): () => void {
    const wrapper: Handler = (event) => {
      if (matchesFilter(event, filter)) handler(event);
    };
    this.handlers.add(wrapper);
    this.filteredHandlers.set(handler, { filter, handler: wrapper });
    return () => {
      this.handlers.delete(wrapper);
      this.filteredHandlers.delete(handler);
    };
  }

  emit(event: RealtimeEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[RealtimeEventBus] Handler error:', err);
        }
      }
    }
  }
}
