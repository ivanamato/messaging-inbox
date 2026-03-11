import { test, expect } from '@playwright/test';
import { ConversationListPage } from './pages/conversation-list.page';
import { DebugPanelPage } from './pages/debug-panel.page';

// Requires the docker stack: make docker
// Navigate with ?debug to enable the debug panel

test.describe('WebSocket controls in debug panel', () => {
  let chatList: ConversationListPage;
  let debug: DebugPanelPage;

  test.beforeEach(async ({ page }) => {
    chatList = new ConversationListPage(page);
    debug = new DebugPanelPage(page);
    await page.goto('/');
    await chatList.waitForLoaded();
  });

  test('device health cards show WebSocket connection status', async () => {
    await debug.open();
    await debug.selectTab('health');

    const cards = debug.deviceCards();
    const firstCard = cards.first();

    // Should display a WS status indicator
    const wsStatus = firstCard.locator('[data-testid="debug-ws-status"]');
    await expect(wsStatus).toBeVisible();

    // Status should be one of the known states
    const state = await wsStatus.getAttribute('data-ws-state');
    expect(['connected', 'connecting', 'disconnected', 'reconnecting']).toContain(state);
  });

  test('device health cards show WebSocket toggle', async () => {
    await debug.open();
    await debug.selectTab('health');

    const cards = debug.deviceCards();
    const firstCard = cards.first();

    // Should have a WS toggle button
    const wsToggle = firstCard.locator('[data-testid="debug-ws-toggle"]');
    await expect(wsToggle).toBeVisible();
  });

  test('toggling WebSocket off disconnects and shows disconnected state', async ({ page }) => {
    await debug.open();
    await debug.selectTab('health');

    const firstCard = debug.deviceCards().first();
    const wsToggle = firstCard.locator('[data-testid="debug-ws-toggle"]');
    const wsStatus = firstCard.locator('[data-testid="debug-ws-status"]');

    // Wait for WS to connect first
    await expect(wsStatus).toHaveAttribute('data-ws-state', 'connected', { timeout: 10000 });

    // Toggle off
    await wsToggle.click();

    // Should show disconnected state
    await expect(wsStatus).toHaveAttribute('data-ws-state', 'disconnected', { timeout: 5000 });
  });

  test('toggling WebSocket back on reconnects', async ({ page }) => {
    await debug.open();
    await debug.selectTab('health');

    const firstCard = debug.deviceCards().first();
    const wsToggle = firstCard.locator('[data-testid="debug-ws-toggle"]');
    const wsStatus = firstCard.locator('[data-testid="debug-ws-status"]');

    // Wait for initial connection
    await expect(wsStatus).toHaveAttribute('data-ws-state', 'connected', { timeout: 10000 });

    // Toggle off then on
    await wsToggle.click();
    await expect(wsStatus).toHaveAttribute('data-ws-state', 'disconnected', { timeout: 5000 });

    await wsToggle.click();
    await expect(wsStatus).toHaveAttribute('data-ws-state', 'connected', { timeout: 10000 });
  });

  test('disabling WebSocket causes polling to resume (requests appear)', async ({ page }) => {
    await debug.open();
    await debug.selectTab('health');

    const firstCard = debug.deviceCards().first();
    const wsToggle = firstCard.locator('[data-testid="debug-ws-toggle"]');
    const wsStatus = firstCard.locator('[data-testid="debug-ws-status"]');

    // Wait for WS connected
    await expect(wsStatus).toHaveAttribute('data-ws-state', 'connected', { timeout: 10000 });

    // Switch to requests tab and note current count
    await debug.selectTab('requests');
    await debug.waitForRequests();
    const countBefore = await debug.requestRows().count();

    // Disable WS (switch to health, toggle, switch back to requests)
    await debug.selectTab('health');
    await wsToggle.click();
    await expect(wsStatus).toHaveAttribute('data-ws-state', 'disconnected', { timeout: 5000 });

    // Wait for polling to generate new requests
    await debug.selectTab('requests');
    await page.waitForTimeout(12000); // polling interval is 10s for chats

    const countAfter = await debug.requestRows().count();
    expect(countAfter).toBeGreaterThan(countBefore);
  });

  test('device health card shows realtime mode indicator', async () => {
    await debug.open();
    await debug.selectTab('health');

    const firstCard = debug.deviceCards().first();

    // Should show whether the device is in WebSocket or Polling mode
    const modeIndicator = firstCard.locator('[data-testid="debug-realtime-mode"]');
    await expect(modeIndicator).toBeVisible();
  });
});
