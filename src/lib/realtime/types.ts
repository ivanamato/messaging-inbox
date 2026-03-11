import type { Chat, Message } from '../providers/types';

export type RealtimeEventType =
  | 'message.new'
  | 'message.updated'
  | 'message.deleted'
  | 'chat.updated'
  | 'chat.new'
  | 'connection.changed';

export type RealtimeEvent =
  | { type: 'message.new'; deviceId: string; channelId: string; payload: { chatId: string; message: Message } }
  | { type: 'message.updated'; deviceId: string; channelId: string; payload: { chatId: string; messageId: string; status: string } }
  | { type: 'message.deleted'; deviceId: string; channelId: string; payload: { chatId: string; messageId: string } }
  | { type: 'chat.updated'; deviceId: string; channelId: string; payload: { chat: Partial<Chat> & { id: string } } }
  | { type: 'chat.new'; deviceId: string; channelId: string; payload: { chat: Chat } }
  | { type: 'connection.changed'; deviceId: string; channelId: string; payload: { state: 'open' | 'close' | 'connecting' } };

export type RealtimeConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export type RealtimeEventFilter = {
  deviceId?: string;
  type?: RealtimeEventType | RealtimeEventType[];
};

export type RawWsLogger = (eventName: string, payload: unknown) => void;

export interface RealtimeConnection {
  connect(): void;
  disconnect(): void;
  onEvent(handler: (event: RealtimeEvent) => void): () => void;
  onStateChange(handler: (state: RealtimeConnectionState) => void): () => void;
  getState(): RealtimeConnectionState;
  setRawLogger?(logger: RawWsLogger): void;
}
