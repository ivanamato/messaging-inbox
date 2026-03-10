import { test, expect } from '@playwright/test';
import { ConversationListPage } from './pages/conversation-list.page';
import { MessageThreadPage } from './pages/message-thread.page';

// Tests the GenericServerProvider against the generic mock server (port 3003).
//
// Generic device fixture data (GENERIC1 instance):
//   Alice Martin (14151234567) — 2 unread, last: "Hi, I need help with my order"
//   Bob Chen     (16505559876) — 0 unread, last: "Perfect, thanks!"
//
// Requires the docker stack to be running: make docker
// The generic server runs on localhost:3003 (separate from the Evolution mock on 3002).

type WW = Window & { __whatsappInbox: { setActiveDevice(id: string): void } };

test.describe('Generic provider device', () => {
  let chatList: ConversationListPage;
  let thread: MessageThreadPage;

  test.beforeEach(async ({ page, request }) => {
    // Reset server-side in-memory state so accumulated sent messages don't leak between runs
    await request.post('http://localhost:3003/channels/GENERIC1/reset', {
      headers: { Authorization: 'Bearer generic-token-789' },
    });

    chatList = new ConversationListPage(page);
    thread = new MessageThreadPage(page);
    await page.goto('/');
    await chatList.waitForLoaded();
    // Switch to the generic-server device
    await page.evaluate(() => (window as unknown as WW).__whatsappInbox.setActiveDevice('mock-device-3'));
    // Wait for the generic channel's chats to appear
    await expect(chatList.chatItem('Alice Martin')).toBeVisible({ timeout: 10000 });
  });

  // ── Chat list ────────────────────────────────────────────────────────────

  test('shows all chats from the generic channel', async () => {
    await expect(chatList.chatItem('Alice Martin')).toBeVisible();
    await expect(chatList.chatItem('Bob Chen')).toBeVisible();
  });

  test('shows unread badge count for Alice Martin', async () => {
    const count = await chatList.getUnreadCount('Alice Martin');
    expect(count).toBe(2);
  });

  test('shows zero unread for Bob Chen', async () => {
    const count = await chatList.getUnreadCount('Bob Chen');
    expect(count).toBe(0);
  });

  test('shows last message preview text', async () => {
    await expect(chatList.chatItem('Alice Martin')).toContainText('Hi, I need help with my order');
    await expect(chatList.chatItem('Bob Chen')).toContainText('Perfect, thanks!');
  });

  // ── Message thread ───────────────────────────────────────────────────────

  test('opens a conversation and shows messages', async () => {
    await chatList.clickChat('Alice Martin');
    await thread.waitForLoaded();
    await expect(thread.root).toBeVisible();
    await expect(thread.bubbleWithText('Hi, I need help with my order')).toBeVisible();
  });

  test('renders inbound and outbound bubbles correctly', async () => {
    await chatList.clickChat('Alice Martin');
    await thread.waitForLoaded();
    // Fixture: 2 outbound ("Hello! How can I help you?", "Sure! What's your order number?")
    await expect(thread.outboundBubbles()).toHaveCount(2);
    // Fixture: 2 inbound ("I'd like to check on my order status", "Hi, I need help with my order")
    await expect(thread.inboundBubbles()).toHaveCount(2);
  });

  test('renders the last inbound message as a bubble', async () => {
    await chatList.clickChat('Alice Martin');
    await thread.waitForLoaded();
    await expect(thread.bubbleWithText("I'd like to check on my order status")).toBeVisible();
  });

  // ── Sending ──────────────────────────────────────────────────────────────

  test('sends a text message via the generic provider', async () => {
    await chatList.clickChat('Alice Martin');
    await thread.waitForLoaded();
    await thread.sendMessage('Testing the generic provider!');
    await expect(thread.bubbleWithText('Testing the generic provider!')).toBeVisible();
  });

  test('sent message appears as outbound bubble', async () => {
    await chatList.clickChat('Alice Martin');
    await thread.waitForLoaded();
    await thread.sendMessage('Hello from generic!');
    const bubble = thread.bubbleWithText('Hello from generic!');
    await expect(bubble).toBeVisible();
    await expect(bubble).toHaveAttribute('data-direction', 'outbound');
  });
});
