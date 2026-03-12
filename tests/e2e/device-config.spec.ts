import { test, expect } from '@playwright/test';
import { ConversationListPage } from './pages/conversation-list.page';
import { InstanceSelectorPage } from './pages/instance-selector.page';

// Requires the docker stack to be running: make docker
// Frontend: http://localhost:5173  →  Mock server: http://localhost:3002

test.describe('Device configuration', () => {
  let chatList: ConversationListPage;
  let selector: InstanceSelectorPage;

  test.beforeEach(async ({ page }) => {
    chatList = new ConversationListPage(page);
    selector = new InstanceSelectorPage(page);
    await page.goto('/');
    await chatList.waitForLoaded();
  });

  test('toggling auto-read does not change the selected device', async () => {
    // Read the currently selected device label
    const labelBefore = await selector.getSelectedDeviceLabel();

    // Open device list → click cog on "Mock WhatsApp 1" → toggle auto-read off
    await selector.openDeviceList();
    await selector.clickConfigure('Mock WhatsApp 1');
    await expect(selector.configPanel).toBeVisible();
    await expect(selector.autoReadToggle).toBeVisible();

    // Verify auto-read starts enabled (default)
    expect(await selector.isAutoReadEnabled()).toBe(true);

    // Toggle off
    await selector.toggleAutoRead();
    expect(await selector.isAutoReadEnabled()).toBe(false);

    // Wait a moment for any potential re-renders / state updates
    await expect(selector.configPanel).toBeVisible({ timeout: 3000 });

    // Close the modal by pressing Escape
    await selector.page.keyboard.press('Escape');

    // Assert the selected device hasn't changed
    await expect(async () => {
      const labelAfter = await selector.getSelectedDeviceLabel();
      expect(labelAfter).toBe(labelBefore);
    }).toPass({ timeout: 5000 });
  });

  test('toggling auto-read back on does not change the selected device', async () => {
    // Toggle off first
    await selector.openDeviceList();
    await selector.clickConfigure('Mock WhatsApp 1');
    await selector.toggleAutoRead();
    expect(await selector.isAutoReadEnabled()).toBe(false);
    await selector.page.keyboard.press('Escape');

    const labelBefore = await selector.getSelectedDeviceLabel();

    // Toggle on
    await selector.openDeviceList();
    await selector.clickConfigure('Mock WhatsApp 1');
    await selector.toggleAutoRead();
    expect(await selector.isAutoReadEnabled()).toBe(true);
    await selector.page.keyboard.press('Escape');

    // Assert the selected device hasn't changed
    await expect(async () => {
      const labelAfter = await selector.getSelectedDeviceLabel();
      expect(labelAfter).toBe(labelBefore);
    }).toPass({ timeout: 5000 });
  });
});
