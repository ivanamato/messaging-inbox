import { test, expect } from '@playwright/test';
import { ConversationListPage } from './pages/conversation-list.page';

test.describe('Device icon', () => {
  let chatList: ConversationListPage;

  test.beforeEach(async ({ page }) => {
    chatList = new ConversationListPage(page);
    await page.goto('/');
    await chatList.waitForLoaded();
  });

  test('shows the device icon next to the device name in the selector button', async ({ page }) => {
    const icon = page.locator('[data-testid="device-icon"]');
    await expect(icon).toBeVisible();
    await expect(icon).toHaveAttribute('src', /^data:image\/svg\+xml/);
  });

  test('shows device icons in the device picker modal', async ({ page }) => {
    // Open the device selector modal
    const selectorButton = page.locator('button', { has: page.locator('[data-testid="device-icon"]') });
    await selectorButton.click();

    // Should see icons for the devices that have them configured
    const optionIcons = page.locator('[data-testid="device-option-icon"]');
    await expect(optionIcons.first()).toBeVisible();
    const count = await optionIcons.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
