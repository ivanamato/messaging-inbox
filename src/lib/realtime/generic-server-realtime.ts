import type { RealtimeConnection, RealtimeConnectionState, RealtimeEvent, RawWsLogger } from './types';

export class GenericServerRealtimeConnection implements RealtimeConnection {
  private ws: WebSocket | null = null;
  private state: RealtimeConnectionState = 'disconnected';
  private eventHandlers = new Set<(event: RealtimeEvent) => void>();
  private stateHandlers = new Set<(state: RealtimeConnectionState) => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private intentionalClose = false;
  private rawLogger: RawWsLogger | null = null;

  private static readonly MAX_RECONNECT_DELAY = 30000;
  private static readonly BASE_RECONNECT_DELAY = 1000;

  constructor(
    private readonly wsUrl: string,
    private readonly channelId: string,
    private readonly instanceToken: string,
    private readonly deviceId: string,
  ) {}

  private setState(state: RealtimeConnectionState): void {
    if (this.state === state) return;
    this.state = state;
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
    this.doConnect();
  }

  private doConnect(): void {
    this.setState('connecting');

    const url = this.resolveUrl();
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
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

    this.ws.onclose = () => {
      this.ws = null;
      if (this.intentionalClose) {
        this.setState('disconnected');
        return;
      }
      this.setState('reconnecting');
      this.emitEvent({
        type: 'connection.changed',
        deviceId: this.deviceId,
        channelId: this.channelId,
        payload: { state: 'close' },
      });
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
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
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionalClose) this.doConnect();
    }, delay);
  }

  setRawLogger(logger: RawWsLogger): void {
    this.rawLogger = logger;
  }

  disconnect(): void {
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

  getState(): RealtimeConnectionState {
    return this.state;
  }
}
