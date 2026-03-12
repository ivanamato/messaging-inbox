/**
 * Tests for ChatRepository contract.
 *
 * These tests verify that repository implementations fulfill the domain contract.
 * Tests use mock repositories from tests/doubles/ rather than mocking fetch directly.
 * This follows the Dependency Inversion Principle - tests depend on abstractions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockChatRepository } from '../../doubles/index.js';
import type { Chat } from '@/lib/providers/types';

describe('ChatRepository contract', () => {
  let repo: MockChatRepository;

  beforeEach(() => {
    repo = new MockChatRepository();
  });

  const makeChat = (overrides: Partial<Chat> = {}): Chat => ({
    id: '556992924255@s.whatsapp.net',
    phoneNumber: '556992924255',
    contactName: 'Test Contact',
    ...overrides,
  });

  describe('findAll', () => {
    it('returns empty array when no chats set', async () => {
      const chats = await repo.findAll('channel-1');
      expect(chats).toEqual([]);
    });

    it('returns all chats for a channel', async () => {
      const chat1 = makeChat({ id: '1@s.whatsapp.net', phoneNumber: '1' });
      const chat2 = makeChat({ id: '2@s.whatsapp.net', phoneNumber: '2' });
      repo.setChats([chat1, chat2]);

      const chats = await repo.findAll('channel-1');
      expect(chats).toHaveLength(2);
      expect(chats).toContainEqual(chat1);
      expect(chats).toContainEqual(chat2);
    });
  });

  describe('findByPhoneNumber', () => {
    it('returns undefined when chat not found', async () => {
      const chat = await repo.findByPhoneNumber('channel-1', '556992924255');
      expect(chat).toBeUndefined();
    });

    it('returns chat matching phone number', async () => {
      const chat = makeChat();
      repo.setChats([chat]);

      const found = await repo.findByPhoneNumber('channel-1', '556992924255');
      expect(found).toEqual(chat);
    });

    it('returns first chat when multiple have same phone number', async () => {
      const chat1 = makeChat({ contactName: 'First' });
      const chat2 = makeChat({ contactName: 'Second' });
      repo.setChats([chat1, chat2]);

      const found = await repo.findByPhoneNumber('channel-1', '556992924255');
      expect(found?.contactName).toBe('First');
    });
  });

  describe('markAsRead', () => {
    it('records markAsRead calls', async () => {
      await repo.markAsRead('channel-1', 'chat-1');
      await repo.markAsRead('channel-1', 'chat-2');

      const calls = repo.getMarkAsReadCalls();
      expect(calls).toHaveLength(2);
      expect(calls[0]).toEqual({ channelId: 'channel-1', chatId: 'chat-1' });
      expect(calls[1]).toEqual({ channelId: 'channel-1', chatId: 'chat-2' });
    });
  });

  describe('reset', () => {
    it('clears all state', async () => {
      repo.setChats([makeChat()]);
      await repo.markAsRead('channel-1', 'chat-1');

      repo.reset();

      const chats = await repo.findAll('channel-1');
      expect(chats).toEqual([]);
      expect(repo.getMarkAsReadCalls()).toEqual([]);
    });
  });
});
