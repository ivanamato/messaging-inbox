import { test, expect } from '@playwright/test';
import { ConversationListPage } from './pages/conversation-list.page';
import { MessageThreadPage } from './pages/message-thread.page';

test.describe('Voice message recording', () => {
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

  test('mic button visible when input is empty', async () => {
    await expect(thread.micButton).toBeVisible();
    await expect(thread.sendButton).not.toBeVisible();
  });

  test('mic button replaced by send button when typing', async () => {
    await thread.typeMessage('hello');
    await expect(thread.sendButton).toBeVisible();
    await expect(thread.micButton).not.toBeVisible();

    await thread.messageInput.clear();
    await expect(thread.micButton).toBeVisible();
    await expect(thread.sendButton).not.toBeVisible();
  });

  test('recording starts when mic is clicked', async () => {
    await thread.startRecording();
    await expect(thread.recordingIndicator).toBeVisible();
    await expect(thread.cancelRecordingButton).toBeVisible();
    await expect(thread.stopRecordingButton).toBeVisible();
  });

  test('canceling recording discards it', async () => {
    const initialBubbleCount = await thread.outboundBubbles().count();
    await thread.startRecording();
    await thread.cancelRecording();
    await expect(thread.recordingIndicator).not.toBeVisible();
    await expect(thread.micButton).toBeVisible();
    await expect(thread.outboundBubbles()).toHaveCount(initialBubbleCount);
  });

  test('stopping recording sends audio message', async () => {
    await thread.startRecording();
    // Give the fake codec a moment to produce data
    await thread.stopRecordingButton.waitFor({ state: 'visible' });
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await new Promise(r => setTimeout(r, 500));
    await thread.stopRecording();

    // Wait for an outbound audio player to appear
    const outboundAudioPlayer = thread.outboundBubbles().locator('[data-testid="audio-player"]');
    await expect(outboundAudioPlayer).toBeVisible({ timeout: 15000 });
  });
});
