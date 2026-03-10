import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/preact';
import type { RefObject } from 'preact/hooks';
import {
  isWithin24HourWindow,
  processMessages,
  useMessageThread,
} from '@/use-cases/use-message-thread';
import type { Message, WhatsAppProvider, PaginatedMessages, DeviceConfig } from '@/lib/providers/types';

// ── Mock provider-context ────────────────────────────────────────────────────

let mockProvider: WhatsAppProvider;

vi.mock('@/lib/provider-context', () => ({
  useProvider: () => mockProvider,
  useDeviceContext: () => ({
    devices: [],
    selectedDevice: null,
    selectDevice: vi.fn(),
    getProviderForDevice: vi.fn().mockReturnValue(mockProvider),
    readonly: false,
    viewMode: 'single',
    setViewMode: vi.fn(),
  }),
}));

// Also mock i18n since it may need translations context
vi.mock('@/lib/i18n', () => ({
  useTranslations: () => (key: string) => key,
  TranslationsProvider: ({ children }: { children: unknown }) => children,
}));

// ── Test data helpers ────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    direction: 'inbound',
    content: 'Test message',
    createdAt: new Date().toISOString(),
    status: 'delivered',
    phoneNumber: '5511999999999',
    hasMedia: false,
    messageType: 'text',
    reactionEmoji: null,
    reactedToMessageId: null,
    ...overrides,
  };
}

function makePaginated(messages: Message[], hasMore = false): PaginatedMessages {
  return {
    messages,
    pagination: {
      currentPage: 1,
      totalPages: hasMore ? 2 : 1,
      total: messages.length,
      hasMore,
    },
  };
}

function createMockProvider(): WhatsAppProvider {
  return {
    type: 'evolution',
    capabilities: {
      templates: false,
      messagingWindow24h: false,
      pushToTalk: false,
      interactiveButtons: false,
      deleteForEveryone: false,
    },
    getConnectionState: vi.fn().mockResolvedValue('open'),
    findChats: vi.fn().mockResolvedValue([]),
    findMessages: vi.fn().mockResolvedValue([]),
    findMessagesPaginated: vi.fn().mockResolvedValue(makePaginated([])),
    sendText: vi.fn().mockResolvedValue({ messageId: 'new-id', status: 'PENDING' }),
    sendMedia: vi.fn().mockResolvedValue({ messageId: 'media-id', status: 'PENDING' }),
    sendButtons: vi.fn().mockResolvedValue({ messageId: 'btn-id', status: 'PENDING' }),
    getMediaUrl: vi.fn().mockResolvedValue(null),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
  };
}

// ── Pure function tests ──────────────────────────────────────────────────────

describe('isWithin24HourWindow', () => {
  it('returns false for empty messages', () => {
    expect(isWithin24HourWindow([])).toBe(false);
  });

  it('returns false when no inbound messages', () => {
    const messages = [
      makeMessage({ direction: 'outbound' }),
      makeMessage({ direction: 'outbound' }),
    ];
    expect(isWithin24HourWindow(messages)).toBe(false);
  });

  it('returns true when last inbound message is within 24 hours', () => {
    const messages = [
      makeMessage({ direction: 'inbound', createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() }),
    ];
    expect(isWithin24HourWindow(messages)).toBe(true);
  });

  it('returns false when last inbound message is older than 24 hours', () => {
    const messages = [
      makeMessage({
        direction: 'inbound',
        createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      }),
    ];
    expect(isWithin24HourWindow(messages)).toBe(false);
  });

  it('returns true at the exact 24-hour boundary (within)', () => {
    // Just under 24 hours ago
    const messages = [
      makeMessage({
        direction: 'inbound',
        createdAt: new Date(Date.now() - 23 * 60 * 60 * 1000 - 59 * 60 * 1000).toISOString(),
      }),
    ];
    expect(isWithin24HourWindow(messages)).toBe(true);
  });

  it('uses the last inbound message, not the first', () => {
    const messages = [
      makeMessage({
        direction: 'inbound',
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 2 days ago
      }),
      makeMessage({ direction: 'outbound', createdAt: new Date().toISOString() }),
      makeMessage({
        direction: 'inbound',
        createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
      }),
    ];
    expect(isWithin24HourWindow(messages)).toBe(true);
  });

  it('returns false for invalid date strings', () => {
    const messages = [
      makeMessage({ direction: 'inbound', createdAt: 'not-a-date' }),
    ];
    expect(isWithin24HourWindow(messages)).toBe(false);
  });
});

