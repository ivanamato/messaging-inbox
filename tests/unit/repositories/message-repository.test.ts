/**
 * Tests for MessageRepository contract.
 *
 * These tests verify that repository implementations fulfill the domain contract.
 * Tests use mock repositories from tests/doubles/ rather than mocking fetch directly.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockMessageRepository } from '../../doubles/index.js';
import type { Message } from '@/lib/providers/types';

describe('MessageRepository contract', () => {
  let repo: MockMessageRepository;

  beforeEach(() => {
    repo = new MockMessageRepository();
  });

  const makeMessage = (overrides: Partial<Message> = {}): Message => ({
    id: 'msg-1',
    direction: 'inbound',
    content: 'Hello',
    createdAt: new Date().toISOString(),
    phoneNumber: '556992924255',
    hasMedia: false,
    messageType: 'text',
    ...overrides,
  });

  describe('findByChat', () => {
    it('returns empty array when no messages', async () => {
      const messages = await repo.findByChat('channel-1', 'chat-1');
      expect(messages).toEqual([]);
    });

    it('returns messages for a chat', async () => {
      const msg1 = makeMessage({ id: 'msg-1', phoneNumber: 'chat-1' });
      const msg2 = makeMessage({ id: 'msg-2', phoneNumber: 'chat-1' });
      const msg3 = makeMessage({ id: 'msg-3', phoneNumber: 'chat-2' });
      repo.setMessages([msg1, msg2, msg3]);

      const messages = await repo.findByChat('channel-1', 'chat-1');
      expect(messages).toHaveLength(2);
    });

    it('respects limit parameter', async () => {
      const messages = Array.from({ length: 10 }, (_, i) =>
        makeMessage({ id: `msg-${i}`, phoneNumber: 'chat-1' })
      );
      repo.setMessages(messages);

      const result = await repo.findByChat('channel-1', 'chat-1', 5);
      expect(result).toHaveLength(5);
    });
  });

  describe('findByChatPaginated', () => {
    it('returns paginated messages', async () => {
      const messages = Array.from({ length: 25 }, (_, i) =>
        makeMessage({ id: `msg-${i}`, phoneNumber: 'chat-1' })
      );
      repo.setMessages(messages);

      const result = await repo.findByChatPaginated('channel-1', 'chat-1', {
        page: 1,
        pageSize: 10,
      });

      expect(result.messages).toHaveLength(10);
      expect(result.pagination.currentPage).toBe(1);
      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.total).toBe(25);
      expect(result.pagination.hasMore).toBe(true);
    });

    it('returns correct page', async () => {
      const messages = Array.from({ length: 25 }, (_, i) =>
        makeMessage({ id: `msg-${i}`, phoneNumber: 'chat-1', content: `Message ${i}` })
      );
      repo.setMessages(messages);

      const page2 = await repo.findByChatPaginated('channel-1', 'chat-1', {
        page: 2,
        pageSize: 10,
      });

      expect(page2.messages).toHaveLength(10);
      expect(page2.pagination.currentPage).toBe(2);
    });

    it('returns empty when page beyond total', async () => {
      repo.setMessages([makeMessage()]);

      const result = await repo.findByChatPaginated('channel-1', 'chat-1', {
        page: 99,
        pageSize: 10,
      });

      expect(result.messages).toHaveLength(0);
      expect(result.pagination.hasMore).toBe(false);
    });
  });

  describe('sendText', () => {
    it('stores sent message and returns result', async () => {
      const result = await repo.sendText('channel-1', {
        to: '556992924255',
        body: 'Hello World',
      });

      expect(result.messageId).toMatch(/^mock-msg-/);
      expect(result.status).toBe('sent');

      const sentMessages = repo.getSentMessages();
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].params).toEqual({
        to: '556992924255',
        body: 'Hello World',
      });
    });
  });

  describe('sendMedia', () => {
    it('stores sent media message', async () => {
      const result = await repo.sendMedia('channel-1', {
        to: '556992924255',
        mediaType: 'image',
        media: 'base64data',
      });

      expect(result.messageId).toMatch(/^mock-media-/);
      expect(result.status).toBe('sent');
    });
  });

  describe('sendButtons', () => {
    it('stores sent buttons message', async () => {
      const result = await repo.sendButtons('channel-1', {
        to: '556992924255',
        body: 'Choose an option',
        buttons: [
          { id: 'btn-1', title: 'Option 1' },
          { id: 'btn-2', title: 'Option 2' },
        ],
      });

      expect(result.messageId).toMatch(/^mock-buttons-/);
      expect(result.status).toBe('sent');
    });
  });

  describe('delete', () => {
    it('removes message from store', async () => {
      const msg = makeMessage({ id: 'msg-to-delete' });
      repo.setMessages([msg]);

      await repo.delete('channel-1', { messageId: 'msg-to-delete' });

      const messages = await repo.findByChat('channel-1', '556992924255');
      expect(messages).toHaveLength(0);
    });

    it('does nothing when message not found', async () => {
      await expect(
        repo.delete('channel-1', { messageId: 'nonexistent' })
      ).resolves.toBeUndefined();
    });
  });

  describe('reset', () => {
    it('clears all state', async () => {
      repo.setMessages([makeMessage()]);
      await repo.sendText('channel-1', { to: '123', body: 'test' });

      repo.reset();

      const messages = await repo.findByChat('channel-1', '556992924255');
      expect(messages).toEqual([]);
      expect(repo.getSentMessages()).toEqual([]);
    });
  });
});
