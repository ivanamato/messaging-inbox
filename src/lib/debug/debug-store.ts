// Central event store for the debug panel.
// Uses useSyncExternalStore-compatible API for React subscriptions.

export type HttpRequestDetail = {
  url: string;
  httpMethod: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  statusCode: number | null;
  responseHeaders: Record<string, string>;
  responseSize: number | null;
  duration: number;
  error?: string;
};

export type RequestLogEntry = {
  id: string;
  method: string;
  deviceId: string;
  channelId: string;
  timestamp: number;
  duration: number;
  params: unknown;
  responseSummary: string;
  responseRaw: unknown;
  success: boolean;
  error?: string;
  validationIssues: ValidationIssue[];
  httpRequests: HttpRequestDetail[];
};

export type TimelineEventType =
  | 'connection_change'
  | 'chat_refresh'
  | 'message_sent'
  | 'message_received'
  | 'error'
  | 'optimistic_confirm'
  | 'provider_call';

export type TimelineEvent = {
  id: string;
  timestamp: number;
  type: TimelineEventType;
  deviceId: string;
  summary: string;
  details?: unknown;
};

export type ValidationIssue = {
  severity: 'warning' | 'error';
  method: string;
  deviceId: string;
  message: string;
  details?: unknown;
};

type AddRequestInput = Omit<RequestLogEntry, 'id' | 'timestamp'>;
type AddEventInput = Omit<TimelineEvent, 'id' | 'timestamp'>;

const MAX_REQUESTS = 500;
const MAX_EVENTS = 1000;

let idCounter = 0;
function nextId(): string {
  return `dbg-${++idCounter}-${Date.now()}`;
}

export class DebugStore {
  private _requests: RequestLogEntry[] = [];
  private _events: TimelineEvent[] = [];
  private _listeners = new Set<() => void>();
  private _snapshot = { requests: this._requests, events: this._events };
  private _lastConnectionStates = new Map<string, string>();

  addRequest(input: AddRequestInput) {
    const entry: RequestLogEntry = {
      ...input,
      id: nextId(),
      timestamp: Date.now(),
    };
    this._requests = [entry, ...this._requests].slice(0, MAX_REQUESTS);
    this._notify();
  }

  addEvent(input: AddEventInput) {
    const event: TimelineEvent = {
      ...input,
      id: nextId(),
      timestamp: Date.now(),
    };
    this._events = [event, ...this._events].slice(0, MAX_EVENTS);
    this._notify();
  }

  /** Track connection state changes. Returns true if state changed. */
  trackConnectionState(deviceId: string, state: string): boolean {
    const prev = this._lastConnectionStates.get(deviceId);
    if (prev === state) return false;
    this._lastConnectionStates.set(deviceId, state);
    if (prev !== undefined) {
      this.addEvent({
        type: 'connection_change',
        deviceId,
        summary: `Connection: ${prev} → ${state}`,
        details: { from: prev, to: state },
      });
    }
    return true;
  }

  // --- useSyncExternalStore API ---

  subscribe = (listener: () => void) => {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  };

  getSnapshot = () => this._snapshot;

  // --- Export ---

  exportAsJson(): string {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      requests: this._requests,
      events: this._events,
    }, null, 2);
  }

  private _notify() {
    this._snapshot = { requests: this._requests, events: this._events };
    this._listeners.forEach(fn => fn());
  }
}
