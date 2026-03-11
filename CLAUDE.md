# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Skills

- **th0th-memory** (`~/.claude/skills/th0th-memory/SKILL.md`) — Prioritize th0th MCP tools (`th0th_index`, `th0th_search`, `th0th_remember`, `th0th_recall`, `th0th_compress`, `th0th_optimized_context`, `th0th_analytics`) over native tools (Glob, Grep, Read) for code search, architecture understanding, storing decisions, and context compression. Use native tools only as fallback.

## Commands

Available via `make` (run `make help` to list all):

```bash
make install         # Install dependencies
make dev             # Start Vite dev server (reads devices.json)
make build           # Build library (ES + UMD + CSS + .d.ts) → dist/
make preview         # Serve built library locally
make lint            # Run ESLint
make typecheck       # Run TypeScript type check
make clean           # Remove dist and node_modules
make test            # Run unit tests (Vitest)
make test-e2e        # Run e2e tests — requires: make docker
make example-vue3    # Build library and serve Vue 3 example at localhost:5174 — requires: make docker
make mock            # Start mock server + dev server locally (no Docker, no real API)
make docker          # Start full stack with Docker Compose (detached, with build)
make docker-build    # Rebuild Docker images from scratch
make docker-down     # Stop Docker Compose stack
make docker-restart  # Stop, rebuild, and restart Docker Compose stack
```

