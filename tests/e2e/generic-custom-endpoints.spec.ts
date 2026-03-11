import { test, expect } from '@playwright/test';
import { ConversationListPage } from './pages/conversation-list.page';
import { MessageThreadPage } from './pages/message-thread.page';

// Tests the GenericServerProvider with CUSTOM ENDPOINTS against the generic mock
// server (port 3003). The mock-device-4 device uses an `endpoints` config that
// routes all requests to /api/v2/... paths instead of the default /channels/... paths.
//
// Generic device fixture data (GENERIC_CUSTOM instance):
//   Emma Wilson   (emma-wilson)   — 1 unread, last: "Can you check the deployment?"
//   David Kim     (david-kim)     — 0 unread, last: "Invoice approved"
//   Support Team  (support-team)  — 3 unread, last: "Ticket #4521 resolved"
//
// Requires the docker stack to be running: make docker
// The generic server runs on localhost:3003.

type WW = Window & { __whatsappInbox: { setActiveDevice(id: string): void } };

test.describe('Generic provider with custom endpoints', () => {
  let chatList: ConversationListPage;
  let thread: MessageThreadPage;

  test.beforeEach(async ({ page, request }) => {
    // Reset server-side in-memory state
    await request.post('http://localhost:3003/api/v2/GENERIC_CUSTOM/reset', {
      headers: { Authorization: 'Bearer generic-token-custom' },
    });

    chatList = new ConversationListPage(page);
    thread = new MessageThreadPage(page);
    await page.goto('/');
    await chatList.waitForLoaded();
    // Switch to the custom-endpoints generic device
    await page.evaluate(() => (window as unknown as WW).__whatsappInbox.setActiveDevice('mock-device-4'));
    // Wait for the custom channel's chats to appear
    await expect(chatList.chatItem('Emma Wilson')).toBeVisible({ timeout: 10000 });
  });

  // ── Chat list via custom GET /api/v2/{channelId}/conversations ──────────

  test('shows all chats from the custom-endpoints channel', async () => {
    await expect(chatList.chatItem('Emma Wilson')).toBeVisible();
    await expect(chatList.chatItem('David Kim')).toBeVisible();
    await expect(chatList.chatItem('Support Team')).toBeVisible();
  });

  test('shows correct unread badge counts', async () => {
    const emmaUnread = await chatList.getUnreadCount('Emma Wilson');
    expect(emmaUnread).toBe(1);

    const davidUnread = await chatList.getUnreadCount('David Kim');
    expect(davidUnread).toBe(0);

    const supportUnread = await chatList.getUnreadCount('Support Team');
    expect(supportUnread).toBe(3);
  });

  test('shows last message preview text', async () => {
    await expect(chatList.chatItem('Emma Wilson')).toContainText('Can you check the deployment?');
    await expect(chatList.chatItem('David Kim')).toContainText('Invoice approved');
    await expect(chatList.chatItem('Support Team')).toContainText('Ticket #4521 resolved');
  });

  // ── Message thread via custom GET /api/v2/{channelId}/conversations/{chatId}/history ──

  test('opens a conversation and shows messages', async () => {
    await chatList.clickChat('Emma Wilson');
    await thread.waitForLoaded();
    await expect(thread.root).toBeVisible();
    await expect(thread.bubbleWithText('Can you check the deployment?')).toBeVisible();
  });

  test('renders inbound and outbound bubbles correctly', async () => {
    await chatList.clickChat('Emma Wilson');
    await thread.waitForLoaded();
    // Fixture: 2 outbound, 2 inbound
    await expect(thread.outboundBubbles()).toHaveCount(2);
    await expect(thread.inboundBubbles()).toHaveCount(2);
  });

  test('shows messages for a different chat', async () => {
    await chatList.clickChat('David Kim');
    await thread.waitForLoaded();
    await expect(thread.bubbleWithText('Reviewing now')).toBeVisible();
    await expect(thread.bubbleWithText('Invoice approved')).toBeVisible();
  });

  // ── Sending via custom POST /api/v2/{channelId}/send/text ──────────────

  test('sends a text message via custom endpoint', async () => {
    await chatList.clickChat('Emma Wilson');
    await thread.waitForLoaded();
    await thread.sendMessage('Testing custom endpoints!');
    await expect(thread.bubbleWithText('Testing custom endpoints!')).toBeVisible();
  });

  test('sent message appears as outbound bubble', async () => {
    await chatList.clickChat('David Kim');
    await thread.waitForLoaded();
    await thread.sendMessage('Custom endpoint send');
    const bubble = thread.bubbleWithText('Custom endpoint send');
    await expect(bubble).toBeVisible();
    await expect(bubble).toHaveAttribute('data-direction', 'outbound');
  });

  // ── Switching between default and custom-endpoints devices ─────────────

  test('can switch from default generic device to custom-endpoints device', async ({ page }) => {
    // Start on default generic device (GENERIC1)
    await page.evaluate(() => (window as unknown as WW).__whatsappInbox.setActiveDevice('mock-device-3'));
    await expect(chatList.chatItem('Alice Martin')).toBeVisible({ timeout: 10000 });

    // Switch to custom-endpoints device (GENERIC_CUSTOM)
    await page.evaluate(() => (window as unknown as WW).__whatsappInbox.setActiveDevice('mock-device-4'));
    await expect(chatList.chatItem('Emma Wilson')).toBeVisible({ timeout: 10000 });

    // Verify GENERIC1 contacts are gone and GENERIC_CUSTOM contacts are shown
    await expect(chatList.chatItem('Alice Martin')).not.toBeVisible();
    await expect(chatList.chatItem('David Kim')).toBeVisible();
  });
});
