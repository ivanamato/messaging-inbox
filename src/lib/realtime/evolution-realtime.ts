import type { RealtimeConnection, RealtimeConnectionState, RealtimeEvent, RawWsLogger } from './types';
import type { Message } from '../providers/types';
import {
  stripJid,
  epochToIso,
  extractContent,
  resolveStatusFromUpdates,
  type EvolutionMessage,
  type MessageUpdateEntry,
} from '../providers/evolution-helpers';

type EvolutionWsData = {
  event: string;
  instance: string;
  data: unknown;
};

function convertEvolutionMessage(data: EvolutionMessage, deviceId: string, channelId: string): RealtimeEvent | null {
  const chatId = data.key.remoteJid;
  const extracted = extractContent(data);

  if (extracted.messageType === 'revoked') {
    if (extracted.revokedMessageId) {
      return {
        type: 'message.deleted',
        deviceId,
        channelId,
        payload: { chatId, messageId: extracted.revokedMessageId },
      };
    }
    return null;
  }

  const phoneNumber = stripJid(chatId);
  const message: Message = {
    id: data.key.id,
    direction: data.key.fromMe ? 'outbound' : 'inbound',
    content: extracted.content,
    createdAt: epochToIso(data.messageTimestamp),
    status: resolveStatusFromUpdates(data.MessageUpdate),
    phoneNumber,
    hasMedia: extracted.hasMedia,
    messageType: extracted.messageType,
    reactionEmoji: extracted.reactionEmoji,
    reactedToMessageId: extracted.reactedToMessageId,
    caption: extracted.caption,
    filename: extracted.filename,
    mimeType: extracted.mimeType,
    metadata: extracted.hasMedia ? { mediaId: data.key.id } : {},
    senderName: !data.key.fromMe ? data.pushName : undefined,
  };

  return {
    type: 'message.new',
    deviceId,
    channelId,
    payload: { chatId, message },
  };
}

/**
 * The real Evolution API wraps socket.io events in an envelope:
 * { event, instance, data: <payload>, server_url, date_time, sender, apikey }
 * The mock server sends the raw payload directly.
 * This function unwraps the envelope when present.
 */
function unwrapEnvelope(data: unknown): unknown {
  if (
    data != null &&
    typeof data === 'object' &&
    'event' in data &&
    'data' in data &&
    typeof (data as Record<string, unknown>).event === 'string'
  ) {
    return (data as Record<string, unknown>).data;
  }
  return data;
}

export class EvolutionRealtimeConnection implements RealtimeConnection {
  private socket: import('socket.io-client').Socket | null = null;
  private state: RealtimeConnectionState = 'disconnected';
  private eventHandlers = new Set<(event: RealtimeEvent) => void>();
  private stateHandlers = new Set<(state: RealtimeConnectionState) => void>();
  private rawLogger: RawWsLogger | null = null;

  constructor(
    private readonly wsUrl: string,
    private readonly instanceName: string,
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

  async connect(): Promise<void> {
    if (this.socket) return;

    this.setState('connecting');

    const { io } = await import('socket.io-client');

    const raw = this.wsUrl.endsWith('/')
      ? this.wsUrl.slice(0, -1)
      : this.wsUrl;
    const url = raw.replace('{instanceName}', this.instanceName);

    this.socket = io(url, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      auth: { apikey: this.instanceToken },
    });

    this.socket.on('connect', () => {
      this.setState('connected');
      this.emitEvent({
        type: 'connection.changed',
        deviceId: this.deviceId,
        channelId: this.instanceName,
        payload: { state: 'open' },
      });
    });

    this.socket.on('connect_error', (err) => {
      console.error(`[WS] ${this.instanceName} connect_error:`, err.message);
      this.emitEvent({
        type: 'connection.changed',
        deviceId: this.deviceId,
        channelId: this.instanceName,
        payload: { state: 'close' },
      });
    });

    this.socket.on('disconnect', (reason) => {
      this.setState('disconnected');
      this.emitEvent({
        type: 'connection.changed',
        deviceId: this.deviceId,
        channelId: this.instanceName,
        payload: { state: 'close' },
      });
    });

    this.socket.io.on('reconnect_attempt', () => {
      this.setState('reconnecting');
    });

    this.socket.io.on('reconnect', () => {
      this.setState('connected');
    });

    // Capture all raw events for debug logging
    this.socket.onAny((eventName: string, ...args: unknown[]) => {
      if (this.rawLogger) {
        this.rawLogger(eventName, args.length === 1 ? args[0] : args);
      }
    });

    // Evolution socket.io events
    this.socket.on('messages.upsert', (raw: EvolutionWsData['data']) => {
      const data = unwrapEnvelope(raw);
      const msg = data as EvolutionMessage;
      const event = convertEvolutionMessage(msg, this.deviceId, this.instanceName);
      if (event) {
        this.emitEvent(event);
      }
    });

    this.socket.on('messages.update', (raw: EvolutionWsData['data']) => {
      const data = unwrapEnvelope(raw);
      const updates = data as Array<{ key: { id: string; remoteJid: string }; update: MessageUpdateEntry }>;
      if (!Array.isArray(updates)) return;
      for (const update of updates) {
        const status = resolveStatusFromUpdates([update.update]);
        if (status) {
          this.emitEvent({
            type: 'message.updated',
            deviceId: this.deviceId,
            channelId: this.instanceName,
            payload: {
              chatId: update.key.remoteJid,
              messageId: update.key.id,
              status,
            },
          });
        }
      }
    });

    this.socket.on('messages.delete', (raw: EvolutionWsData['data']) => {
      const data = unwrapEnvelope(raw);
      const msg = data as { key: { id: string; remoteJid: string } };
      if (msg?.key) {
        this.emitEvent({
          type: 'message.deleted',
          deviceId: this.deviceId,
          channelId: this.instanceName,
          payload: { chatId: msg.key.remoteJid, messageId: msg.key.id },
        });
      }
    });

    this.socket.on('chats.upsert', (raw: EvolutionWsData['data']) => {
      const data = unwrapEnvelope(raw);
      const chat = data as { id?: string; remoteJid?: string; name?: string; unreadCount?: number };
      const id = chat.remoteJid || chat.id;
      if (id) {
        this.emitEvent({
          type: 'chat.new',
          deviceId: this.deviceId,
          channelId: this.instanceName,
          payload: {
            chat: {
              id,
              phoneNumber: stripJid(id),
              contactName: chat.name,
              unreadCount: chat.unreadCount,
            },
          },
        });
      }
    });

    this.socket.on('chats.update', (raw: EvolutionWsData['data']) => {
      const data = unwrapEnvelope(raw);
      const updates = Array.isArray(data) ? data : [data];
      for (const chat of updates as Array<{ id?: string; remoteJid?: string; unreadCount?: number }>) {
        const id = chat.remoteJid || chat.id;
        if (id) {
          this.emitEvent({
            type: 'chat.updated',
            deviceId: this.deviceId,
            channelId: this.instanceName,
            payload: {
              chat: { id, unreadCount: chat.unreadCount },
            },
          });
        }
      }
    });

    this.socket.on('connection.update', (raw: EvolutionWsData['data']) => {
      const data = unwrapEnvelope(raw);
      const update = data as { state?: string };
      const state = update.state === 'open' ? 'open' : update.state === 'connecting' ? 'connecting' : 'close';
      this.emitEvent({
        type: 'connection.changed',
        deviceId: this.deviceId,
        channelId: this.instanceName,
        payload: { state },
      });
    });
  }

  setRawLogger(logger: RawWsLogger): void {
    this.rawLogger = logger;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
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