Release commands live in a gitignored `justfile` (requires [just](https://github.com/casey/just)):

```bash
just release-minor   # Bump minor version, push, and create GitHub release
just release-major   # Bump major version, push, and create GitHub release
```

## Architecture

Embeddable WhatsApp inbox UI library built with Vite (library mode) + Preact + Tailwind CSS v4. No backend — all API calls happen directly from the browser via the provider abstraction.

### Entry Point

`src/index.ts` exports a `mount(element, config)` / `unmount(element)` API for framework-agnostic embedding, plus React components and types for direct React usage.

```ts
import { mount } from '@ivanamato/whatsapp-inbox'
import '@ivanamato/whatsapp-inbox/style.css'

const inbox = mount(el, {
  devices: [{
    id: 'main',
    apiUrl: 'https://your-evolution-api.com',
    instanceToken: 'your-per-instance-token',
    instanceName: 'your-instance',
  }],
})
inbox.unmount()
```

### Provider System

Components call the WhatsApp API directly via `useProvider()` hook (no API routes). The provider is injected via `ProviderProvider` React context.

- **`src/lib/providers/types.ts`** — `WhatsAppProvider` interface and normalized types (`DeviceConfig`, `Chat`, `Message`, etc.)
- **`src/lib/providers/evolution.ts`** — Evolution API v2 implementation (browser `fetch()`, no Node.js APIs). Authenticates with per-instance tokens (not the global API key).
- **`src/lib/providers/index.ts`** — `createProvider(type, apiUrl, instanceToken)` factory
- **`src/lib/provider-context.tsx`** — React context (`ProviderProvider` / `useProvider()`)

To add a new provider: implement `WhatsAppProvider`, add a case in `createProvider()`.

### Frontend

`src/App.tsx` is the main app component, composed of:

- **`InstanceSelector`** — Dropdown to pick a WhatsApp instance
- **`ConversationList`** — Left sidebar with chat list (exposes `refresh()` via ref)
- **`MessageView`** — Right panel with message thread and composer

`src/dev.tsx` is the dev server entry point (reads `devices.json`, calls `mount()`, exposes `window.__whatsappInbox`).

Auto-polling via `src/hooks/use-auto-polling.ts` (10s conversations, 5s messages, pauses when tab hidden).

#### Chat list reactivity

`ConversationList` exposes `refresh()` via a ref (`ConversationListRef`). `App.tsx` holds the ref and passes callbacks that call it:
- `onTemplateSent` — refreshes after a template is sent
- `onMessageSent` — refreshes immediately after every regular send (text, media, buttons)

`onMessageSent` is threaded through: `App.tsx` → `MessageView` prop → `useMessageThread` hook option → called after `fetchInitialMessages()` resolves.

### Use Cases

Business logic lives in `src/use-cases/`:

- **`use-app-state.ts`** — Top-level state: selected conversation, device switching, keyboard navigation, `onMessageSent` / `onTemplateSent` wiring
- **`use-chat-list.ts`** — Chat list fetching, polling (10s), tag resolution
- **`use-message-thread.ts`** — Message thread, pagination, optimistic sends, file handling, `onMessageSent` callback
- **`use-device-status.ts`** — Connection status polling

### Key Patterns

- **`selectConversation(phone, prefill?, deviceId?)`** on the `WhatsAppInbox` object opens a conversation programmatically. In `single` viewMode, if `deviceId` differs from the active device the inbox switches device first, then calls `ConversationListRef.refresh()` on the new device's chat list before selecting — this prevents matching against stale data from the previous device. In `all` (merged) viewMode no device switch occurs; `deviceId` is passed to `selectByPhoneNumber` only to disambiguate duplicates. A nonce-based `prefillToken` is used so the prefill is applied exactly once per call and never re-applied on subsequent manual chat switches.
- **`openChat(phone, { prefillMessage?, deviceId? }?)`** is like `selectConversation` but always opens a view even when the phone number has no existing chat. If not found after refresh, it creates a synthetic `Conversation` (`id = phoneNumber`) and passes it directly to `onSelectConversation`. The Evolution API provider auto-appends `@s.whatsapp.net` when `chatId` has no `@`, so bare phone numbers work without conversion. Implemented in `ConversationListRef.openChat`, wired through `ImperativeApiBridge.openChat` with its own `pendingOpenPhone` state for cross-device switches.
- **Chat actions always visible.** The three-dot (⋮) button renders on every chat row regardless of whether `chatActions` is configured. Clicking it always opens the contact panel (profile picture, name, phone, device). Custom action buttons only appear if a `chatActions` resolver is provided. `resolver` is therefore optional on `ChatActionsDialog`.
- **Chat tags & filtering.** `chatTags` async resolver on config returns colored tag pills per chat. Tags are resolved eagerly for all visible chats. Users can filter the conversation list by clicking tag chips above the list (AND logic). Types: `ChatTag`, `ChatTagsResolver`.
- **No backend.** Components call `provider.findChats()`, `provider.sendText()`, etc. directly. Requires CORS on the Evolution API (`CORS_ORIGIN=*`). Uses per-instance tokens (not the global API key) so each device can only access its own instance.
- **Per-instance tokens.** Each device authenticates with its own scoped token from the Evolution API. The token is generated when the instance is created and only grants access to that single instance. Never use the global API key in the browser.
- **Tailwind v4 prefix.** All classes use `wa:` prefix (e.g. `wa:flex`, `wa:p-4`) to avoid collisions when embedded in host apps. CSS vars are namespaced as `--wa-*`.
- **JID/LID deduplication.** WhatsApp uses both phone-based JIDs (`number@s.whatsapp.net`) and anonymous Logical IDs (`randomid@lid`). The provider merges these using `remoteJidAlt`.
- **Media as base64.** `provider.getMediaUrl()` returns data URIs. File uploads are read client-side via `FileReader` before sending to `provider.sendMedia()`.
- **Optimistic sends.** Messages appear immediately in the thread with a `pending` status. On success `fetchInitialMessages()` reconciles with server state, then `onMessageSent()` refreshes the chat list.
- **UI components** use shadcn/ui (Radix + Tailwind) in `src/components/ui/`.

### Build Output

Vite library mode produces:
- `dist/whatsapp-inbox.es.js` — ES module
- `dist/whatsapp-inbox.umd.js` — UMD module
- `dist/whatsapp-inbox.css` — Prefixed styles
- `dist/index.d.ts` — TypeScript declarations

## Mock Server

`mock-server/` is a [Hono](https://hono.dev/) HTTP server that replicates the Evolution API v2 contract for local development. No real WhatsApp credentials needed.

### Files

- **`mock-server/index.ts`** — Entry point; serves on `MOCK_PORT` (default `3002`)
- **`mock-server/app.ts`** — All Evolution API routes + auth middleware + helpers
- **`mock-server/fixtures.ts`** — Static fixture data organised by instance (`fixturesByInstance`). Exports `MOCK1` and `MOCK2` each with their own `chats`, `contacts`, and `messagesByJid` maps.
- **`mock-server/store.ts`** — `MockStore` class: in-memory state scoped per instance. Tracks sent messages, incoming replies, media payloads, dynamic contacts, pending unread counts, and deleted IDs.

### Endpoints

| Endpoint | Notes |
|---|---|
| `GET /instance/connectionState/:instance` | Static `open` state |
| `POST /chat/findChats/:instance` | Dynamic: merges fixtures + store, recomputes `lastMessage`/`updatedAt`/`unreadCount`, sorts by recency, creates new chat entries for unknown JIDs |
| `POST /chat/findContacts/:instance` | Merges fixture contacts + store dynamic contacts |
| `POST /chat/findMessages/:instance` | Merges fixtures + store, deduplicates by message ID, clears unread for the JID (simulates opening) |
| `POST /chat/getBase64FromMediaMessage/:instance` | Returns stored base64 for sent media; falls back to 1×1 red PNG for fixture media |
| `POST /message/sendText/:instance` | Stores message, schedules delivery progression + auto-reply |
| `POST /message/sendMedia/:instance` | Stores message + base64 payload, schedules delivery + auto-reply |
| `POST /message/sendButtons/:instance` | Stores full `buttonsMessage` structure, schedules delivery + auto-reply |
| `DELETE /chat/deleteMessageForEveryone/:instance` | Adds ID to deleted set; emits `protocolMessage` REVOKE into store |

### Auth

All routes (except CORS preflight) require an `apikey` header matching a known token:
- `mock-token-123` → `MOCK1`
- `mock-token-456` → `MOCK2`

Unknown tokens return 401. Unknown instances return 404.

### Delivery & auto-reply flow

```
sendText/sendMedia/sendButtons called
  → message stored with status PENDING
  → 300ms  : status → SERVER_ACK
  → 1500ms : status → DELIVERY_ACK
  → 2000–3000ms : status → READ, then auto-reply added to store
```

Auto-reply uses the real contact name from fixtures or store. For group chats, a random fixture participant is selected as sender.

### JID resolution

`resolveJid(number, fixtures)` reconstructs the full JID from a bare number. The Evolution API provider calls `stripJid()` before sending (removing `@g.us`, `@s.whatsapp.net`, `@lid`). The mock restores the correct suffix by matching against known fixture JIDs, defaulting to `@s.whatsapp.net` for unknowns. This is critical for group chats — without it, messages to groups create duplicate chat entries.

### Two mock instances

- **`MOCK1`** — Brazilian contacts: Ana Beatriz, Carlos Eduardo (with @lid pair), Equipe Vendas 🚀 (group), Fernanda Lima, Roberto Mendes
- **`MOCK2`** — International contacts: Sarah Johnson, James Wright, Product Team 💡 (group), Miguel Torres

## Generic Server Mock

`mock-server/generic-server-app.ts` implements the `generic-server` provider contract. Serves normalized types directly (no Evolution API translation). Runs on port 3003.

See **[docs/generic-server.md](docs/generic-server.md)** for the full endpoint contract, data shapes, and integration guide.

### Files

| File | Purpose |
|---|---|
| `mock-server/generic-server-index.ts` | Entry point (`GENERIC_PORT`, default 3003) |
| `mock-server/generic-server-app.ts` | All routes (default + custom `/api/v2/` paths) |
| `mock-server/generic-fixtures.ts` | Fixture data for GENERIC1 and GENERIC_CUSTOM |

### Instances

| Token | Instance | Contacts | Endpoint style |
|---|---|---|---|
| `generic-token-789` | `GENERIC1` | Alice Martin, Bob Chen | Default (`/channels/...`) |
| `generic-token-custom` | `GENERIC_CUSTOM` | Emma Wilson, David Kim, Support Team | Custom (`/api/v2/...`) |

### Custom Endpoints

The `GenericServerEndpoints` type on `DeviceConfig.endpoints` lets consumers remap every URL. Each value is `"METHOD /path/{placeholder}"`. Placeholders: `{channelId}`, `{chatId}`, `{messageId}`, `{page}`, `{pageSize}`. Omitted keys use defaults. See `devices.json` device `mock-device-4` for a working example.

### Docker

```yaml
# docker-compose.yml
mock-server:  port 3002, command: npx tsx mock-server/index.ts
frontend:     port 5173, command: npx vite --host 0.0.0.0 --port 5173
```

Both services share the same `Dockerfile` (node:20-alpine, `npm ci` only). Source is volume-mounted for HMR. `node_modules` use an anonymous volume to isolate Linux binaries from the host macOS ones.

The browser talks directly to `localhost:3002` (cross-port, same host). `index.html` CSP allows `http://localhost:* ws://localhost:*` for this.

## Testing

Two test layers, both targeting the docker stack for e2e.

### Unit tests — Vitest (`make test`)

- Runner: Vitest + jsdom + `@testing-library/preact`
- Location: `tests/unit/` — no server required
- Files: `src/providers/evolution.test.ts`, `use-cases/use-chat-list.test.ts`, `use-cases/use-message-thread.test.ts`
- Setup: `tests/unit/setup.ts` (imports `@testing-library/jest-dom`)

### E2E tests — Playwright (`make test-e2e`)

Requires the docker stack (`make docker`). Tests hit the real frontend at `localhost:5173`, which calls the real mock server at `localhost:3002`. No route interception.

```
tests/e2e/
  pages/
    conversation-list.page.ts   # ConversationListPage POM
    message-thread.page.ts      # MessageThreadPage POM
    chat-actions.page.ts        # ChatActionsPage POM
  chat-list.spec.ts
  message-thread.spec.ts
  chat-actions.spec.ts
  open-conversation.spec.ts     # selectConversation API (prefill + device selection)
```

**Conventions:**
- Always use POMs — never inline selectors in spec files
- Use `waitForLoaded()` not `waitForTimeout()`
- `beforeEach`: `page.goto('/')` → `chatList.waitForLoaded()`
- Assertions use fixture data from MOCK1/MOCK2 (see `mock-server/fixtures.ts`)
- New interactive elements need `data-testid="kebab-case"` added to JSX

**`playwright.config.ts`:** `baseURL: http://localhost:5173`, `testDir: ./tests/e2e`, no `webServer`.

**Key `data-testid` attributes:**

| Component | testid | Notes |
|---|---|---|
| `conversation-list.tsx` | `conversation-list` | Outer sidebar |
| | `search-input` | Search field |
| | `chat-item` + `data-chat-name` | Virtual row button |
| | `unread-badge` | Only when `unreadCount > 0` |
| `message-view.tsx` | `message-thread` | Loaded state only |
| | `message-bubble` + `data-direction` | Per-message wrapper |
| | `message-input` | Composer text input |
| | `send-button` | Submit button |
| `chat-actions-menu.tsx` | `chat-menu-trigger` | Three-dot button |
| | `chat-actions-panel` | Dialog panel |
| | `chat-actions-contact-name` | Contact name in panel |
| | `chat-actions-phone-number` | Phone in panel |
| | `chat-actions-close` | X button |
| | `chat-action-button` + `data-action-id` | Custom action button |
| `instance-selector.tsx` | `merge-devices-toggle` | View-mode switch (`role="switch"`, `aria-checked`) |

### Vue 3 example (`make example-vue3`)

Builds the library then serves the project root at `localhost:5174`. The example at `http://localhost:5174/examples/vue3/` points to the docker mock server at `localhost:3002` (MOCK1 + MOCK2 instances). Requires `make docker` to be running first.

## Dev Testing Sidebar

When running the dev server (`make docker` or `make mock`), a 260px sidebar appears on the right side of the page — outside the inbox component, so it never overlaps the UI.

**Location:** `src/dev.tsx` (DOM built imperatively after `mount()`). Layout defined in `index.html` (`#layout` flex row, `#app` + `#dev-sidebar`).

**Helper functions available inside `loadConfig().then(...)`:**
- `section(title)` — appends a labelled group to the sidebar, returns the wrapper `<div>` to append buttons into
- `btn(label, onClick, accent?)` — creates a full-width button; default accent `#00a884` (green), use `#2563eb` (blue) for prefill variants

**Current sections:**
- *Open conversation* — one button per contact (MOCK1 + MOCK2), calls `inbox.selectConversation(phone, undefined, deviceId)`
- *Generic custom endpoints* — purple buttons for GENERIC_CUSTOM contacts (device 4), demonstrates custom endpoint routing
- *Open with prefill* — blue buttons calling `inbox.selectConversation(phone, prefillText, deviceId)`

**To add a new section**, append `section()` + `btn()` calls after the existing ones in `dev.tsx`. The sidebar is scrollable so sections can grow freely.

**`window.__whatsappInbox`** is also exposed for quick console testing:
```js
__whatsappInbox.selectConversation('556992924255', 'Hello!', 'mock-device-1')
```

## Environment

`devices.json` is read by the Vite dev server middleware (`serveDevicesJson` in `vite.config.ts`) and served to the browser at `/devices.json`. The middleware only serves the file to loopback connections (`127.0.0.1`, `::1`) to prevent token leakage when the dev server is exposed on a network.

The current `devices.json` is pre-configured for the mock servers:

| Device | Provider | Port | Instance | Notes |
|---|---|---|---|---|
| `mock-device-1` | evolution | 3002 | MOCK1 | Brazilian contacts |
| `mock-device-2` | evolution | 3002 | MOCK2 | International contacts |
| `mock-device-3` | generic-server | 3003 | GENERIC1 | Default endpoints |
| `mock-device-4` | generic-server | 3003 | GENERIC_CUSTOM | Custom `/api/v2/` endpoints |

To switch to a real Evolution API, replace `devices.json` with real credentials. The loopback guard in `serveDevicesJson` still applies — tokens are never served to non-localhost clients.

To get the per-instance token: call `GET /instance/fetchInstances` with the global API key and look for the `token` field on each instance. Use that as `instanceToken`.

## Publishing

Package is published to [npm](https://www.npmjs.com/package/@ivanamato/whatsapp-inbox) as `@ivanamato/whatsapp-inbox`. A GitHub Actions workflow (`.github/workflows/publish.yml`) automatically builds and publishes on every GitHub Release using Trusted Publishing (OIDC).

- **Release commands:** `just release-minor` or `just release-major` bump the version, push the tag, and create a GitHub release (which triggers the publish workflow). The justfile is gitignored.
- **`publishConfig`** in `package.json` sets `"access": "public"`.
