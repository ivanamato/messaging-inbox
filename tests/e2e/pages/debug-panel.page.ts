import type { Page, Locator } from '@playwright/test';

export class DebugPanelPage {
  readonly toggle: Locator;
  readonly panel: Locator;
  readonly exportButton: Locator;

  constructor(private page: Page) {
    this.toggle = page.locator('[data-testid="debug-toggle"]');
    this.panel = page.locator('[data-testid="debug-panel"]');
    this.exportButton = page.locator('[data-testid="debug-export"]');
  }

  async open() {
    await this.toggle.click();
    await this.panel.waitFor({ state: 'visible', timeout: 5000 });
  }

  async close() {
    await this.toggle.click();
    await this.panel.waitFor({ state: 'hidden', timeout: 5000 });
  }

  tab(name: string): Locator {
    return this.page.locator(`[data-testid="debug-tab-${name}"]`);
  }

  async selectTab(name: string) {
    await this.tab(name).click();
  }

  /** All visible request rows in the request logger. */
  requestRows(): Locator {
    return this.panel.locator('[data-testid="debug-request-row"]');
  }

  /** Wait until at least one request appears in the logger. */
  async waitForRequests() {
    await this.requestRows().first().waitFor({ state: 'visible', timeout: 10000 });
  }

  /** Device cards in the health section. */
  deviceCards(): Locator {
    return this.panel.locator('[data-testid="debug-device-card"]');
  }

  /** Timeline events. */
  timelineEvents(): Locator {
    return this.panel.locator('[data-testid="debug-timeline-event"]');
  }

  /** Validation issues. */
  validationIssues(): Locator {
    return this.panel.locator('[data-testid="debug-validation-issue"]');
  }

  /** The validation section container. */
  validationSection(): Locator {
    return this.panel.locator('[data-testid="debug-validation-section"]');
  }

  /** The comparison section container. */
  comparisonSection(): Locator {
    return this.panel.locator('[data-testid="debug-comparison-section"]');
  }

  /** Request filter input. */
  requestFilter(): Locator {
    return this.panel.locator('[data-testid="debug-request-filter"]');
  }
}
