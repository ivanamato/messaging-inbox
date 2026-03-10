import { test, expect } from '@playwright/test';
import { ConversationListPage } from './pages/conversation-list.page';
import { MessageThreadPage } from './pages/message-thread.page';

test.describe('Image paste', () => {
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
    await chatList.clickChat('Ana Beatriz');
    await thread.waitForLoaded();
  });

  test('pasting an image opens the paste modal with preview', async () => {
    await thread.pasteImage();

    await expect(thread.imagePasteModal).toBeVisible({ timeout: 5000 });
    await expect(thread.imagePastePreview).toBeVisible();
    await expect(thread.imagePasteCaption).toBeVisible();
    await expect(thread.imagePasteSend).toBeVisible();
    await expect(thread.imagePasteCancel).toBeVisible();
  });

  test('canceling the paste modal dismisses it without sending', async () => {
    const initialCount = await thread.outboundBubbles().count();

    await thread.pasteImage();
    await expect(thread.imagePasteModal).toBeVisible({ timeout: 5000 });

    await thread.imagePasteCancel.click();
    await expect(thread.imagePasteModal).not.toBeVisible();
    // No new bubble added
    await expect(thread.outboundBubbles()).toHaveCount(initialCount);
  });

  test('sending pasted image without caption creates an outbound media bubble', async () => {
    await thread.pasteImage();
    await expect(thread.imagePasteModal).toBeVisible({ timeout: 5000 });

    await thread.imagePasteSend.click();
    await expect(thread.imagePasteModal).not.toBeVisible();

    // An outbound bubble should appear (optimistic)
    await expect(thread.outboundBubbles().last()).toBeVisible({ timeout: 10000 });
  });

  test('sending pasted image with caption sends image and includes caption text', async () => {
    const caption = `E2E paste caption ${Date.now()}`;

    await thread.pasteImage();
    await expect(thread.imagePasteModal).toBeVisible({ timeout: 5000 });

    await thread.imagePasteCaption.fill(caption);
    await thread.imagePasteSend.click();
    await expect(thread.imagePasteModal).not.toBeVisible();

    // The bubble with the caption text should appear
    await expect(thread.bubbleWithText(caption)).toBeVisible({ timeout: 10000 });
  });

  test('pressing Enter in caption field sends the image', async () => {
    await thread.pasteImage();
    await expect(thread.imagePasteModal).toBeVisible({ timeout: 5000 });

    await thread.imagePasteCaption.fill('Enter to send test');
    await thread.imagePasteCaption.press('Enter');
    await expect(thread.imagePasteModal).not.toBeVisible();
  });

  test('pressing Escape cancels the paste modal', async () => {
    await thread.pasteImage();
    await expect(thread.imagePasteModal).toBeVisible({ timeout: 5000 });

    await thread.imagePasteCaption.press('Escape');
    await expect(thread.imagePasteModal).not.toBeVisible();
  });
});
