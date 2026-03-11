import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/preact';
import { useChatList } from '@/use-cases/use-chat-list';
import type { WhatsAppProvider, Chat, DeviceConfig } from '@/lib/providers/types';

// ── Mock provider-context ────────────────────────────────────────────────────
// useChatList calls useProvider() and useDeviceContext() from the context.
// We mock the context module to inject our test provider.

let mockProvider: WhatsAppProvider;
let mockDeviceContextValue: {
  devices: DeviceConfig[];
  selectedDevice: DeviceConfig | null;
  selectDevice: (id: string) => void;
  getProviderForDevice: (device: DeviceConfig) => WhatsAppProvider;
  readonly: boolean;
  viewMode: 'single' | 'all';
  setViewMode: (mode: 'single' | 'all') => void;
  eventBus: null;
  realtimeStates: Record<string, string>;
  setWebSocketEnabled: (deviceId: string, enabled: boolean) => void;
};

vi.mock('@/lib/provider-context', () => ({
  useProvider: () => mockProvider,
  useDeviceContext: () => mockDeviceContextValue,
}));

// ── Test data helpers ────────────────────────────────────────────────────────

function makeChat(overrides: Partial<Chat> = {}): Chat {
  const id = overrides.id || `${Math.floor(Math.random() * 9000000000 + 1000000000)}@s.whatsapp.net`;
  return {
    id,
    phoneNumber: id.replace(/@.*$/, ''),
    contactName: 'Test Contact',
    lastActiveAt: new Date().toISOString(),
    lastMessage: {
      content: 'Hello',
      direction: 'inbound',
      type: 'text',
    },
    unreadCount: 0,
    ...overrides,
  };
}

function createMockProvider(chats: Chat[] = []): WhatsAppProvider {
  return {
    type: 'evolution',
    supportsTemplates: false,
    has24HourWindow: false,
    getConnectionState: vi.fn().mockResolvedValue('open'),
    findChats: vi.fn().mockResolvedValue(chats),
    findMessages: vi.fn().mockResolvedValue([]),
    findMessagesPaginated: vi.fn().mockResolvedValue({
      messages: [],
      pagination: { currentPage: 1, totalPages: 1, total: 0, hasMore: false },
    }),
    sendText: vi.fn().mockResolvedValue({ messageId: 'x', status: 'PENDING' }),
    sendMedia: vi.fn().mockResolvedValue({ messageId: 'x', status: 'PENDING' }),
    sendButtons: vi.fn().mockResolvedValue({ messageId: 'x', status: 'PENDING' }),
    getMediaUrl: vi.fn().mockResolvedValue(null),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
  };
}

const TEST_DEVICE: DeviceConfig = {
  id: 'test-device',
  apiUrl: 'http://localhost:3002',
  instanceToken: 'test-token',
  instanceName: 'MOCK1',
};

