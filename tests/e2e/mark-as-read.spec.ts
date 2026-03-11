import { test, expect } from '@playwright/test';
import { ConversationListPage } from './pages/conversation-list.page';
import { MessageThreadPage } from './pages/message-thread.page';

// Requires the docker stack to be running: make docker
// Frontend: http://localhost:5173  →  Mock server: http://localhost:3002

test.describe('Mark chat as read', () => {
  let chatList: ConversationListPage;
  let thread: MessageThreadPage;

  test.beforeEach(async ({ page, request }) => {
    // Reset MOCK1 state so unread counts are fresh from fixtures
    await request.post('http://localhost:3002/test/reset/MOCK1', {
      headers: { apikey: 'mock-token-123' },
    });
    chatList = new ConversationListPage(page);
    thread = new MessageThreadPage(page);
    await page.goto('/');
    await chatList.waitForLoaded();
  });

  test('unread badge clears after opening chat', async ({ page }) => {
    // Ana Beatriz has unreadCount: 3 in fixtures
    await expect(async () => {
      const count = await chatList.getUnreadCount('Ana Beatriz');
      expect(count).toBe(3);
    }).toPass({ timeout: 5000 });

    // Click the chat to open it — triggers markChatAsRead
    await chatList.clickChat('Ana Beatriz');
    await thread.waitForLoaded();

    // Click another chat to go back to the list and trigger a chat list refresh
    await chatList.clickChat('Roberto Mendes');
    await thread.waitForLoaded();

    // Assert unread badge is gone for Ana Beatriz
    await expect(async () => {
      const count = await chatList.getUnreadCount('Ana Beatriz');
      expect(count).toBe(0);
    }).toPass({ timeout: 10000 });
  });

  test('chat with zero unreads stays at zero', async () => {
    // Roberto Mendes has unreadCount: 0 in fixtures
    const countBefore = await chatList.getUnreadCount('Roberto Mendes');
    expect(countBefore).toBe(0);

    await chatList.clickChat('Roberto Mendes');
    await thread.waitForLoaded();

    // Go back to another chat
    await chatList.clickChat('Ana Beatriz');
    await thread.waitForLoaded();

    // Roberto Mendes should still have 0
    const countAfter = await chatList.getUnreadCount('Roberto Mendes');
    expect(countAfter).toBe(0);
  });
});
