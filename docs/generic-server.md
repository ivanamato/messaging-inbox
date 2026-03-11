# Generic Server Provider

The `generic-server` provider lets you connect the inbox to **any backend** — not just the Evolution API. Your server implements a simple REST contract using normalized types, and the inbox talks to it directly from the browser.

## Quick start

```ts
import { mount } from '@ivanamato/messaging-inbox'
import '@ivanamato/messaging-inbox/style.css'

mount(document.getElementById('app')!, {
  devices: [{
    id: 'my-backend',
    apiUrl: 'https://api.example.com',
    instanceToken: 'your-bearer-token',
    instanceName: 'main-channel',
    providerType: 'generic-server',
  }],
})
```

That's it — if your backend implements the default endpoints below, the inbox works out of the box.

## Authentication

All requests include:

```
Authorization: Bearer <instanceToken>
Content-Type: application/json
```

Your backend should validate the `Bearer` token and scope it to the correct channel/instance.

## Default endpoints

When no `endpoints` config is provided, the provider uses these defaults:

| Operation | Default | Description |
|-----------|---------|-------------|
| `status` | `GET /channels/{channelId}/status` | Connection state |
| `chats` | `GET /channels/{channelId}/chats` | List conversations |
| `messages` | `GET /channels/{channelId}/chats/{chatId}/messages?page={page}&pageSize={pageSize}` | Paginated messages |
| `sendText` | `POST /channels/{channelId}/messages/text` | Send text message |
| `sendMedia` | `POST /channels/{channelId}/messages/media` | Send media (image, video, audio, document) |
| `sendButtons` | `POST /channels/{channelId}/messages/buttons` | Send interactive buttons |
| `media` | `GET /channels/{channelId}/media/{messageId}` | Get media download URL |
| `deleteMsg` | `DELETE /channels/{channelId}/messages/{messageId}` | Delete a message |

## Custom endpoints

Override any or all endpoints via the `endpoints` config on the device:

```ts
{
  id: 'custom-backend',
  apiUrl: 'https://api.example.com',
  instanceToken: 'token',
  instanceName: 'main',
  providerType: 'generic-server',
  endpoints: {
    status:      'GET /api/v2/{channelId}/health',
    chats:       'GET /api/v2/{channelId}/conversations',
    messages:    'GET /api/v2/{channelId}/conversations/{chatId}/history?p={page}&limit={pageSize}',
    sendText:    'POST /api/v2/{channelId}/send/text',
    sendMedia:   'POST /api/v2/{channelId}/send/media',
    sendButtons: 'POST /api/v2/{channelId}/send/buttons',
    media:       'GET /api/v2/{channelId}/attachments/{messageId}',
    deleteMsg:   'DELETE /api/v2/{channelId}/history/{messageId}',
  },
}
```

### Format

Each endpoint value is a string: `"METHOD /path/with/{placeholders}"`.

- **Method** comes first, separated by a space. If omitted, defaults to `GET`.
- **Path** is appended to `apiUrl`. It can include query strings.
- **Placeholders** are `{name}` tokens replaced at call time. All values are URI-encoded automatically.

### Available placeholders

| Placeholder | Provided by | Used in |
|-------------|------------|---------|
| `{channelId}` | `device.instanceName` | All endpoints |
| `{chatId}` | Chat identifier (e.g. phone number, opaque ID) | `messages` |
| `{messageId}` | Message ID | `media`, `deleteMsg` |
| `{page}` | 1-based page number | `messages` |
| `{pageSize}` | Items per page (default 50) | `messages` |

Omitted keys fall back to the default endpoint. You only need to override the ones that differ.

## Request & response shapes

### `status` — Connection state

**Response:**

```json
{ "state": "open" }
```

`state` must be one of `"open"`, `"close"`, or `"connecting"`.

---

### `chats` — List conversations

**Response:** `Chat[]`