function resetMockContext(chats: Chat[] = []) {
  mockProvider = createMockProvider(chats);
  mockDeviceContextValue = {
    devices: [TEST_DEVICE],
    selectedDevice: TEST_DEVICE,
    selectDevice: vi.fn(),
    getProviderForDevice: vi.fn().mockReturnValue(mockProvider),
    readonly: false,
    viewMode: 'single',
    setViewMode: vi.fn(),
    eventBus: null,
    realtimeStates: {},
    setWebSocketEnabled: vi.fn(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useChatList hook', () => {
  beforeEach(() => {
    resetMockContext();
    vi.clearAllMocks();
  });

  function renderChatList(instance = 'MOCK1') {
    return renderHook(() => useChatList({ instance }));
  }

  it('fetches conversations on mount', async () => {
    const chats = [
      makeChat({ id: '5511111111111@s.whatsapp.net', contactName: 'Alice' }),
      makeChat({ id: '5522222222222@s.whatsapp.net', contactName: 'Bob' }),
    ];
    resetMockContext(chats);

    const { result } = renderChatList();

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.conversations).toHaveLength(2);
    const names = result.current.conversations.map(c => c.contactName);
    expect(names).toContain('Alice');
    expect(names).toContain('Bob');
  });

  it('filteredConversations filters by search query on contactName', async () => {
    const chats = [
      makeChat({ id: '5511111111111@s.whatsapp.net', contactName: 'Ana Beatriz' }),
      makeChat({ id: '5522222222222@s.whatsapp.net', contactName: 'Carlos Eduardo' }),
      makeChat({ id: '5533333333333@s.whatsapp.net', contactName: 'Fernanda Lima' }),
    ];
    resetMockContext(chats);

    const { result } = renderChatList();
    await waitFor(() => expect(result.current.loading).toBe(false));

    // All 3 should be visible with empty search
    expect(result.current.filteredConversations).toHaveLength(3);

    // Filter by 'Ana'
    act(() => {
      result.current.setSearchQuery('Ana');
    });

    expect(result.current.filteredConversations).toHaveLength(1);
    expect(result.current.filteredConversations[0].contactName).toBe('Ana Beatriz');
  });

  it('filteredConversations filters by phone number', async () => {
    const chats = [
      makeChat({ id: '5511999001122@s.whatsapp.net', phoneNumber: '5511999001122', contactName: 'Contact A' }),
      makeChat({ id: '5511888001122@s.whatsapp.net', phoneNumber: '5511888001122', contactName: 'Contact B' }),
    ];
    resetMockContext(chats);

    const { result } = renderChatList();
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setSearchQuery('9990');
    });

    expect(result.current.filteredConversations).toHaveLength(1);
    expect(result.current.filteredConversations[0].contactName).toBe('Contact A');
  });

  it('filteredConversations search is case-insensitive', async () => {
    const chats = [
      makeChat({ id: '5511111111111@s.whatsapp.net', contactName: 'ROBERTO MENDES' }),
    ];
    resetMockContext(chats);

    const { result } = renderChatList();
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setSearchQuery('roberto');
    });

    expect(result.current.filteredConversations).toHaveLength(1);
  });

  it('toggleTagFilter adds and removes tag IDs', async () => {
    resetMockContext([]);

    const { result } = renderChatList();
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Add a tag filter
    act(() => {
      result.current.toggleTagFilter('tag-vip');
    });
    expect(result.current.selectedTagIds.has('tag-vip')).toBe(true);

    // Add another
    act(() => {
      result.current.toggleTagFilter('tag-lead');
    });
    expect(result.current.selectedTagIds.has('tag-vip')).toBe(true);
    expect(result.current.selectedTagIds.has('tag-lead')).toBe(true);

    // Remove first
    act(() => {
      result.current.toggleTagFilter('tag-vip');
    });
    expect(result.current.selectedTagIds.has('tag-vip')).toBe(false);
    expect(result.current.selectedTagIds.has('tag-lead')).toBe(true);
  });

  it('findByPhoneNumber returns the matching conversation', async () => {
    const chats = [
      makeChat({ id: '5511111111111@s.whatsapp.net', phoneNumber: '5511111111111', contactName: 'Alice' }),
      makeChat({ id: '5522222222222@s.whatsapp.net', phoneNumber: '5522222222222', contactName: 'Bob' }),
    ];
    resetMockContext(chats);

    const { result } = renderChatList();
    await waitFor(() => expect(result.current.loading).toBe(false));

    const found = result.current.findByPhoneNumber('5522222222222');
    expect(found).toBeDefined();
    expect(found?.contactName).toBe('Bob');
  });

  it('findByPhoneNumber returns undefined when not found', async () => {
    resetMockContext([]);

    const { result } = renderChatList();
    await waitFor(() => expect(result.current.loading).toBe(false));

    const found = result.current.findByPhoneNumber('5599999999999');
    expect(found).toBeUndefined();
  });

  it('refresh re-fetches conversations', async () => {
    const initial = [makeChat({ id: '5511111111111@s.whatsapp.net', contactName: 'Before' })];
    const updated = [makeChat({ id: '5511111111111@s.whatsapp.net', contactName: 'After' })];

    resetMockContext(initial);
    (mockProvider.findChats as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(updated);

    const { result } = renderChatList();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.conversations[0].contactName).toBe('Before');

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.conversations[0].contactName).toBe('After');
  });

  it('returns empty conversations when no instance provided and does not call findChats', async () => {
    resetMockContext([]);

    const { result } = renderHook(() => useChatList({ instance: undefined }));

    // Give it a tick to run any effects
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Conversations should be empty regardless of loading state
    expect(result.current.conversations).toHaveLength(0);
    expect(mockProvider.findChats).not.toHaveBeenCalled();
  });
});
