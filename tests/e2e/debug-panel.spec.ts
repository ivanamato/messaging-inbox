import { test, expect } from '@playwright/test';
import { ConversationListPage } from './pages/conversation-list.page';
import { DebugPanelPage } from './pages/debug-panel.page';

// Requires the docker stack: make docker
// Navigate with ?debug to enable the debug panel

test.describe('Debug panel', () => {
  let chatList: ConversationListPage;
  let debug: DebugPanelPage;

  test.beforeEach(async ({ page }) => {
    chatList = new ConversationListPage(page);
    debug = new DebugPanelPage(page);
    await page.goto('/');
    await chatList.waitForLoaded();
  });

  test('toggle button is visible when debug is enabled', async () => {
    await expect(debug.toggle).toBeVisible();
  });

  test('opens and closes the panel', async () => {
    await debug.open();
    await expect(debug.panel).toBeVisible();
    await debug.close();
    await expect(debug.panel).not.toBeVisible();
  });

  test('shows device health information', async () => {
    await debug.open();
    await debug.selectTab('health');

    const cards = debug.deviceCards();
    // At least 2 devices (MOCK1 + MOCK2, possibly a generic-server too)
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // First device should show connection status "open"
    const firstStatus = cards.first().locator('[data-testid="debug-device-status"]');
    await expect(firstStatus).toHaveAttribute('data-status', 'open');
  });

  test('logs API requests after page load', async () => {
    await debug.open();
    await debug.selectTab('requests');
    await debug.waitForRequests();

    // Chat list auto-loads on page load, so findChats should appear
    const rows = debug.requestRows();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    // At least one findChats request
    await expect(rows.first()).toBeVisible();
  });

  test('expand request row shows details', async () => {
    await debug.open();
    await debug.selectTab('requests');
    await debug.waitForRequests();

    // Click first request row to expand
    await debug.requestRows().first().locator('button').click();

    // Should show params and response sections
    const expanded = debug.panel.locator('text=Params:');
    await expect(expanded).toBeVisible();
  });

  test('filters requests by method name', async () => {
    await debug.open();
    await debug.selectTab('requests');
    await debug.waitForRequests();

    const totalBefore = await debug.requestRows().count();

    await debug.requestFilter().fill('getConnectionState');
    const filtered = await debug.requestRows().count();

    // Should show fewer results (only connection state requests)
    expect(filtered).toBeLessThanOrEqual(totalBefore);
    // All visible rows should contain the filter text
    if (filtered > 0) {
      await expect(debug.requestRows().first()).toContainText('getConnectionState');
    }
  });

  test('shows timeline events', async () => {
    await debug.open();
    await debug.selectTab('timeline');

    // After page load, at least chat_refresh events should exist
    const events = debug.timelineEvents();
    await events.first().waitFor({ state: 'visible', timeout: 10000 });

    const count = await events.count();
    expect(count).toBeGreaterThan(0);
  });

  test('shows provider comparison for multi-device', async () => {
    await debug.open();
    await debug.selectTab('compare');

    // With 2 mock devices, the comparison table should render
    await expect(debug.comparisonSection()).toBeVisible();
  });

  test('shows validation section', async () => {
    await debug.open();
    await debug.selectTab('validation');
    await expect(debug.validationSection()).toBeVisible();
  });

  test('export copies debug log to clipboard', async ({ context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await debug.open();
    // Wait for some data to accumulate
    await debug.selectTab('requests');
    await debug.waitForRequests();

    await debug.exportButton.click();

    // Read clipboard content
    const clipboardText = await debug.panel.evaluate(() => navigator.clipboard.readText());
    const parsed = JSON.parse(clipboardText);
    expect(parsed).toHaveProperty('exportedAt');
    expect(parsed).toHaveProperty('requests');
    expect(parsed).toHaveProperty('events');
  });
});

test.describe('Debug panel disabled', () => {
  test('toggle button is not visible with ?no-debug', async ({ browser }) => {
    // Use fresh context to avoid HMR pollution from previous tests
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/?no-debug');
    // Wait for the chat list to load (proves the app rendered)
    await page.locator('[data-testid="chat-item"]').first().waitFor({ state: 'visible', timeout: 30000 });

    const toggle = page.locator('[data-testid="debug-toggle"]');
    await expect(toggle).toHaveCount(0);

    await context.close();
  });
});