```json
[
  {
    "id": "14151234567",
    "phoneNumber": "14151234567",
    "contactName": "Alice Martin",
    "profilePicUrl": "https://...",
    "lastActiveAt": "2026-03-11T10:30:00.000Z",
    "lastMessage": {
      "content": "Hi, I need help",
      "direction": "inbound",
      "type": "text"
    },
    "unreadCount": 2
  }
]
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | `string` | Yes | Unique chat identifier. Can be a phone number, username, or opaque ID. |
| `phoneNumber` | `string` | Yes | Display identifier (phone number, username, etc.) |
| `contactName` | `string` | No | Display name |
| `profilePicUrl` | `string` | No | Avatar URL |
| `lastActiveAt` | `string` | No | ISO 8601 timestamp of last activity |
| `lastMessage` | `object` | No | Preview of the most recent message |
| `lastMessage.content` | `string` | Yes | Text content or description (e.g. `"[image]"`) |
| `lastMessage.direction` | `"inbound" \| "outbound"` | Yes | |
| `lastMessage.type` | `string` | No | Message type hint |
| `unreadCount` | `number` | No | Unread message count for this chat |

---

### `messages` — Paginated message history

**Response:** `PaginatedMessages`

```json
{
  "messages": [
    {
      "id": "msg-001",
      "direction": "inbound",
      "content": "Hello!",
      "createdAt": "2026-03-11T10:00:00.000Z",
      "status": "read",
      "phoneNumber": "14151234567",
      "hasMedia": false,
      "messageType": "text",
      "reactionEmoji": null,
      "reactedToMessageId": null,
      "caption": null,
      "filename": null,
      "mimeType": null,
      "metadata": {},
      "senderName": "Alice Martin"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "total": 58,
    "hasMore": true
  }
}
```

**Message fields:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | `string` | Yes | Unique message ID |
| `direction` | `"inbound" \| "outbound"` | Yes | |
| `content` | `string` | Yes | Text content. Empty string for media-only messages. |
| `createdAt` | `string` | Yes | ISO 8601 timestamp |
| `status` | `string` | No | `"sent"`, `"delivered"`, `"read"`, or `"failed"` |
| `phoneNumber` | `string` | Yes | Chat/contact identifier |
| `hasMedia` | `boolean` | Yes | Whether the message has a media attachment |
| `messageType` | `string` | Yes | `"text"`, `"image"`, `"video"`, `"audio"`, `"document"`, `"sticker"`, `"contact"`, `"location"`, `"deleted"`, etc. |
| `reactionEmoji` | `string \| null` | No | Emoji for reaction messages |
| `reactedToMessageId` | `string \| null` | No | Target message ID for reactions |
| `caption` | `string \| null` | No | Caption for media messages |
| `filename` | `string \| null` | No | Original filename for documents/media |
| `mimeType` | `string \| null` | No | MIME type for media messages |
| `metadata` | `object` | No | Arbitrary provider-specific data. For media, include `{ "mediaId": "..." }` if different from `id`. |
| `senderName` | `string` | No | Display name of the sender (shown on inbound message bubbles) |

**Pagination fields:**

| Field | Type | Notes |
|-------|------|-------|
| `currentPage` | `number` | 1-based |
| `totalPages` | `number` | |
| `total` | `number` | Total message count |
| `hasMore` | `boolean` | `true` if more pages exist |

---

### `sendText` — Send a text message

**Request body:** `SendTextParams`

```json
{ "to": "14151234567", "body": "Hello!" }
```

**Response:** `SendResult`

```json
{ "messageId": "msg-new-001", "status": "sent" }
```

---

### `sendMedia` — Send a media message

**Request body:** `SendMediaParams`

```json
{
  "to": "14151234567",
  "mediaType": "image",
  "media": "<base64-encoded data>",
  "caption": "Check this out",
  "fileName": "photo.jpg",
  "mimeType": "image/jpeg",
  "ptt": false
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `to` | `string` | Yes | Recipient identifier |
| `mediaType` | `"image" \| "video" \| "audio" \| "document"` | Yes | |
| `media` | `string` | Yes | Base64-encoded file content |
| `caption` | `string` | No | |
| `fileName` | `string` | No | |
| `mimeType` | `string` | No | |
| `ptt` | `boolean` | No | Push-to-talk flag for voice messages |

**Response:** `SendResult`

```json
{ "messageId": "msg-new-002", "status": "sent" }
```

---

### `sendButtons` — Send interactive buttons

**Request body:** `SendButtonsParams`

```json
{
  "to": "14151234567",
  "body": "Please choose an option:",
  "header": "Order Status",
  "buttons": [
    { "id": "track", "title": "Track Order" },
    { "id": "cancel", "title": "Cancel Order" }
  ]
}
```

**Response:** `SendResult`

```json
{ "messageId": "msg-new-003", "status": "sent" }
```

---

### `media` — Get media URL

**Response:**

```json
{ "url": "https://cdn.example.com/files/photo.jpg?token=abc123" }
```

Return a direct URL (or pre-signed URL) to the media file. The inbox fetches and displays it. Return an empty `url` or 404 if unavailable.

---

### `deleteMsg` — Delete a message

**Request body** (optional):

```json
{ "metadata": { "remoteJid": "...", "fromMe": true } }
```

**Response:** `204 No Content`

The `metadata` field passes through provider-specific context. Your backend can ignore it if deletion only needs the message ID (from the URL).

## Capabilities

Declare what your backend supports via `capabilities` on the device config. All default to `false` for `generic-server`:

```ts
{
  providerType: 'generic-server',
  capabilities: {
    templates: false,              // WhatsApp message templates
    messagingWindow24h: false,     // 24h messaging window restriction
    pushToTalk: true,              // Voice message recording
    interactiveButtons: true,      // Button messages
    deleteForEveryone: true,       // Message deletion
    conversationInitiation: {
      canInitiate: true,           // Can start new conversations
      identifierType: 'phone',    // 'phone', 'username', or 'opaque'
      identifierLabel: 'Phone number',  // UI label for the input
    },
  },
}
```

The inbox UI adapts based on these flags — hiding the record button if `pushToTalk` is false, disabling "new chat" if `canInitiate` is false, etc.

## Examples

### Minimal — use all defaults

```ts
{
  id: 'support',
  apiUrl: 'https://api.example.com',
  instanceToken: 'bearer-token',
  instanceName: 'support-channel',
  providerType: 'generic-server',
}
```

Your backend implements: `GET /channels/support-channel/chats`, `POST /channels/support-channel/messages/text`, etc.

### Custom API paths

```ts
{
  id: 'custom',
  apiUrl: 'https://api.example.com',
  instanceToken: 'bearer-token',
  instanceName: 'main',
  providerType: 'generic-server',
  endpoints: {
    chats:    'GET /api/v2/inbox/{channelId}/threads',
    messages: 'GET /api/v2/inbox/{channelId}/threads/{chatId}?page={page}&per_page={pageSize}',
    sendText: 'POST /api/v2/inbox/{channelId}/send',
  },
  capabilities: {
    pushToTalk: true,
    deleteForEveryone: true,
    conversationInitiation: {
      canInitiate: true,
      identifierType: 'phone',
    },
  },
}
```

Only the three overridden endpoints use custom paths. The rest (`status`, `sendMedia`, `sendButtons`, `media`, `deleteMsg`) use the defaults.

### Multiple devices, mixed providers

```ts
mount(el, {
  devices: [
    {
      id: 'whatsapp',
      apiUrl: 'https://evolution.example.com',
      instanceToken: 'wa-token',
      instanceName: 'production',
      providerType: 'evolution',
    },
    {
      id: 'webchat',
      apiUrl: 'https://api.example.com',
      instanceToken: 'web-token',
      instanceName: 'webchat-channel',
      providerType: 'generic-server',
      endpoints: {
        chats:    'GET /webchat/{channelId}/conversations',
        messages: 'GET /webchat/{channelId}/conversations/{chatId}/messages?p={page}&size={pageSize}',
        sendText: 'POST /webchat/{channelId}/reply',
      },
      capabilities: {
        conversationInitiation: {
          canInitiate: false,
          identifierType: 'opaque',
        },
      },
    },
  ],
})
```

## Mock server

A working mock server is included for local development. It implements the full generic-server contract with fixture data.

### Running it

```bash
# With Docker (recommended)
make docker
# Generic server runs at http://localhost:3003

# Without Docker
npx tsx mock-server/generic-server-index.ts
```

### Test credentials

| Token | Instance | Contacts |
|-------|----------|----------|
| `generic-token-789` | `GENERIC1` | Alice Martin, Bob Chen |
| `generic-token-custom` | `GENERIC_CUSTOM` | Emma Wilson, David Kim, Support Team |

The first instance (`GENERIC1`) uses the default endpoints. The second (`GENERIC_CUSTOM`) exists to test custom endpoint configurations — see `devices.json` for the endpoint map that routes to its `/api/v2/...` paths.

### Mock server files

| File | Purpose |
|------|---------|
| `mock-server/generic-server-index.ts` | Entry point, serves on `GENERIC_PORT` (default 3003) |
| `mock-server/generic-server-app.ts` | All routes + auth + in-memory store |
| `mock-server/generic-fixtures.ts` | Fixture data for all generic instances |

### Auth

All requests require `Authorization: Bearer <token>`. Unknown tokens return 401. The `channelId` in the URL must match the instance resolved from the token.

### Delivery flow

Sent messages are stored in memory and appear immediately in subsequent `findChats`/`findMessages` responses. Unlike the Evolution mock (which simulates delivery progression and auto-replies), the generic mock keeps things simple — messages stay in `"sent"` status.

### Reset

```
POST /channels/:channelId/reset
Authorization: Bearer <token>
```

Wipes all in-memory state for the instance (sent messages, deletions). Useful in E2E tests.
