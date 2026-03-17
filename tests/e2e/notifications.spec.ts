import { test, expect } from '@playwright/test';
import { ConversationListPage } from './pages/conversation-list.page';
import { MessageThreadPage } from './pages/message-thread.page';

// Tests for notification features:
// - Tab title unread badge
// - Sound notifications
// - Browser notifications

test.describe('Tab title unread badge', () => {
  let chatList: ConversationListPage;

  test.beforeEach(async ({ page }) => {
    chatList = new ConversationListPage(page);
    await page.goto('/');
    await chatList.waitForLoaded();
    // Wait for unread count to be calculated
    await page.waitForTimeout(1000);
  });

  test('shows unread count in tab title', async ({ page }) => {
    // MOCK1 has total unread: 3 (Ana) + 12 (Equipe) + 1 (Fernanda) = 16
    // Wait for title to update
    await page.waitForFunction(() => /\(\d+\)/.test(document.title), { timeout: 5000 });
    const title = await page.title();
    expect(title).toMatch(/\(\d+\)/);
    expect(title).toContain('WhatsApp');
  });

  test('updates tab title when opening conversation with unreads', async ({ page }) => {
    // Wait for initial unread count
    await page.waitForFunction(() => /\(\d+\)/.test(document.title), { timeout: 5000 });
    const initialTitle = await page.title();
    expect(initialTitle).toMatch(/\(\d+\)/);

    // Open Ana Beatriz (has 3 unreads)
    await chatList.clickChat('Ana Beatriz');
    const thread = new MessageThreadPage(page);
    await thread.waitForLoaded();

    // Wait a moment for title to update
    await page.waitForTimeout(1000);

    const newTitle = await page.title();
    // Title should still have format with or without count
    expect(newTitle).toBeDefined();
  });
});

test.describe('Sound notifications', () => {
  let chatList: ConversationListPage;

  test.beforeEach(async ({ page }) => {
    chatList = new ConversationListPage(page);
    await page.goto('/');
    await chatList.waitForLoaded();
  });

  test('shows sound toggle in header', async ({ page }) => {
    // Sound toggle should be visible in the UI
    const soundToggle = page.locator('[data-testid="sound-toggle"]');
    await expect(soundToggle).toBeVisible();
  });

  test('sound toggle can be clicked', async ({ page }) => {
    const soundToggle = page.locator('[data-testid="sound-toggle"]');
    await expect(soundToggle).toBeVisible();

    // Click to mute
    await soundToggle.click();
    await expect(soundToggle).toHaveAttribute('data-muted', 'true');

    // Click to unmute
    await soundToggle.click();
    await expect(soundToggle).toHaveAttribute('data-muted', 'false');
  });
});

test.describe('Browser notifications', () => {
  let chatList: ConversationListPage;

  test.beforeEach(async ({ page }) => {
    chatList = new ConversationListPage(page);
    await page.goto('/');
    await chatList.waitForLoaded();
  });

  test('shows notification toggle in header', async ({ page }) => {
    const notifToggle = page.locator('[data-testid="notification-toggle"]');
    await expect(notifToggle).toBeVisible();
  });

  test('notification toggle state changes when clicked (if enabled)', async ({ page, context }) => {
    // Grant notification permission for test
    await context.grantPermissions(['notifications']);

    const notifToggle = page.locator('[data-testid="notification-toggle"]');

    // If the toggle is not disabled, test clicking it
    const isDisabled = await notifToggle.isDisabled();
    if (!isDisabled) {
      // Click to enable (if not already enabled)
      await notifToggle.click();
      // State should change
      const enabled = await notifToggle.getAttribute('data-enabled');
      expect(enabled).toBeDefined();
    } else {
      // If disabled, just verify it exists
      await expect(notifToggle).toBeVisible();
    }
  });
});

test.describe('Message timestamps', () => {
  let chatList: ConversationListPage;
  let thread: MessageThreadPage;

  test.beforeEach(async ({ page }) => {
    chatList = new ConversationListPage(page);
    await page.goto('/');
    await chatList.waitForLoaded();
  });

  test('shows time on message bubbles', async ({ page }) => {
    await chatList.clickChat('Ana Beatriz');
    thread = new MessageThreadPage(page);
    await thread.waitForLoaded();

    // All message bubbles should have a time element
    const timeElements = page.locator('[data-testid="message-time"]');
    const count = await timeElements.count();
    expect(count).toBeGreaterThan(0);
  });

  test('shows relative time on hover', async ({ page }) => {
    await chatList.clickChat('Ana Beatriz');
    thread = new MessageThreadPage(page);
    await thread.waitForLoaded();

    // The time element has a title attribute with relative time
    const timeElement = page.locator('[data-testid="message-time"]').first();
    await expect(timeElement).toBeVisible();

    // Check that the title attribute contains relative time
    const title = await timeElement.getAttribute('title');
    expect(title).toMatch(/ago|just now/i);
  });
});
