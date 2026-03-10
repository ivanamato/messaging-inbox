import { test, expect } from '@playwright/test';
import { ConversationListPage } from './pages/conversation-list.page';
import { MessageThreadPage } from './pages/message-thread.page';

// Requires the docker stack to be running: make docker
// Frontend: http://localhost:5173  →  Mock server: http://localhost:3002
//
// Fixture data comes from mock-server/fixtures.ts (MOCK1 instance)

test.describe('Message thread', () => {
  let chatList: ConversationListPage;
  let thread: MessageThreadPage;

  test.beforeEach(async ({ page, request }) => {
    await request.post('http://localhost:3002/test/reset/MOCK1', {
      headers: { apikey: 'mock-token-123' },
    });
    chatList = new ConversationListPage(page);
    thread = new MessageThreadPage(page);
    await page.goto('/');
    await chatList.waitForLoaded();
  });

  test('opens message thread when clicking a chat', async () => {
    await chatList.clickChat('Ana Beatriz');
    await thread.waitForLoaded();

    await expect(thread.root).toBeVisible();
  });

  test('renders inbound and outbound message bubbles', async () => {
    await chatList.clickChat('Ana Beatriz');
    await thread.waitForLoaded();

    await expect(thread.inboundBubbles().first()).toBeVisible();
    await expect(thread.outboundBubbles().first()).toBeVisible();
  });

  test('sends a text message and shows it optimistically', async () => {
    await chatList.clickChat('Ana Beatriz');
    await thread.waitForLoaded();

    const testMessage = `Hello from e2e test ${Date.now()}`;
    await thread.sendMessage(testMessage);

    // Message should appear immediately (optimistic send)
    await expect(thread.bubbleWithText(testMessage)).toBeVisible({ timeout: 5000 });
  });

  test('message input is cleared after sending', async () => {
    await chatList.clickChat('Ana Beatriz');
    await thread.waitForLoaded();

    await thread.sendMessage('Test message');

    await expect(thread.messageInput).toHaveValue('');
  });

  test('renders group chat with sender names', async () => {
    await chatList.clickChat('Equipe Vendas 🚀');
    await thread.waitForLoaded();

    // Group messages include participant sender names above bubbles
    // MOCK1 group has participants: Marcos Silva, Juliana Costa, Pedro Alves
    const hasSenderName = await thread.root
      .locator('p:has-text("Marcos Silva"), p:has-text("Juliana Costa"), p:has-text("Pedro Alves")')
      .first()
      .isVisible();

    expect(hasSenderName).toBe(true);
  });

  test('Ctrl+Enter inserts a newline without sending', async () => {
    await chatList.clickChat('Ana Beatriz');
    await thread.waitForLoaded();

    await thread.messageInput.fill('Hello');
    await thread.messageInput.press('Control+Enter');

    // Value should now contain a newline
    await expect(thread.messageInput).toHaveValue('Hello\n');
    // Input still has content — message was NOT sent (not cleared)
    await expect(thread.messageInput).not.toHaveValue('');
  });

  test('Meta+Enter inserts a newline without sending (Mac Cmd+Enter)', async () => {
    await chatList.clickChat('Ana Beatriz');
    await thread.waitForLoaded();

    await thread.messageInput.fill('World');
    await thread.messageInput.press('Meta+Enter');

    await expect(thread.messageInput).toHaveValue('World\n');
    await expect(thread.messageInput).not.toHaveValue('');
  });

  test('renders a document message attachment', async () => {
    // Ana Beatriz has a documentMessage with caption 'Relatório do mês' in MOCK1 fixtures
    await chatList.clickChat('Ana Beatriz');
    await thread.waitForLoaded();

    // The caption is always rendered as text in the bubble regardless of media load state
    await expect(thread.bubbleWithText('Relatório do mês')).toBeVisible({ timeout: 10000 });
  });
});
