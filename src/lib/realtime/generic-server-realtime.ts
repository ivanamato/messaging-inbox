import type { RealtimeConnection, RealtimeConnectionState, RealtimeEvent, RawWsLogger } from './types';

export class GenericServerRealtimeConnection implements RealtimeConnection {
  private ws: WebSocket | null = null;
  private state: RealtimeConnectionState = 'disconnected';
  private eventHandlers = new Set<(event: RealtimeEvent) => void>();
  private stateHandlers = new Set<(state: RealtimeConnectionState) => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private intentionalClose = false;
  private hasConnected = false;
  private rawLogger: RawWsLogger | null = null;
  private errorHandlers = new Set<(error: string) => void>();

  private static readonly MAX_RECONNECT_DELAY = 30000;
  private static readonly BASE_RECONNECT_DELAY = 1000;
  private static readonly MAX_RECONNECT_ATTEMPTS = 50;

  constructor(
    private readonly wsUrl: string,
    private readonly channelId: string,
    private readonly instanceToken: string,
    private readonly deviceId: string,
  ) {}

  private log(level: 'debug' | 'info' | 'warn' | 'error', msg: string, data?: Record<string, unknown>): void {
    const prefix = `[WS:${this.deviceId}]`;
    const extra = data ? ' ' + JSON.stringify(data) : '';
    if (level === 'error') console.error(`${prefix} ${msg}${extra}`);
    else if (level === 'warn') console.warn(`${prefix} ${msg}${extra}`);
    else console.log(`${prefix} ${msg}${extra}`);
  }

  private setState(state: RealtimeConnectionState): void {
    if (this.state === state) return;
    const prev = this.state;
    this.state = state;
    this.log('info', `state: ${prev} → ${state}`);
    for (const handler of this.stateHandlers) {
      try { handler(state); } catch { /* ignore */ }
    }
  }

  private emitEvent(event: RealtimeEvent): void {
    for (const handler of this.eventHandlers) {
      try { handler(event); } catch { /* ignore */ }
    }
  }

  private resolveUrl(): string {
    let url = this.wsUrl;
    url = url.replace(/\{channelId\}/g, encodeURIComponent(this.channelId));
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}token=${encodeURIComponent(this.instanceToken)}`;
  }

  connect(): void {
    if (this.ws) return;
    this.intentionalClose = false;
    this.hasConnected = false;
    this.reconnectAttempts = 0;
    this.log('info', 'connect() called');
    this.doConnect();
  }

  private doConnect(): void {
    this.setState('connecting');

    const url = this.resolveUrl();
    this.log('info', `opening WebSocket`, { url: url.replace(/token=[^&]+/, 'token=***') });

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this.log('error', `WebSocket constructor failed`, { error: String(err) });
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.log('info', `connected (attempt ${this.reconnectAttempts})`);
      this.reconnectAttempts = 0;
      this.hasConnected = true;
      this.setState('connected');
      this.emitEvent({
        type: 'connection.changed',
        deviceId: this.deviceId,
        channelId: this.channelId,
        payload: { state: 'open' },
      });
    };

    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as {
          type: string;
          chatId?: string;
          messageId?: string;
          message?: RealtimeEvent['payload'] extends { message: infer M } ? M : never;
          status?: string;
          chat?: RealtimeEvent['payload'] extends { chat: infer C } ? C : never;
          state?: string;
        };

        if (this.rawLogger) {
          this.rawLogger(data.type, data);
        }

        switch (data.type) {
          case 'message.new':
            if (data.chatId && data.message) {
              this.emitEvent({
                type: 'message.new',
                deviceId: this.deviceId,
                channelId: this.channelId,
                payload: { chatId: data.chatId, message: data.message as never },
              });
            }
            break;
          case 'message.updated':
            if (data.chatId && data.messageId && data.status) {
              this.emitEvent({
                type: 'message.updated',
                deviceId: this.deviceId,
                channelId: this.channelId,
                payload: { chatId: data.chatId, messageId: data.messageId, status: data.status },
              });
            }
            break;
          case 'message.deleted':
            if (data.chatId && data.messageId) {
              this.emitEvent({
                type: 'message.deleted',
                deviceId: this.deviceId,
                channelId: this.channelId,
                payload: { chatId: data.chatId, messageId: data.messageId },
              });
            }
            break;
          case 'chat.updated':
            if (data.chat) {
              this.emitEvent({
                type: 'chat.updated',
                deviceId: this.deviceId,
                channelId: this.channelId,
                payload: { chat: data.chat as never },
              });
            }
            break;
          case 'chat.new':
            if (data.chat) {
              this.emitEvent({
                type: 'chat.new',
                deviceId: this.deviceId,
                channelId: this.channelId,
                payload: { chat: data.chat as never },
              });
            }
            break;
          case 'connection.changed': {
            const state = data.state === 'open' ? 'open' : data.state === 'connecting' ? 'connecting' : 'close';
            this.emitEvent({
              type: 'connection.changed',
              deviceId: this.deviceId,
              channelId: this.channelId,
              payload: { state },
            });
            break;
          }
        }
      } catch {
        // malformed JSON — ignore
      }
    };

    this.ws.onclose = (ev) => {
      this.log('warn', `closed`, { code: ev.code, reason: ev.reason || '(none)', wasClean: ev.wasClean, hadConnected: this.hasConnected });
      this.ws = null;

      if (this.intentionalClose) {
        this.setState('disconnected');
        return;
      }

      this.emitEvent({
        type: 'connection.changed',
        deviceId: this.deviceId,
        channelId: this.channelId,
        payload: { state: 'close' },
      });

      // Always attempt reconnect (whether first connect failed or later disconnect)
      if (this.reconnectAttempts < GenericServerRealtimeConnection.MAX_RECONNECT_ATTEMPTS) {
        this.setState('reconnecting');
        this.scheduleReconnect();
      } else {
        this.log('error', `max reconnect attempts (${GenericServerRealtimeConnection.MAX_RECONNECT_ATTEMPTS}) reached, giving up`);
        this.setState('disconnected');
        for (const handler of this.errorHandlers) {
          try { handler(`Max reconnect attempts reached`); } catch { /* ignore */ }
        }
      }
    };

    this.ws.onerror = (ev) => {
      this.log('error', `error event fired`, { readyState: this.ws?.readyState });
      // onclose will fire after onerror
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(
      GenericServerRealtimeConnection.BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      GenericServerRealtimeConnection.MAX_RECONNECT_DELAY,
    );
    this.reconnectAttempts++;
    this.log('info', `reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionalClose) this.doConnect();
    }, delay);
  }

  setRawLogger(logger: RawWsLogger): void {
    this.rawLogger = logger;
  }

  disconnect(): void {
    this.log('info', 'disconnect() called');
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }

  onEvent(handler: (event: RealtimeEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => { this.eventHandlers.delete(handler); };
  }

  onStateChange(handler: (state: RealtimeConnectionState) => void): () => void {
    this.stateHandlers.add(handler);
    return () => { this.stateHandlers.delete(handler); };
  }

  onError(handler: (error: string) => void): () => void {
    this.errorHandlers.add(handler);
    return () => { this.errorHandlers.delete(handler); };
  }

  getState(): RealtimeConnectionState {
    return this.state;
  }
}
