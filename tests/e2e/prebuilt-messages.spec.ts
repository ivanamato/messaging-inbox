import { test, expect } from '@playwright/test';
import { ConversationListPage } from './pages/conversation-list.page';
import { MessageThreadPage } from './pages/message-thread.page';

// Mock device 1 has 6 prebuilt messages:
//   3 text (greeting, followup, closing)
//   1 audio (voice-greeting)
//   1 image (promo-image)
//   1 video (product-video)
// Mock device 2 has no prebuilt messages.
// See devices.json for the fixture data.

test.describe('Pre-built messages', () => {
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
    await chatList.clickChat('Ana Beatriz'); // mock-device-1
    await thread.waitForLoaded();
  });

  test('button is visible when prebuilt messages are configured', async () => {
    await expect(thread.prebuiltMessagesButton).toBeVisible();
  });

  test('clicking button opens the dialog', async () => {
    await thread.openPrebuiltMessages();
    await expect(thread.prebuiltMessagesDialog).toBeVisible();
  });

  test('dialog shows all configured prebuilt messages', async () => {
    await thread.openPrebuiltMessages();
    await expect(thread.prebuiltMessagesDialog).toBeVisible();

    // 3 text + 1 audio + 1 image + 1 video from devices.json mock-device-1
    await expect(thread.prebuiltMessageItem('greeting')).toBeVisible();
    await expect(thread.prebuiltMessageItem('followup')).toBeVisible();
    await expect(thread.prebuiltMessageItem('closing')).toBeVisible();
    await expect(thread.prebuiltMessageItem('voice-greeting')).toBeVisible();
    await expect(thread.prebuiltMessageItem('promo-image')).toBeVisible();
    await expect(thread.prebuiltMessageItem('product-video')).toBeVisible();
    await expect(thread.allPrebuiltMessageItems()).toHaveCount(6);
  });

  test('selecting a prebuilt message fills the input and closes the dialog', async () => {
    await thread.openPrebuiltMessages();
    await expect(thread.prebuiltMessagesDialog).toBeVisible();

    await thread.prebuiltMessageItem('greeting').click();

    await expect(thread.prebuiltMessagesDialog).not.toBeVisible();
    await expect(thread.messageInput).toHaveValue('Hello! How can I help you today?');
  });

  test('selecting a different message also works', async () => {
    await thread.openPrebuiltMessages();
    await thread.prebuiltMessageItem('closing').click();

    await expect(thread.messageInput).toHaveValue('Thank you for your time! Have a great day.');
  });

  test('dialog can be dismissed without selecting a message', async () => {
    await thread.openPrebuiltMessages();
    await expect(thread.prebuiltMessagesDialog).toBeVisible();

    await thread.page.keyboard.press('Escape');
    await expect(thread.prebuiltMessagesDialog).not.toBeVisible();
    await expect(thread.messageInput).toHaveValue('');
  });

  test('search filters the visible messages', async () => {
    await thread.openPrebuiltMessages();
    await expect(thread.prebuiltMessagesDialog).toBeVisible();

    const searchInput = thread.page.locator('[data-testid="prebuilt-messages-search"]');
    await searchInput.fill('Greeting');

    await expect(thread.prebuiltMessageItem('greeting')).toBeVisible();
    await expect(thread.prebuiltMessageItem('followup')).not.toBeVisible();
    await expect(thread.prebuiltMessageItem('closing')).not.toBeVisible();
  });

  test('audio prebuilt message shows type indicator and "Voice message" subtext', async () => {
    await thread.openPrebuiltMessages();
    await expect(thread.prebuiltMessagesDialog).toBeVisible();

    const audioItem = thread.prebuiltMessageItem('voice-greeting');
    await expect(audioItem).toBeVisible();
    // data-message-type attribute distinguishes audio from text
    await expect(audioItem).toHaveAttribute('data-message-type', 'audio');
    // Shows "Voice message" instead of base64 content
    await expect(audioItem).toContainText('Voice message');
    await expect(audioItem).toContainText('Voice Greeting');
  });

  test('text items have data-message-type="text"', async () => {
    await thread.openPrebuiltMessages();
    await expect(thread.prebuiltMessageItem('greeting')).toHaveAttribute('data-message-type', 'text');
  });

  test('audio item shows a playable audio player', async () => {
    await thread.openPrebuiltMessages();
    const player = thread.page.locator('[data-testid="prebuilt-audio-player"]');
    await expect(player).toBeVisible();
    // Must have controls attribute so the user can play before sending
    await expect(player).toHaveAttribute('controls', '');
    // src must be a data URL with the audio content
    const src = await player.getAttribute('src');
    expect(src).toMatch(/^data:audio\//);
  });

  test('audio item has an explicit Send button', async () => {
    await thread.openPrebuiltMessages();
    const sendBtn = thread.page.locator('[data-testid="prebuilt-audio-send"]');
    await expect(sendBtn).toBeVisible();
  });

  test('selecting an audio prebuilt message sends an outbound audio bubble without changing the input', async () => {
    const initialBubbleCount = await thread.outboundBubbles().count();

    await thread.openPrebuiltMessages();
    // Click the explicit Send button (not the row — the audio player captures row clicks)
    await thread.page.locator('[data-testid="prebuilt-audio-send"]').click();

    await expect(thread.prebuiltMessagesDialog).not.toBeVisible();
    await expect(thread.messageInput).toHaveValue('');
    await expect(thread.outboundBubbles()).toHaveCount(initialBubbleCount + 1, { timeout: 10000 });
  });

  test('audio search only matches on label, not on base64 content', async () => {
    await thread.openPrebuiltMessages();
    const searchInput = thread.page.locator('[data-testid="prebuilt-messages-search"]');

    // Searching "Voice" should match the audio item by label
    await searchInput.fill('Voice');
    await expect(thread.prebuiltMessageItem('voice-greeting')).toBeVisible();

    // Base64 content should not match other searches
    await searchInput.fill('T2dn');
    await expect(thread.prebuiltMessageItem('voice-greeting')).not.toBeVisible();
  });

  test('image prebuilt message shows a thumbnail preview', async () => {
    await thread.openPrebuiltMessages();

    const imageItem = thread.prebuiltMessageItem('promo-image');
    await expect(imageItem).toBeVisible();
    await expect(imageItem).toHaveAttribute('data-message-type', 'image');
    await expect(imageItem).toContainText('Promo Image');

    // Thumbnail must render with a data URL src
    const preview = imageItem.locator('[data-testid="prebuilt-image-preview"]');
    await expect(preview).toBeVisible();
    const src = await preview.getAttribute('src');
    expect(src).toMatch(/^data:image\//);
  });

  test('video prebuilt message shows a video thumbnail', async () => {
    await thread.openPrebuiltMessages();

    const videoItem = thread.prebuiltMessageItem('product-video');
    await expect(videoItem).toBeVisible();
    await expect(videoItem).toHaveAttribute('data-message-type', 'video');
    await expect(videoItem).toContainText('Product Video');

    const preview = videoItem.locator('[data-testid="prebuilt-video-preview"]');
    await expect(preview).toBeVisible();
    const src = await preview.getAttribute('src');
    expect(src).toMatch(/^data:video\//);
  });

  test('selecting an image prebuilt message sends an outbound bubble without changing the input', async () => {
    const initialBubbleCount = await thread.outboundBubbles().count();

    await thread.openPrebuiltMessages();
    await thread.prebuiltMessageItem('promo-image').click();

    await expect(thread.prebuiltMessagesDialog).not.toBeVisible();
    await expect(thread.messageInput).toHaveValue('');
    await expect(thread.outboundBubbles()).toHaveCount(initialBubbleCount + 1, { timeout: 10000 });
  });

  test('selecting a video prebuilt message sends an outbound bubble without changing the input', async () => {
    const initialBubbleCount = await thread.outboundBubbles().count();

    await thread.openPrebuiltMessages();
    await thread.prebuiltMessageItem('product-video').click();

    await expect(thread.prebuiltMessagesDialog).not.toBeVisible();
    await expect(thread.messageInput).toHaveValue('');
    await expect(thread.outboundBubbles()).toHaveCount(initialBubbleCount + 1, { timeout: 10000 });
  });

  test('media items are not matched by base64 search', async () => {
    await thread.openPrebuiltMessages();
    const searchInput = thread.page.locator('[data-testid="prebuilt-messages-search"]');

    // PNG base64 header — should NOT match the image item
    await searchInput.fill('iVBOR');
    await expect(thread.prebuiltMessageItem('promo-image')).not.toBeVisible();

    // MP4 base64 header — should NOT match the video item
    await searchInput.fill('AAAAHG');
    await expect(thread.prebuiltMessageItem('product-video')).not.toBeVisible();
  });
});
