/**
 * Test doubles for repository interfaces.
 * Provides mock implementations for unit testing without real providers.
 */

import type {
  ChatRepository,
  MessageRepository,
  MediaRepository,
  ConnectionRepository,
} from '@/domain/repositories/types';
import type { Chat, Message, PaginatedMessages, SendResult } from '@/lib/providers/types';

/**
 * Mock implementation of ChatRepository for testing.
 */
export class MockChatRepository implements ChatRepository {
  private chats: Chat[] = [];
  private markAsReadCalls: Array<{ channelId: string; chatId: string }> = [];

  /** Set the chats to be returned by findAll */
  setChats(chats: Chat[]): void {
    this.chats = chats;
  }

  /** Get all markAsRead calls made */
  getMarkAsReadCalls(): Array<{ channelId: string; chatId: string }> {
    return [...this.markAsReadCalls];
  }

  async findAll(channelId: string): Promise<Chat[]> {
    return this.chats.filter(c => !c.id.includes('::') || c.id.startsWith(channelId));
  }

  async findByPhoneNumber(channelId: string, phoneNumber: string): Promise<Chat | undefined> {
    return this.chats.find(c => c.phoneNumber === phoneNumber);
  }

  async markAsRead(channelId: string, chatId: string): Promise<void> {
    this.markAsReadCalls.push({ channelId, chatId });
  }

  /** Reset all state */
  reset(): void {
    this.chats = [];
    this.markAsReadCalls = [];
  }
}

/**
 * Mock implementation of MessageRepository for testing.
 */
export class MockMessageRepository implements MessageRepository {
  private messages: Message[] = [];
  private sentMessages: Array<{ channelId: string; params: unknown }> = [];

  /** Set the messages to be returned by findByChat */
  setMessages(messages: Message[]): void {
    this.messages = messages;
  }

  /** Get all sent messages */
  getSentMessages(): Array<{ channelId: string; params: unknown }> {
    return [...this.sentMessages];
  }

  async findByChat(channelId: string, chatId: string, limit?: number): Promise<Message[]> {
    let result = this.messages.filter(m => m.phoneNumber === chatId);
    if (limit) result = result.slice(0, limit);
    return result;
  }

  async findByChatPaginated(
    channelId: string,
    chatId: string,
    options?: { page?: number; pageSize?: number },
  ): Promise<PaginatedMessages> {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 50;
    const all = await this.findByChat(channelId, chatId);
    const start = (page - 1) * pageSize;
    const messages = all.slice(start, start + pageSize);

    return {
      messages,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(all.length / pageSize),
        total: all.length,
        hasMore: start + pageSize < all.length,
      },
    };
  }

  async sendText(channelId: string, params: { to: string; body: string }): Promise<SendResult> {
    this.sentMessages.push({ channelId, params });
    return { messageId: `mock-msg-${Date.now()}`, status: 'sent' };
  }

  async sendMedia(channelId: string, params: unknown): Promise<SendResult> {
    this.sentMessages.push({ channelId, params });
    return { messageId: `mock-media-${Date.now()}`, status: 'sent' };
  }

  async sendButtons(channelId: string, params: unknown): Promise<SendResult> {
    this.sentMessages.push({ channelId, params });
    return { messageId: `mock-buttons-${Date.now()}`, status: 'sent' };
  }

  async delete(channelId: string, params: { messageId: string }): Promise<void> {
    const idx = this.messages.findIndex(m => m.id === params.messageId);
    if (idx >= 0) {
      this.messages.splice(idx, 1);
    }
  }

  /** Reset all state */
  reset(): void {
    this.messages = [];
    this.sentMessages = [];
  }
}

/**
 * Mock implementation of MediaRepository for testing.
 */
export class MockMediaRepository implements MediaRepository {
  private urls = new Map<string, string>();

  /** Set the URL for a specific message ID */
  setUrl(messageId: string, url: string): void {
    this.urls.set(messageId, url);
  }

  async getUrl(channelId: string, messageId: string): Promise<string | null> {
    return this.urls.get(messageId) ?? null;
  }

  /** Reset all state */
  reset(): void {
    this.urls.clear();
  }
}

/**
 * Mock implementation of ConnectionRepository for testing.
 */
export class MockConnectionRepository implements ConnectionRepository {
  private states = new Map<string, 'open' | 'close' | 'connecting'>();

  /** Set the connection state for a channel */
  setState(channelId: string, state: 'open' | 'close' | 'connecting'): void {
    this.states.set(channelId, state);
  }

  async getState(channelId: string): Promise<'open' | 'close' | 'connecting'> {
    return this.states.get(channelId) ?? 'close';
  }

  /** Reset all state */
  reset(): void {
    this.states.clear();
  }
}

/**
 * Factory to create a complete set of mock repositories.
 */
export function createMockRepositories() {
  return {
    chat: new MockChatRepository(),
    message: new MockMessageRepository(),
    media: new MockMediaRepository(),
    connection: new MockConnectionRepository(),
  };
}

/**
 * Type for the return value of createMockRepositories.
 */
export type MockRepositorySet = ReturnType<typeof createMockRepositories>;
