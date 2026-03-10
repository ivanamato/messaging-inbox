import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EvolutionProvider } from '@/lib/providers/evolution';

// Helper to create a mock fetch response
function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

// Mock fetch globally
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EvolutionProvider', () => {
  const BASE_URL = 'http://localhost:3002';
  const TOKEN = 'mock-token-123';
  const INSTANCE = 'MOCK1';

  let provider: EvolutionProvider;

  beforeEach(() => {
    provider = new EvolutionProvider(BASE_URL, TOKEN);
  });

  // ── getConnectionState ────────────────────────────────────────────────────

  describe('getConnectionState', () => {
    it('returns "open" when API reports open', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ instance: { state: 'open' } }),
      );
      const state = await provider.getConnectionState(INSTANCE);
      expect(state).toBe('open');
      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/instance/connectionState/${INSTANCE}`,
        expect.objectContaining({ headers: expect.objectContaining({ apikey: TOKEN }) }),
      );
    });

    it('returns "close" when API reports close', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ instance: { state: 'close' } }),
      );
      const state = await provider.getConnectionState(INSTANCE);
      expect(state).toBe('close');
    });

    it('returns "connecting" when API reports connecting', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ instance: { state: 'connecting' } }),
      );
      const state = await provider.getConnectionState(INSTANCE);
      expect(state).toBe('connecting');
    });

    it('returns "close" for unknown states', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ instance: { state: 'unknown_state' } }),
      );
      const state = await provider.getConnectionState(INSTANCE);
      expect(state).toBe('close');
    });
  });

  // ── findChats ─────────────────────────────────────────────────────────────

  describe('findChats', () => {
    it('returns normalized Chat[] from API response', async () => {
      const mockChats = [
        {
          id: '556992924255@s.whatsapp.net',
          remoteJid: '556992924255@s.whatsapp.net',
          name: 'Ana Beatriz',
          pushName: 'Ana Beatriz',
          unreadCount: 3,
          updatedAt: new Date().toISOString(),
          lastMessage: {
            key: { id: 'msg-1', fromMe: false, remoteJid: '556992924255@s.whatsapp.net' },
            pushName: 'Ana Beatriz',
            messageType: 'conversation',
            message: { conversation: 'Oi!' },
            messageTimestamp: Math.floor(Date.now() / 1000),
          },
        },
      ];
      const mockContacts = [
        { remoteJid: '556992924255@s.whatsapp.net', pushName: 'Ana Beatriz', profilePicUrl: null },
      ];

      // findChats calls findChats + findContacts in parallel
      fetchMock
        .mockResolvedValueOnce(mockResponse(mockChats))
        .mockResolvedValueOnce(mockResponse(mockContacts));

      const chats = await provider.findChats(INSTANCE);

      expect(chats).toHaveLength(1);
      expect(chats[0].id).toBe('556992924255@s.whatsapp.net');
      expect(chats[0].phoneNumber).toBe('556992924255');
      expect(chats[0].contactName).toBe('Ana Beatriz');
      expect(chats[0].unreadCount).toBe(3);
      expect(chats[0].lastMessage?.content).toBe('Oi!');
      expect(chats[0].lastMessage?.direction).toBe('inbound');
    });

    it('handles LID/phone JID deduplication', async () => {
      const now = Math.floor(Date.now() / 1000);
      const mockChats = [
        // Phone-based entry
        {
          id: '5511987654321@s.whatsapp.net',
          remoteJid: '5511987654321@s.whatsapp.net',
          name: 'Carlos Eduardo',
          pushName: 'Carlos Eduardo',
          unreadCount: 0,
          updatedAt: new Date((now - 3600) * 1000).toISOString(),
          lastMessage: {
            key: { id: 'msg-phone', fromMe: true, remoteJid: '5511987654321@s.whatsapp.net' },
            messageType: 'conversation',
            message: { conversation: 'Old message' },
            messageTimestamp: now - 3600,
          },
        },
        // LID entry for the same contact
        {
          id: '98765432109876543@lid',
          remoteJid: '98765432109876543@lid',
          name: 'Carlos Eduardo',
          pushName: 'Carlos Eduardo',
          unreadCount: 0,
          updatedAt: new Date(now * 1000).toISOString(),
          lastMessage: {
            key: {
              id: 'msg-lid',
              fromMe: true,
              remoteJid: '98765432109876543@lid',
              remoteJidAlt: '5511987654321@s.whatsapp.net',
            },
            messageType: 'conversation',
            message: { conversation: 'Newer message via LID' },
            messageTimestamp: now,
          },
        },
      ];

      fetchMock
        .mockResolvedValueOnce(mockResponse(mockChats))
        .mockResolvedValueOnce(mockResponse([]));

      const chats = await provider.findChats(INSTANCE);

      // Should be merged into a single chat
      expect(chats).toHaveLength(1);
      expect(chats[0].id).toBe('5511987654321@s.whatsapp.net');
      expect(chats[0].phoneNumber).toBe('5511987654321');
    });

    it('handles group chats', async () => {
      const mockChats = [
        {
          id: '120363012345678901@g.us',
          remoteJid: '120363012345678901@g.us',
          name: 'Equipe Vendas',
          pushName: 'Equipe Vendas',
          unreadCount: 5,
          updatedAt: new Date().toISOString(),
          lastMessage: {
            key: {
              id: 'msg-grp',
              fromMe: false,
              remoteJid: '120363012345678901@g.us',
              participant: '556711223344@s.whatsapp.net',
            },
            messageType: 'conversation',
            message: { conversation: 'Reunião às 15h' },
            messageTimestamp: Math.floor(Date.now() / 1000),
          },
        },
      ];

      fetchMock
        .mockResolvedValueOnce(mockResponse(mockChats))
        .mockResolvedValueOnce(mockResponse([]));

      const chats = await provider.findChats(INSTANCE);

      expect(chats).toHaveLength(1);
      expect(chats[0].id).toBe('120363012345678901@g.us');
      expect(chats[0].contactName).toBe('Equipe Vendas');
    });

    it('sorts chats by lastActiveAt descending', async () => {
      const now = Math.floor(Date.now() / 1000);
      const mockChats = [
        {
          id: '5511111111111@s.whatsapp.net',
          remoteJid: '5511111111111@s.whatsapp.net',
          name: 'Older Chat',
          pushName: 'Older Chat',
          updatedAt: new Date((now - 7200) * 1000).toISOString(),
          lastMessage: {
            key: { id: 'old', fromMe: false, remoteJid: '5511111111111@s.whatsapp.net' },
            pushName: 'Older Chat',
            message: { conversation: 'Older' },
            messageTimestamp: now - 7200,
          },
        },
        {
          id: '5522222222222@s.whatsapp.net',
          remoteJid: '5522222222222@s.whatsapp.net',
          name: 'Newer Chat',
          pushName: 'Newer Chat',
          updatedAt: new Date(now * 1000).toISOString(),
          lastMessage: {
            key: { id: 'new', fromMe: false, remoteJid: '5522222222222@s.whatsapp.net' },
            pushName: 'Newer Chat',
            message: { conversation: 'Newer' },
            messageTimestamp: now,
          },
        },
      ];

      fetchMock
        .mockResolvedValueOnce(mockResponse(mockChats))
        .mockResolvedValueOnce(mockResponse([]));

      const chats = await provider.findChats(INSTANCE);

      expect(chats[0].contactName).toBe('Newer Chat');
      expect(chats[1].contactName).toBe('Older Chat');
    });
  });

  // ── findMessages ──────────────────────────────────────────────────────────

  describe('findMessages', () => {
    it('returns normalized Message[] for a given chat', async () => {
      const now = Math.floor(Date.now() / 1000);
      const mockMessages = [
        {
          key: { remoteJid: '556992924255@s.whatsapp.net', fromMe: false, id: 'msg-001' },
          pushName: 'Ana',
          messageType: 'conversation',
          messageTimestamp: now - 100,
          message: { conversation: 'Olá!' },
        },
        {
          key: { remoteJid: '556992924255@s.whatsapp.net', fromMe: true, id: 'msg-002' },
          messageType: 'conversation',
          messageTimestamp: now,
          MessageUpdate: [{ status: 'READ' }],
          message: { conversation: 'Oi!' },
        },
      ];

      // findMessages with a phone JID calls ensureLidMap (findChats) then fetchJid twice
      // For simplicity: stub ensureLidMap hit (no lid map) + the actual findMessages call
      fetchMock
        .mockResolvedValueOnce(mockResponse([])) // ensureLidMap -> findChats
        .mockResolvedValueOnce(mockResponse({ messages: { records: mockMessages } })); // phone JID

      const messages = await provider.findMessages(INSTANCE, '556992924255@s.whatsapp.net');

      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBe('msg-001');
      expect(messages[0].direction).toBe('inbound');
      expect(messages[0].content).toBe('Olá!');
      expect(messages[0].messageType).toBe('text');
      expect(messages[1].direction).toBe('outbound');
      expect(messages[1].status).toBe('read');
    });

    it('normalizes image messages with hasMedia=true', async () => {
      const mockMessages = [
        {
          key: { remoteJid: '5511111111111@s.whatsapp.net', fromMe: false, id: 'img-001' },
          messageType: 'imageMessage',
          messageTimestamp: Math.floor(Date.now() / 1000),
          message: {
            imageMessage: {
              url: 'https://example.com/img.jpg',
              mimetype: 'image/jpeg',
              caption: 'Foto linda',
              fileName: 'foto.jpg',
              fileLength: 102400,
            },
          },
        },
      ];

      fetchMock
        .mockResolvedValueOnce(mockResponse([])) // ensureLidMap
        .mockResolvedValueOnce(mockResponse({ messages: { records: mockMessages } }));

      const messages = await provider.findMessages(INSTANCE, '5511111111111@s.whatsapp.net');

      expect(messages).toHaveLength(1);
      expect(messages[0].hasMedia).toBe(true);
      expect(messages[0].messageType).toBe('image');
      expect(messages[0].caption).toBe('Foto linda');
      expect(messages[0].mimeType).toBe('image/jpeg');
    });

    it('marks messages as deleted when revoked by protocol message', async () => {
      const now = Math.floor(Date.now() / 1000);
      const mockMessages = [
        {
          key: { remoteJid: '5511111111111@s.whatsapp.net', fromMe: false, id: 'secret-msg' },
          messageType: 'conversation',
          messageTimestamp: now - 200,
          message: { conversation: 'Secret message' },
        },
        {
          key: { remoteJid: '5511111111111@s.whatsapp.net', fromMe: false, id: 'revoke-msg' },
          messageType: 'protocolMessage',
          messageTimestamp: now - 100,
          message: {
            protocolMessage: {
              key: { id: 'secret-msg' },
              type: 'REVOKE',
            },
          },
        },
      ];

      fetchMock
        .mockResolvedValueOnce(mockResponse([])) // ensureLidMap
        .mockResolvedValueOnce(mockResponse({ messages: { records: mockMessages } }));

      const messages = await provider.findMessages(INSTANCE, '5511111111111@s.whatsapp.net');

      // Protocol message is filtered out, original is marked deleted
      const deletedMsg = messages.find(m => m.id === 'secret-msg');
      expect(deletedMsg).toBeDefined();
      expect(deletedMsg?.messageType).toBe('deleted');
      expect(deletedMsg?.content).toBe('');
    });
  });

  // ── sendText ──────────────────────────────────────────────────────────────

  describe('sendText', () => {
    it('calls the correct endpoint and returns SendResult', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ key: { id: 'new-msg-id' }, status: 'PENDING' }),
      );

      const result = await provider.sendText(INSTANCE, {
        to: '556992924255@s.whatsapp.net',
        body: 'Hello World',
      });

      expect(result.messageId).toBe('new-msg-id');
      expect(result.status).toBe('PENDING');

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/message/sendText/${INSTANCE}`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            number: '556992924255@s.whatsapp.net',
            text: 'Hello World',
          }),
        }),
      );
    });

    it('sends the apikey header', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ key: { id: 'x' }, status: 'PENDING' }),
      );

      await provider.sendText(INSTANCE, { to: '5511999999999', body: 'Hi' });

      const callArgs = fetchMock.mock.calls[0][1] as RequestInit;
      expect((callArgs.headers as Record<string, string>)['apikey']).toBe(TOKEN);
    });
  });

  // ── deleteMessage ─────────────────────────────────────────────────────────

  describe('deleteMessage', () => {
    it('calls DELETE endpoint with correct body', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({}));

      await provider.deleteMessage(INSTANCE, {
        messageId: 'msg-123',
        metadata: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: true },
      });

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/chat/deleteMessageForEveryone/${INSTANCE}`,
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({
            id: 'msg-123',
            remoteJid: '5511999999999@s.whatsapp.net',
            fromMe: true,
          }),
        }),
      );
    });

    it('resolves without error on success', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({}));

      await expect(
        provider.deleteMessage(INSTANCE, {
          messageId: 'msg-456',
          metadata: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false },
        }),
      ).resolves.toBeUndefined();
    });
  });

  // ── Error handling ────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws when API returns non-OK status', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
        headers: new Headers(),
      } as unknown as Response);

      await expect(provider.getConnectionState(INSTANCE)).rejects.toThrow('Request failed (401)');
    });

    it('throws for invalid API URLs', () => {
      expect(() => new EvolutionProvider('not-a-url', TOKEN)).toThrow('Invalid API URL');
    });
  });
});