describe('processMessages', () => {
  it('filters out reaction messages from the main list', () => {
    const messages = [
      makeMessage({ id: 'msg-1', messageType: 'text', content: 'Hello' }),
      makeMessage({
        id: 'reaction-1',
        messageType: 'reaction',
        reactionEmoji: '❤️',
        reactedToMessageId: 'msg-1',
      }),
    ];
    const processed = processMessages(messages);
    expect(processed.find(m => m.messageType === 'reaction')).toBeUndefined();
  });

  it('attaches reaction emoji to the target message', () => {
    const messages = [
      makeMessage({ id: 'msg-1', messageType: 'text', content: 'Hello' }),
      makeMessage({
        id: 'reaction-1',
        messageType: 'reaction',
        reactionEmoji: '👍',
        reactedToMessageId: 'msg-1',
      }),
    ];
    const processed = processMessages(messages);
    const target = processed.find(m => m.id === 'msg-1');
    expect(target?.reactionEmoji).toBe('👍');
  });

  it('sorts messages by createdAt ascending', () => {
    const now = Date.now();
    const messages = [
      makeMessage({ id: 'newer', createdAt: new Date(now).toISOString() }),
      makeMessage({ id: 'older', createdAt: new Date(now - 5000).toISOString() }),
    ];
    const processed = processMessages(messages);
    expect(processed[0].id).toBe('older');
    expect(processed[1].id).toBe('newer');
  });

  it('returns empty array for empty input', () => {
    expect(processMessages([])).toEqual([]);
  });
});

// ── Hook tests ───────────────────────────────────────────────────────────────

describe('useMessageThread hook', () => {
  beforeEach(() => {
    mockProvider = createMockProvider();
  });

  function renderThread(props: Partial<Parameters<typeof useMessageThread>[0]> = {}) {
    const isNearBottomRef: RefObject<boolean> = { current: false };
    return renderHook(() =>
      useMessageThread({
        conversationId: '5511999999999@s.whatsapp.net',
        phoneNumber: '5511999999999',
        instance: 'MOCK1',
        isNearBottomRef,
        providerOverride: mockProvider,
        ...props,
      }),
    );
  }

  it('fetchInitialMessages sets messages state', async () => {
    const testMessages = [
      makeMessage({ id: 'msg-a', content: 'First message', direction: 'inbound' }),
      makeMessage({ id: 'msg-b', content: 'Second message', direction: 'outbound' }),
    ];

    (mockProvider.findMessagesPaginated as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePaginated(testMessages),
    );

    const { result } = renderThread();

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.messages).toHaveLength(2);
    const contents = result.current.messages.map(m => m.content);
    expect(contents).toContain('First message');
    expect(contents).toContain('Second message');
  });

  it('send appends an optimistic message immediately', async () => {
    (mockProvider.findMessagesPaginated as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePaginated([]),
    );

    const { result } = renderThread();

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Set input and send
    act(() => {
      result.current.setMessageInput('Hello from test!');
    });

    await act(async () => {
      await result.current.send();
    });

    // The optimistic message should appear immediately
    const optimistic = result.current.messages.find(m => m.id.startsWith('optimistic-'));
    expect(optimistic).toBeDefined();
    expect(optimistic?.content).toBe('Hello from test!');
    expect(optimistic?.direction).toBe('outbound');
    expect(optimistic?.status).toBe('pending');
  });

  it('send calls provider.sendText with correct params', async () => {
    (mockProvider.findMessagesPaginated as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePaginated([]),
    );

    const { result } = renderThread();
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setMessageInput('Test message body');
    });

    await act(async () => {
      await result.current.send();
    });

    expect(mockProvider.sendText).toHaveBeenCalledWith('MOCK1', {
      to: '5511999999999',
      body: 'Test message body',
    });
  });

  it('send marks message as failed when provider throws', async () => {
    (mockProvider.findMessagesPaginated as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePaginated([]),
    );
    (mockProvider.sendText as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Network error'),
    );
    // After failure, fetchInitialMessages is called - mock it to return empty
    (mockProvider.findMessagesPaginated as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makePaginated([]))
      .mockResolvedValue(makePaginated([]));

    const { result } = renderThread();
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setMessageInput('Will fail');
    });

    await act(async () => {
      await result.current.send();
    });

    const failedMsg = result.current.messages.find(m => m.content === 'Will fail');
    expect(failedMsg?.status).toBe('failed');
  });

  it('hasMore is true when pagination indicates more pages', async () => {
    (mockProvider.findMessagesPaginated as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePaginated([makeMessage()], true),
    );

    const { result } = renderThread();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasMore).toBe(true);
  });

  it('hasMore is false when on last page', async () => {
    (mockProvider.findMessagesPaginated as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePaginated([makeMessage()], false),
    );

    const { result } = renderThread();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasMore).toBe(false);
  });

  it('does not fetch when conversationId is missing', async () => {
    const isNearBottomRef: RefObject<boolean> = { current: false };
    const { result } = renderHook(() =>
      useMessageThread({
        conversationId: undefined,
        phoneNumber: undefined,
        instance: 'MOCK1',
        isNearBottomRef,
        providerOverride: mockProvider,
      }),
    );

    // loading should stay false (no fetch triggered)
    expect(result.current.loading).toBe(false);
    expect(mockProvider.findMessagesPaginated).not.toHaveBeenCalled();
  });
});
