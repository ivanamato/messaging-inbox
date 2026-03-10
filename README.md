# WhatsApp Inbox

Embeddable WhatsApp inbox UI library. Framework-agnostic — works with Vue, React, Angular, or plain HTML. Connects directly to the [Evolution API](https://doc.evolution-api.com/) from the browser.

Built with [Preact](https://preactjs.com/) + [Tailwind CSS v4](https://tailwindcss.com/). No backend required.

## Features

- **Real-time messaging** — Auto-polling keeps conversations and messages updated
- **Multi-device** — Switch between multiple WhatsApp instances via a device selector
- **Imperative API** — Open conversations, pre-fill the composer, switch devices, send messages, and fetch data from outside the inbox
- **Conversation pre-selection & pre-fill** — Open a specific conversation programmatically with an optional draft message — ideal for CRM "reply to customer" flows
- **Pre-built messages** — Per-device library of reusable text templates and audio PTT voice notes, selectable from a searchable picker in the composer
- **Custom chat actions** — Configurable action buttons per chat row driven by the host app
- **Chat tags & filtering** — Colored tag pills on each chat, resolved by the host app, with clickable filter chips to narrow the list
- **Template messages** — Send WhatsApp-approved templates with header, body, and button parameters
- **Interactive messages** — Button messages with up to 3 custom actions
- **Media support** — Send and receive images, videos, audio, and documents
- **Voice recording** — Record and send PTT voice messages directly from the composer
- **Image paste** — Paste an image from the clipboard to send it with an optional caption
- **Message forwarding** — Forward messages between conversations
- **Context menu** — Right-click actions (delete, forward) on messages
- **Read-only mode** — View-only access per device
- **CSS isolation** — All styles use the `wa:` prefix to avoid collisions with host apps

## Installation

Published to [npm](https://www.npmjs.com/package/@ivanamato/whatsapp-inbox) as `@ivanamato/whatsapp-inbox`.

```bash
npm install @ivanamato/whatsapp-inbox
```

## Quick Start

### Using the UMD bundle (any framework or plain HTML)

```html
<link rel="stylesheet" href="whatsapp-inbox.css" />
<script src="whatsapp-inbox.umd.js"></script>

<div id="inbox" style="height: 100vh;"></div>

<script>
  const inbox = WhatsAppInbox.mount(document.getElementById('inbox'), {
    devices: [
      {
        id: 'main',
        label: 'My WhatsApp',
        apiUrl: 'https://your-evolution-api.com',
        instanceToken: 'your-instance-token',
        instanceName: 'your-instance',
      },
    ],
  });

  // Later: inbox.unmount();
</script>
```

### Using the ES module

```js
import { mount } from '@ivanamato/whatsapp-inbox';
import '@ivanamato/whatsapp-inbox/style.css';

const inbox = mount(document.getElementById('inbox'), {
  devices: [
    {
      id: 'main',
      label: 'My WhatsApp',
      apiUrl: 'https://your-evolution-api.com',
      instanceToken: 'your-instance-token',
      instanceName: 'your-instance',
    },
  ],
});
```

---

## Documentation

### `mount(element, config)`

Mounts the inbox into a DOM element and returns a [`WhatsAppInbox`](#imperative-api--whatsappinbox) handle.

```ts
function mount(element: HTMLElement, config: WhatsAppMultiDeviceConfig): WhatsAppInbox
function unmount(element: HTMLElement): void
```

---

### `config.devices` — Device configuration

The `devices` array is the only required field. Each entry represents one WhatsApp instance.

```ts
type DeviceConfig = {
  id: string;
  label?: string;
  apiUrl: string;
  instanceToken: string;
  instanceName: string;
  providerType?: 'evolution' | 'generic-server';
  readonly?: boolean;
  prebuiltMessages?: PrebuiltMessage[];
  capabilities?: Partial<ProviderCapabilities>;
};
```

| Field | Required | Description |
|---|---|---|
| `id` | Yes | Unique identifier for this device — used to target it via the imperative API |
| `apiUrl` | Yes | Base URL of the backend API |
| `instanceToken` | Yes | Auth token sent with every request — see [Security](#security) |
| `instanceName` | Yes | Channel/instance identifier passed as `:channelId` or `:instance` in API routes |
| `label` | No | Display name shown in the device selector |
| `providerType` | No | `'evolution'` (default) — Evolution API v2 directly. `'generic-server'` — your own backend via the normalized REST contract |
| `readonly` | No | If `true`, hides the composer — agents can read but not send |
| `prebuiltMessages` | No | Reusable message templates and audio voice notes — see [Pre-built Messages](#configdevicesprebuiltmessages--pre-built-messages) |
| `capabilities` | No | Feature flags for `generic-server` devices — see [Capabilities](#capabilities--feature-flags) |

**Minimal example:**

```js
mount(el, {
  devices: [
    {
      id: 'support',
      apiUrl: 'https://your-evolution-api.com',
      instanceToken: 'your-per-instance-token',
      instanceName: 'support-instance',
      label: 'Support',
    },
  ],
});
```

**Multi-device example:**

```js
mount(el, {
  devices: [
    {
      id: 'sales',
      label: 'Sales',
      apiUrl: 'https://your-evolution-api.com',
      instanceToken: 'token-for-sales-instance',
      instanceName: 'sales',
    },
    {
      id: 'support',
      label: 'Support (read-only)',
      apiUrl: 'https://your-evolution-api.com',
      instanceToken: 'token-for-support-instance',
      instanceName: 'support',
      readonly: true,
    },
  ],
  defaultDeviceId: 'sales',
});
```

---

### `config.defaultDeviceId`

ID of the device to select on mount. Defaults to the first device in the array.

```js
mount(el, {
  devices: [/* ... */],
  defaultDeviceId: 'support',
});
```

---

### `config.translations`

Override any UI string. All keys are optional — only provide what you want to change.

```js
mount(el, {
  devices: [/* ... */],
  translations: {
    'messageView.typeMessage': 'Write a message…',
    'messageView.sendTemplate': 'Use template',
    'conversationList.searchPlaceholder': 'Search conversations',
  },
});
```

---

### `config.chatActions` — Action buttons per chat row

Adds a three-dot menu to every chat row. Clicking it opens a dialog showing the contact's profile picture, name, phone number, device name, and your custom action buttons.

```ts
type ChatActionsResolver = (
  chat: Chat,
  device: DeviceConfig,
) => ChatAction[] | Promise<ChatAction[]>;

type ChatAction = {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>; // e.g. from lucide-react
  onClick: (chat: Chat, device: DeviceConfig) => void;
};
```

**Synchronous example:**

```js
mount(el, {
  devices: [/* ... */],
  chatActions: (chat, device) => [
    {
      id: 'open-crm',
      label: 'Open in CRM',
      onClick: () => window.open(`https://crm.example.com/contacts/${chat.phoneNumber}`),
    },
    {
      id: 'tag-vip',
      label: 'Tag as VIP',
      onClick: () => fetch('/api/tag', {
        method: 'POST',
        body: JSON.stringify({ phone: chat.phoneNumber, tag: 'vip' }),
      }),
    },
  ],
});
```

**Async example — different actions based on CRM status:**

```js
mount(el, {
  devices: [/* ... */],
  chatActions: async (chat, device) => {
    const customer = await fetch(`/api/crm/lookup?phone=${chat.phoneNumber}`)
      .then(r => r.json())
      .catch(() => null);

    if (customer) {
      return [
        {
          id: 'view-customer',
          label: 'See Customer',
          onClick: () => window.open(`/crm/customers/${customer.id}`),
        },
        {
          id: 'create-ticket',
          label: 'Create Support Ticket',
          onClick: () => createTicket(customer.id, chat),
        },
      ];
    }

    return [
      {
        id: 'create-contact',
        label: 'Create Contact in CRM',
        onClick: () => createContact(chat.phoneNumber, device.id),
      },
    ];
  },
});
```

**Behavior:**
- The three-dot icon always renders on every chat row, regardless of whether `chatActions` is configured
- Custom buttons only appear when a resolver is provided
- A loading spinner shows while the resolver is running
- After clicking an action, the dialog closes automatically
- Dismiss with X, backdrop click, or Escape

---

### `config.chatTags` — Colored tag pills on chat rows

Displays colored pills below the contact name in each row. All unique tags across all chats appear as clickable filter chips above the list.

```ts
type ChatTagsResolver = (
  chat: Chat,
  device: DeviceConfig,
) => ChatTag[] | Promise<ChatTag[]>;

type ChatTag = {
  id: string;       // Unique identifier — also used as the filter key
  label: string;    // Text shown in the pill
  color?: string;   // Text color (default: 'white')
  background?: string; // Background color (default: '#00a884')
};
```

**Example:**

```js
mount(el, {
  devices: [/* ... */],
  chatTags: async (chat, device) => {
    const tags = [];

    if (chat.unreadCount && chat.unreadCount > 0) {
      tags.push({ id: 'unread', label: 'Unread', background: '#ff9800' });
    }

    if (chat.contactName) {
      tags.push({ id: 'saved', label: 'Saved Contact', background: '#2196f3' });
    }

    // Fetch custom tags from your backend
    const remote = await fetch(`/api/tags?phone=${chat.phoneNumber}`)
      .then(r => r.json())
      .catch(() => []);

    return [...tags, ...remote];
  },
});
```

**Filtering behavior:**
- Clicking a tag chip above the list toggles it as a filter
- When multiple chips are selected, only chats matching **all** selected tags are shown (AND logic)
- Tags re-resolve automatically on every poll cycle

---

### `config.devices[].prebuiltMessages` — Pre-built Messages

A per-device library of reusable message templates. When configured, a **book icon** button appears in the composer. Clicking it opens a searchable picker with live previews of every item.

```ts
type PrebuiltMessage = {
  id: string;
  label: string;    // Short title shown in the picker
  content: string;  // Text body, or base64-encoded media data
  type?: 'text' | 'audio' | 'image' | 'video'; // Default: 'text'
  mimeType?: string; // Required for media types. Defaults per type (see table below)
};
```

#### Types and picker behaviour

| `type` | Picker preview | Send action | Default `mimeType` |
|---|---|---|---|
| `'text'` | Content text (truncated) | Fills the composer — agent can edit before sending | — |
| `'audio'` | Inline `<audio>` player — **fully playable before sending** | Explicit **Send** button (avoids accidental sends while using audio controls) | `audio/ogg` |
| `'image'` | Thumbnail `<img>` decoded from base64 | Click anywhere on the row | `image/jpeg` |
| `'video'` | Silent `<video>` preview frame decoded from base64 | Click anywhere on the row | `video/mp4` |

All media types (`audio`, `image`, `video`) send **immediately** without touching the text composer.

---

#### Text templates

```js
mount(el, {
  devices: [
    {
      id: 'support',
      // ...credentials...
      prebuiltMessages: [
        { id: 'greeting',  label: 'Greeting',          content: 'Hello! How can I help you today?' },
        { id: 'followup',  label: 'Follow up',          content: "I'm following up on our previous conversation. Please let me know if you have any questions." },
        { id: 'closing',   label: 'Closing',            content: 'Thank you for your time! Have a great day.' },
        { id: 'wait',      label: 'Please wait',        content: 'Just a moment while I look into that for you.' },
        { id: 'escalate',  label: 'Escalation notice',  content: "I'm going to transfer you to a specialist who can better assist you." },
      ],
    },
  ],
});
```

---

#### Audio voice notes

Pre-record voice messages and encode them as base64. The picker renders a fully playable `<audio>` player so agents can review the recording before hitting **Send**.

```js
import { readFileSync } from 'fs';

const voiceGreeting = readFileSync('voice-greeting.ogg').toString('base64');
const voiceClosing  = readFileSync('voice-closing.ogg').toString('base64');

mount(el, {
  devices: [
    {
      id: 'support',
      // ...credentials...
      prebuiltMessages: [
        {
          id: 'voice-greeting',
          label: 'Voice Greeting',
          type: 'audio',
          mimeType: 'audio/ogg', // Recommended for WhatsApp
          content: voiceGreeting,
        },
        {
          id: 'voice-closing',
          label: 'Voice Closing',
          type: 'audio',
          mimeType: 'audio/ogg',
          content: voiceClosing,
        },
      ],
    },
  ],
});
```

Accepted audio formats: `audio/ogg` (recommended for WhatsApp), `audio/webm`, `audio/mp4`, `audio/mpeg`.

---

#### Images

The picker renders the actual image as a thumbnail so agents see exactly what they are about to send.

```js
import { readFileSync } from 'fs';

const promoBanner = readFileSync('promo-banner.jpg').toString('base64');
const productShot = readFileSync('product-shot.png').toString('base64');

mount(el, {
  devices: [
    {
      id: 'sales',
      // ...credentials...
      prebuiltMessages: [
        {
          id: 'promo-banner',
          label: 'Promo Banner',
          type: 'image',
          mimeType: 'image/jpeg',
          content: promoBanner,
        },
        {
          id: 'product-shot',
          label: 'Product Shot',
          type: 'image',
          mimeType: 'image/png',
          content: productShot,
        },
      ],
    },
  ],
});
```

Accepted image formats: `image/jpeg`, `image/png`, `image/webp`, `image/gif`.

---

#### Videos

The picker renders a silent preview frame so agents can verify the clip before sending.

```js
import { readFileSync } from 'fs';

const demoVideo = readFileSync('product-demo.mp4').toString('base64');

mount(el, {
  devices: [
    {
      id: 'sales',
      // ...credentials...
      prebuiltMessages: [
        {
          id: 'product-demo',
          label: 'Product Demo',
          type: 'video',
          mimeType: 'video/mp4',
          content: demoVideo,
        },
      ],
    },
  ],
});
```

Accepted video formats: `video/mp4` (recommended), `video/webm`.

---

#### Mixed library (recommended for most teams)

```js
prebuiltMessages: [
  // Text — agent reviews and can edit before sending
  { id: 'greeting', label: 'Greeting', content: 'Hello! How can I help you today?' },
  { id: 'followup', label: 'Follow up', content: "I'm following up on our previous conversation." },
  { id: 'closing',  label: 'Closing',  content: 'Thank you for your time! Have a great day.' },

  // Audio — agent listens via the inline player, then clicks Send
  { id: 'voice-hi',  label: 'Voice: Hi!',  type: 'audio', mimeType: 'audio/ogg', content: '<base64>' },
  { id: 'voice-bye', label: 'Voice: Bye!', type: 'audio', mimeType: 'audio/ogg', content: '<base64>' },

  // Image — thumbnail preview, click row to send
  { id: 'promo', label: 'Promo Banner', type: 'image', mimeType: 'image/jpeg', content: '<base64>' },

  // Video — silent frame preview, click row to send
  { id: 'demo', label: 'Product Demo', type: 'video', mimeType: 'video/mp4', content: '<base64>' },
],
```

---

#### Picker behaviour

- The book icon button only appears when `prebuiltMessages` is configured and non-empty for the active device
- **Search** — filters on `label` for all types; also matches `content` for text items. Base64 media content is never searched
- **Audio items** have a dedicated **Send** button to prevent audio control interactions (play/seek/pause) from accidentally triggering a send
- **Image and video items** — click anywhere on the row to send
- Dismiss with Escape, the X button, or clicking the backdrop
- Each device can have a completely different message library

---

### Generic Server Provider

The `generic-server` provider type connects the inbox to **any messaging backend** — WhatsApp Cloud API, Instagram DM, Facebook Messenger, SMS, email, or your own internal messaging system. Instead of calling the Evolution API directly, the inbox calls your backend using a simple normalized REST contract. Your backend translates those calls into whatever the underlying channel requires.

This means the inbox UI — conversation list, message thread, composer, media, voice recording, read receipts — works identically regardless of which channel is behind it.

#### Configuration

```js
mount(el, {
  devices: [
    {
      id: 'whatsapp-cloud',
      label: 'WhatsApp Cloud',
      providerType: 'generic-server',
      apiUrl: 'https://api.yourcompany.com',
      instanceToken: 'your-channel-token',
      instanceName: 'wa-cloud-prod',
      capabilities: {
        templates: true,
        messagingWindow24h: true,
      },
    },
    {
      id: 'instagram',
      label: 'Instagram DM',
      providerType: 'generic-server',
      apiUrl: 'https://api.yourcompany.com',
      instanceToken: 'your-instagram-token',
      instanceName: 'instagram-prod',
    },
  ],
});
```

- `apiUrl` — Base URL of your backend
- `instanceToken` — Sent as `Authorization: Bearer <token>` on every request
- `instanceName` — Used as the `:channelId` path parameter in all routes
- `capabilities` — Declares which features your backend supports (see below)

---

#### Capabilities — Feature flags

Declare what your backend supports. Unset flags default to `false`.

```ts
type ProviderCapabilities = {
  templates: boolean;          // Show the template-message button in the composer
  messagingWindow24h: boolean; // Enforce the 24-hour messaging window (WhatsApp Cloud API)
  pushToTalk: boolean;         // Enable voice recording in the composer
  interactiveButtons: boolean; // Enable the interactive button message dialog
  deleteForEveryone: boolean;  // Show "delete for everyone" in the message context menu
};
```

| Capability | Evolution API | Notes |
|---|---|---|
| `templates` | `false` | Enable for channels that support template / HSM messages |
| `messagingWindow24h` | `false` | When `true`, the composer disables after 24 h without an inbound message |
| `pushToTalk` | `true` | Disable for channels that don't support audio messages |
| `interactiveButtons` | `true` | Disable for channels that don't support button messages |
| `deleteForEveryone` | `true` | Disable if your backend doesn't support message deletion |

---

#### API contract

Your backend must implement the following 8 endpoints. All paths are relative to `apiUrl`, and `:channelId` is always `instanceName`. Every request (except `OPTIONS` preflight) carries `Authorization: Bearer <instanceToken>`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/channels/:channelId/status` | Connection state |
| `GET` | `/channels/:channelId/chats` | Chat list |
| `GET` | `/channels/:channelId/chats/:chatId/messages` | Paginated message history |
| `POST` | `/channels/:channelId/messages/text` | Send a text message |
| `POST` | `/channels/:channelId/messages/media` | Send image / video / audio / document |
| `POST` | `/channels/:channelId/messages/buttons` | Send interactive button message |
| `GET` | `/channels/:channelId/media/:messageId` | Resolve a media URL |
| `DELETE` | `/channels/:channelId/messages/:messageId` | Delete a message for everyone |

---

##### `GET /channels/:channelId/status`

Returns whether the channel is connected.

**Response `200`:**
```json
{ "state": "open" }
```

`state` is one of `"open"`, `"close"`, or `"connecting"`.

---

##### `GET /channels/:channelId/chats`

Returns all conversations, sorted by `lastActiveAt` descending (most recent first).

**Response `200` — `Chat[]`:**
```ts
type Chat = {
  id: string;             // Unique ID for this conversation — used as :chatId in other routes
  phoneNumber: string;    // Contact phone number (digits only, no + or @)
  contactName?: string;   // Display name
  profilePicUrl?: string; // Avatar URL
  lastActiveAt?: string;  // ISO 8601 timestamp
  lastMessage?: {
    content: string;
    direction: 'inbound' | 'outbound';
    type?: string;
  };
  unreadCount?: number;
};
```

---

##### `GET /channels/:channelId/chats/:chatId/messages?page=1&pageSize=50`

Returns a paginated message list. The inbox loads `page=1` on open and increments `page` as the user scrolls up for older messages.

**Query parameters:**

| Parameter | Default | Description |
|---|---|---|
| `page` | `1` | 1-based page number |
| `pageSize` | `50` | Items per page |

**Response `200`:**
```ts
type PaginatedMessages = {
  messages: Message[];       // Sorted oldest-first (ascending createdAt)
  pagination: {
    currentPage: number;
    totalPages: number;
    total: number;
    hasMore: boolean;
  };
};

type Message = {
  id: string;
  direction: 'inbound' | 'outbound';
  content: string;                    // Display text (empty string for media-only)
  createdAt: string;                  // ISO 8601 timestamp
  status?: string;                    // 'sent' | 'delivered' | 'read' | 'failed' | 'pending'
  phoneNumber: string;
  hasMedia: boolean;
  messageType: string;                // See table below
  reactionEmoji?: string | null;
  reactedToMessageId?: string | null;
  caption?: string | null;            // Caption rendered below media
  filename?: string | null;           // Shown for document messages
  mimeType?: string | null;
  metadata?: Record<string, unknown>; // Pass { mediaId } to trigger lazy media fetching
  senderName?: string;                // Display name for group-chat participants
};
```

**`messageType` values and how the inbox renders them:**

| `messageType` | `hasMedia` | Rendered as |
|---|---|---|
| `text` | `false` | Plain text bubble |
| `image` | `true` | Inline image |
| `video` | `true` | Video player |
| `audio` | `true` | Audio waveform player |
| `document` | `true` | Downloadable file with filename |
| `deleted` | `false` | Greyed-out "This message was deleted" |
| `reaction` | `false` | Emoji overlaid on the reacted message |

**Media loading:** to load media lazily (recommended for large files), set `hasMedia: true` and pass `metadata: { mediaId: "<id>" }`. The inbox calls `GET /media/:messageId` with that ID when the user first views the message. Alternatively, populate `mediaData.url` directly to bypass the media endpoint.

---

##### `POST /channels/:channelId/messages/text`

Send a text message.

**Request body:**
```json
{ "to": "5511999999999", "body": "Hello!" }
```

**Response `200`:**
```json
{ "messageId": "msg_abc123", "status": "sent" }
```

---

##### `POST /channels/:channelId/messages/media`

Send an image, video, audio PTT, or document. The file is provided as a base64 string.

**Request body:**
```ts
{
  to: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  media: string;      // Base64-encoded file data
  caption?: string;
  fileName?: string;
  mimeType?: string;
  ptt?: boolean;      // true = send audio as a PTT voice note
}
```

**Response `200`:**
```json
{ "messageId": "msg_def456", "status": "sent" }
```

---

##### `POST /channels/:channelId/messages/buttons`

Send an interactive button message (up to 3 options). Only relevant when `capabilities.interactiveButtons` is `true`.

**Request body:**
```ts
{
  to: string;
  body: string;          // Main message text
  header?: string;       // Optional title above the body
  buttons: Array<{
    id: string;
    title: string;
  }>;
}
```

**Response `200`:**
```json
{ "messageId": "msg_ghi789", "status": "sent" }
```

---

##### `GET /channels/:channelId/media/:messageId`

Returns a URL to the media file. The inbox opens this URL directly in the browser (`<img>`, `<video>`, `<audio>`, or a download link), so it must be publicly accessible or protected by a short-lived pre-signed token.

**Response `200`:**
```json
{ "url": "https://cdn.yourcompany.com/media/abc123.jpg" }
```

Return `404` if the media is unavailable — the inbox shows a "Media unavailable" placeholder.

---

##### `DELETE /channels/:channelId/messages/:messageId`

Delete a message for everyone. The optional request body can carry provider-specific metadata your backend needs.

**Request body (optional):**
```json
{ "metadata": { "remoteJid": "5511999999999", "fromMe": true } }
```

**Response `204` (no body).**

---

#### CORS

The browser calls your backend directly, so CORS must allow requests from the host app's origin:

```
Access-Control-Allow-Origin:  https://your-app.com  (or * for dev)
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

---

#### Example: WhatsApp Cloud API proxy

A minimal Express handler that adapts `GET /channels/:channelId/chats` to the WhatsApp Cloud API:

```js
app.get('/channels/:channelId/chats', async (req, res) => {
  const conversations = await cloudApi.listConversations(req.params.channelId);
  res.json(conversations.map(c => ({
    id: c.id,
    phoneNumber: c.customer_phone,
    contactName: c.display_name,
    lastMessage: {
      content: c.last_message.text,
      direction: c.last_message.from_me ? 'outbound' : 'inbound',
    },
    unreadCount: c.unread_count,
    lastActiveAt: c.updated_at,
  })));
});
```

---

### Imperative API — `WhatsAppInbox`

`mount()` returns a `WhatsAppInbox` object for controlling the inbox programmatically.

```ts
type WhatsAppInbox = {
  getChats(): Promise<Chat[]>;
  getMessages(chatId: string, limit?: number): Promise<Message[]>;
  sendText(params: SendTextParams): Promise<SendResult>;
  getConnectionState(): Promise<'open' | 'close' | 'connecting'>;
  getActiveDevice(): string | null;
  setActiveDevice(deviceId: string): void;
  selectConversation(phoneNumber: string, prefillMessage?: string, deviceId?: string): void;
  openChat(phoneNumber: string, options?: { prefillMessage?: string; deviceId?: string }): void;
  unmount(): void;
};
```

---

#### `getChats()`

Fetches all chats for the currently active device.

```js
const chats = await inbox.getChats();
console.log(`${chats.length} conversations on ${inbox.getActiveDevice()}`);

// Find a specific contact
const chat = chats.find(c => c.phoneNumber === '5511999999999');
console.log(chat?.contactName, chat?.unreadCount);
```

---

#### `getMessages(chatId, limit?)`

Fetches messages for a specific chat. `limit` defaults to 50.

```js
const chats = await inbox.getChats();
const messages = await inbox.getMessages(chats[0].id, 100);

const lastInbound = messages.filter(m => m.direction === 'inbound').at(-1);
console.log('Last customer message:', lastInbound?.content);
```

---

#### `sendText(params)`

Sends a text message from the active device.

```js
const result = await inbox.sendText({
  to: '5511999999999@s.whatsapp.net',
  body: 'Hello from the imperative API!',
});
console.log('Message ID:', result.messageId);
```

---

#### `getConnectionState()`

Checks whether the active device's WhatsApp connection is open.

```js
const state = await inbox.getConnectionState();
// 'open' | 'close' | 'connecting'

if (state !== 'open') {
  alert('WhatsApp is disconnected — please scan the QR code.');
}
```

---

#### `getActiveDevice()` / `setActiveDevice(deviceId)`

Read or change the currently selected device.

```js
console.log('Active device:', inbox.getActiveDevice()); // 'sales'

inbox.setActiveDevice('support');
console.log('Active device:', inbox.getActiveDevice()); // 'support'
```

---

#### `selectConversation(phoneNumber, prefillMessage?, deviceId?)`

Opens a conversation by phone number, optionally pre-filling the composer and/or switching to a specific device. This is the primary integration point for CRM and support tools.

```js
// Open a conversation on the active device
inbox.selectConversation('5511999999999');

// Pre-fill the composer — the agent reviews and clicks Send
inbox.selectConversation('5511999999999', 'Hello, following up on your request!');

// Switch to a specific device, then open the conversation
inbox.selectConversation('5511999999999', undefined, 'support');

// Switch device + pre-fill — the most common CRM integration pattern
inbox.selectConversation('5511999999999', 'Hi! How can I help?', 'support');
```

**Pre-fill behavior:**
- The message is written into the composer exactly as provided
- The agent can edit it before sending — it is never sent automatically
- Calling `selectConversation` again replaces the previous pre-fill (each call is tracked by an internal counter, so stale values are never applied)

**Device switching behavior:**

| Mode | `deviceId` provided | Result |
|---|---|---|
| Single (`viewMode: 'single'`) | Different from active | Switches device → fetches chat list → selects conversation |
| Single | Same as active or omitted | Searches current chat list immediately |
| Merged (`viewMode: 'all'`) | Any | No device switch — `deviceId` only disambiguates duplicate phone numbers |

If the phone number is not found in the chat list, nothing is selected.

**CRM integration example:**

```js
// When an agent clicks "Reply" in your CRM
document.getElementById('reply-btn').addEventListener('click', () => {
  inbox.selectConversation(
    customer.phoneNumber,
    `Hi ${customer.firstName}, thanks for reaching out! How can I help?`,
    customer.assignedWhatsAppDevice,
  );
});
```

**Notification / webhook integration example:**

```js
// Open the conversation when a new inbound message webhook fires
websocket.on('message', (event) => {
  if (event.type === 'inbound') {
    inbox.selectConversation(event.phoneNumber, undefined, event.deviceId);
  }
});
```

---

#### `openChat(phoneNumber, options?)`

Opens a conversation by phone number. Unlike `selectConversation`, this works even if the number has no existing chat history — it opens a blank message view so the agent can send the first message.

Pass a plain phone number in international format (digits only — no `+`, spaces, or `@`). The Evolution API resolves the WhatsApp JID automatically.

```js
// Open a blank thread for any phone number
inbox.openChat('5511999999999');

// Pre-fill the composer
inbox.openChat('5511999999999', { prefillMessage: 'Hello, how can I help?' });

// Target a specific device
inbox.openChat('5511999999999', { deviceId: 'support' });

// Full form
inbox.openChat('5511999999999', {
  prefillMessage: 'Hi! Following up on your request.',
  deviceId: 'support',
});
```

**Compared to `selectConversation`:**

| | `selectConversation` | `openChat` |
|---|---|---|
| Number in chat list | ✅ Opens it | ✅ Opens it |
| Number NOT in list | ❌ Does nothing | ✅ Opens blank thread |

**Device behaviour:** Same as `selectConversation` — if `deviceId` differs from the active device, the inbox switches to that device first. In merged mode, `deviceId` disambiguates duplicate numbers.

---

#### `unmount()`

Removes the inbox from the DOM and cleans up all subscriptions and timers.

```js
// When navigating away
inbox.unmount();
```

---

### TypeScript types

```ts
type Chat = {
  id: string;
  phoneNumber: string;
  contactName?: string;
  profilePicUrl?: string;
  lastActiveAt?: string;
  lastMessage?: {
    content: string;
    direction: 'inbound' | 'outbound';
    type?: string;
  };
  unreadCount?: number;
};

type Message = {
  id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  createdAt: string;
  status?: string;
  phoneNumber: string;
  hasMedia: boolean;
  mediaData?: {
    url: string;
    contentType?: string;
    filename?: string;
    byteSize?: number;
  };
  messageType: string;
  caption?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  metadata?: Record<string, unknown>;
};

type SendTextParams = { to: string; body: string };
type SendResult    = { messageId: string; status?: string };
```

---

## Security

This library uses **per-instance tokens** instead of the Evolution API global key. Each token is scoped to a single WhatsApp instance — if a token is compromised, only that instance is affected.

To obtain the per-instance token:

```bash
curl -H "apikey: YOUR_GLOBAL_KEY" https://your-api.com/instance/fetchInstances
```

Each instance in the response has a `token` field — use that as `instanceToken`.

> **Never use the global API key in client-side code.** The global key grants access to all instances and should only be used server-side for administration tasks.

## Examples

See the [`examples/`](./examples) directory:

- **[`examples/vue3/`](./examples/vue3)** — Vue 3 Composition API integration with chat tags, async chat actions, imperative API demos, and full Brazilian/international fixture data

To run the Vue 3 example against the mock server:

```bash
make docker        # start frontend (5173) + mock server (3002)
make example-vue3  # build library + serve example at http://localhost:5174/examples/vue3/
```

## Development

### Prerequisites

- Node.js 20+
- An [Evolution API](https://doc.evolution-api.com/) instance with CORS enabled (`CORS_ORIGIN=*`), **or** use the built-in mock server (no real API needed)

### Setup

```bash
make install
```

### Running with the mock server (no real API needed)

The fastest way to get started. Starts a local Evolution API mock on port 3002 and the Vite dev server on port 5173 — no credentials required.

**With Docker (recommended):**

```bash
make docker          # Build images and start in detached mode
# Open http://localhost:5173
make docker-restart  # Rebuild and restart (after code changes)
make docker-down     # Stop the stack
```

**Without Docker:**

```bash
make mock   # Starts mock server + Vite dev server concurrently
# Open http://localhost:5173
```

Both modes use `devices.json` pre-configured to point at `http://localhost:3002` with two mock instances (`MOCK1` and `MOCK2`).

### Running with a real Evolution API

Replace `devices.json` with your real credentials:

```json
{
  "devices": [
    {
      "id": "dev-1",
      "label": "Dev Instance",
      "apiUrl": "https://your-evolution-api.com",
      "instanceToken": "your-per-instance-token",
      "instanceName": "your-instance"
    }
  ]
}
```

Then run:

```bash
make dev
```

### Commands

```bash
make install         # Install dependencies
make dev             # Start Vite dev server (reads devices.json)
make build           # Build library → dist/
make preview         # Preview the built library
make lint            # Run ESLint
make typecheck       # Run TypeScript type check
make clean           # Remove dist/ and node_modules/
make test            # Run unit tests (Vitest)
make test-e2e        # Run e2e tests — requires: make docker
make example-vue3    # Build library + serve Vue 3 example at localhost:5174 — requires: make docker
make mock            # Start mock server + dev server locally (no Docker)
make docker          # Start full stack with Docker Compose
make docker-build    # Rebuild Docker images from scratch
make docker-down     # Stop Docker Compose stack
make docker-restart  # Stop, rebuild, and restart Docker Compose stack
just release-minor   # Bump minor, push tag, create release → publishes to npm
just release-major   # Bump major, push tag, create release → publishes to npm
```

### Build Output

```
dist/
  whatsapp-inbox.es.js    ~480 KB  (ES module)
  whatsapp-inbox.umd.js   ~305 KB  (UMD, works with <script> tags)
  whatsapp-inbox.css       ~37 KB  (prefixed styles)
  index.d.ts                       (TypeScript declarations)
```

All dependencies (including Preact) are bundled — no peer dependencies required.

## Architecture

```
src/
  index.ts                  # Library entry: mount() / unmount() API
  App.tsx                   # Main layout (teal bar, sidebar, message view)
  dev.tsx                   # Dev server entry (reads devices.json)
  components/
    instance-selector.tsx   # Device selector dialog
    conversation-list.tsx   # Left sidebar with chat list
    message-view.tsx        # Right panel with messages and composer
    prebuilt-messages-dialog.tsx  # Pre-built message picker
    image-paste-modal.tsx   # Clipboard image paste overlay
    media-message.tsx       # Image/video/document/audio rendering
    audio-player.tsx        # Custom audio player with waveform
    forward-message-dialog.tsx
    template-selector-dialog.tsx
    interactive-message-dialog.tsx
    message-context-menu.tsx
    ui/                     # shadcn/ui components (dialog, scroll-area, etc.)
  lib/
    providers/
      types.ts              # MessagingProvider interface, DeviceConfig, Chat, Message, ProviderCapabilities
      evolution.ts          # Evolution API v2 implementation (browser fetch)
      generic-server.ts     # Generic normalized REST implementation (any backend)
      index.ts              # createProvider() factory
    provider-context.tsx    # Preact context for multi-device state
  hooks/
    use-auto-polling.ts     # Polling hook with tab-visibility detection
  use-cases/
    use-app-state.ts        # Top-level app state (selected conversation, device)
    use-chat-list.ts        # Chat list fetching and polling
    use-message-thread.ts   # Message thread, sending, optimistic updates
    use-device-status.ts    # Connection status polling
mock-server/
  index.ts                  # Entry point (serves on MOCK_PORT, default 3002)
  app.ts                    # Hono router — all Evolution API routes
  fixtures.ts               # Per-instance fixture data (MOCK1, MOCK2)
  store.ts                  # In-memory state (sent messages, media, contacts, unread)
  generic-server-index.ts   # Entry point for generic server (GENERIC_PORT, default 3003)
  generic-server-app.ts     # Hono router — generic normalized REST API (/channels/...)
  generic-fixtures.ts       # Normalized fixture data (GENERIC1)
```

### Key Patterns

- **No backend** — All API calls (`findChats`, `sendText`, `getMediaUrl`, etc.) happen directly from the browser via the provider abstraction.
- **Per-instance tokens** — Each device authenticates with its own scoped token, not the global API key.
- **Provider system** — Two built-in providers: `EvolutionProvider` (Evolution API v2, direct) and `GenericServerProvider` (normalized REST, any backend). Implement the `MessagingProvider` interface to add more.
- **Preact with compat** — Uses Preact with `preact/compat` so React-ecosystem libraries work unchanged.
- **CSS isolation** — Tailwind v4 with `wa:` prefix (e.g. `wa:flex`, `wa:p-4`). CSS variables namespaced as `--wa-*`.
- **Optimistic sends** — Messages appear immediately in the thread with a pending status; the chat list refreshes after the send resolves.
- **Chat list reactivity** — `ConversationList` exposes a `refresh()` ref method called after sending, template sends, and on mount.

### Mock Server

The mock server (`mock-server/`) is a [Hono](https://hono.dev/) HTTP server that replicates the Evolution API v2 contract for local development — no real WhatsApp credentials needed.

**Evolution mock endpoints (port 3002):**

| Endpoint | Method | Description |
|---|---|---|
| `/instance/connectionState/:instance` | GET | Returns `{ instance: { state: 'open' } }` |
| `/chat/findChats/:instance` | POST | Returns chat list, dynamically updated with sent messages and unread counts |
| `/chat/findContacts/:instance` | POST | Returns contacts, merged with dynamically created contacts |
| `/chat/findMessages/:instance` | POST | Returns paginated messages; marks chat as read |
| `/chat/getBase64FromMediaMessage/:instance` | POST | Returns stored base64 for sent media |
| `/message/sendText/:instance` | POST | Stores message, triggers delivery progression and auto-reply |
| `/message/sendMedia/:instance` | POST | Stores message + base64 payload |
| `/message/sendButtons/:instance` | POST | Stores button message |
| `/chat/deleteMessageForEveryone/:instance` | DELETE | Marks message deleted; emits REVOKE event |
| `/test/reset/:instance` | POST | Wipes in-memory state for an instance (used by e2e tests in `beforeEach`) |

**Generic mock endpoints (port 3003):**

Implements the full [generic server contract](#api-contract) for the `GENERIC1` instance (Alice Martin, Bob Chen). Auth: `Authorization: Bearer generic-token-789`.

| Endpoint | Method | Description |
|---|---|---|
| `/channels/:channelId/status` | GET | Returns `{ state: 'open' }` |
| `/channels/:channelId/chats` | GET | Returns normalized chat list, updated with sent messages |
| `/channels/:channelId/chats/:chatId/messages` | GET | Returns `PaginatedMessages` |
| `/channels/:channelId/messages/text` | POST | Stores sent message, returns `{ messageId, status }` |
| `/channels/:channelId/messages/media` | POST | Stores sent media message |
| `/channels/:channelId/messages/buttons` | POST | Stores button message |
| `/channels/:channelId/media/:messageId` | GET | Returns `{ url }` for stored media |
| `/channels/:channelId/messages/:messageId` | DELETE | Marks message deleted (204) |
| `/channels/:channelId/reset` | POST | Wipes in-memory state (used by e2e tests in `beforeEach`) |

**Mock instances:**
- `MOCK1` — Brazilian contacts (Ana Beatriz, Carlos Eduardo, Equipe Vendas group, Fernanda Lima, Roberto Mendes)
- `MOCK2` — International contacts (Sarah Johnson, James Wright, Product Team group, Miguel Torres)
- `GENERIC1` — Generic channel contacts (Alice Martin, Bob Chen)

## Publishing

Package is published to [npm](https://www.npmjs.com/package/@ivanamato/whatsapp-inbox) as `@ivanamato/whatsapp-inbox`. A GitHub Actions workflow (`.github/workflows/publish.yml`) automatically builds and publishes on every GitHub Release using Trusted Publishing (OIDC).

- **Release commands:** `just release-minor` or `just release-major` bump the version, push the tag, and create a GitHub release (which triggers the publish workflow).
- **`publishConfig`** in `package.json` sets `"access": "public"`.

## License

MIT
