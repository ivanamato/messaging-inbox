import { type Page, type Locator } from '@playwright/test';

export class InstanceSelectorPage {
  readonly page: Page;
  readonly devicePicker: Locator;
  readonly configPanel: Locator;
  readonly autoReadToggle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.devicePicker = page.locator('[data-testid="device-picker"]');
    this.configPanel = page.locator('[data-testid="device-config-panel"]');
    this.autoReadToggle = page.locator('[data-testid="auto-read-toggle"]');
  }

  /** Returns the visible label of the currently selected device. */
  async getSelectedDeviceLabel(): Promise<string> {
    return (await this.devicePicker.innerText()).trim();
  }

  /** Click the device picker to open the device list modal. */
  async openDeviceList() {
    await this.devicePicker.click();
  }

  /** Click the configure (cog) button for a device by its label text. */
  async clickConfigure(deviceLabel: string) {
    const row = this.page.locator('[data-testid="device-configure"]')
      .locator('..')
      .filter({ hasText: deviceLabel });
    await row.locator('[data-testid="device-configure"]').click();
  }

  /** Toggle the auto-read switch. */
  async toggleAutoRead() {
    await this.autoReadToggle.click();
  }

  /** Returns whether the auto-read toggle is checked. */
  async isAutoReadEnabled(): Promise<boolean> {
    return (await this.autoReadToggle.getAttribute('aria-checked')) === 'true';
  }
}
