import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  GENERIC_TOKEN_TO_INSTANCE,
  genericFixturesByInstance,
  type NormalizedMessage,
} from './generic-fixtures.js';
import { broadcastToChannel } from './generic-ws.js';

// In-memory store for messages sent during the session (per instance:chatId)
const sentMessages = new Map<string, NormalizedMessage[]>();
// Deleted message IDs per instance
const deletedIds = new Map<string, Set<string>>();
// Chats marked as read per instance
const clearedChats = new Map<string, Set<string>>();

function getSent(instance: string, chatId: string): NormalizedMessage[] {
  const key = `${instance}:${chatId}`;
  if (!sentMessages.has(key)) sentMessages.set(key, []);
  return sentMessages.get(key)!;
}

function getDeleted(instance: string): Set<string> {
  if (!deletedIds.has(instance)) deletedIds.set(instance, new Set());
  return deletedIds.get(instance)!;
}

function getCleared(instance: string): Set<string> {
  if (!clearedChats.has(instance)) clearedChats.set(instance, new Set());
  return clearedChats.get(instance)!;
}

export const genericApp = new Hono();

// ── CORS ──────────────────────────────────────────────────────────────────────

genericApp.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// ── Auth — Bearer token ────────────────────────────────────────────────────────

genericApp.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();
  const authHeader = c.req.header('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || !(token in GENERIC_TOKEN_TO_INSTANCE)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return next();
});

// ── Helper: resolve instance from token ───────────────────────────────────────

function resolveInstance(c: { req: { header: (k: string) => string | undefined } }): string | null {
  const authHeader = c.req.header('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  return token ? (GENERIC_TOKEN_TO_INSTANCE[token] ?? null) : null;
}

// ── GET /channels/:channelId/status ───────────────────────────────────────────

genericApp.get('/channels/:channelId/status', (c) => {
  const channelId = c.req.param('channelId');
  const instance = resolveInstance(c);
  if (!instance || instance !== channelId || !genericFixturesByInstance[instance]) {
    return c.json({ error: 'Channel not found' }, 404);
  }
  return c.json({ state: 'open' });
});

// ── GET /channels/:channelId/chats ────────────────────────────────────────────

genericApp.get('/channels/:channelId/chats', (c) => {
  const channelId = c.req.param('channelId');
  const instance = resolveInstance(c);
  const fixtures = instance && instance === channelId ? genericFixturesByInstance[instance] : null;
  if (!fixtures) return c.json({ error: 'Channel not found' }, 404);

  const deleted = getDeleted(instance!);
  const cleared = getCleared(instance!);

  // Merge fixture chats with any sent messages that updated the last message
  const chats = fixtures.chats.map((chat) => {
    const sent = getSent(instance!, chat.id).filter((m) => !deleted.has(m.id));
    const unreadCount = cleared.has(chat.id) ? 0 : (chat.unreadCount ?? 0);
    if (sent.length === 0) return { ...chat, unreadCount };
    const latest = sent[sent.length - 1];
    return {
      ...chat,
      lastMessage: { content: latest.content, direction: latest.direction as 'inbound' | 'outbound', type: latest.messageType },
      lastActiveAt: latest.createdAt,
      unreadCount: 0, // our own sends don't add unread
    };
  });

  return c.json(chats);
});

// ── GET /channels/:channelId/chats/:chatId/messages ───────────────────────────

genericApp.get('/channels/:channelId/chats/:chatId/messages', (c) => {
  const channelId = c.req.param('channelId');
  const chatId = c.req.param('chatId');
  const instance = resolveInstance(c);
  const fixtures = instance && instance === channelId ? genericFixturesByInstance[instance] : null;
  if (!fixtures) return c.json({ error: 'Channel not found' }, 404);

  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const pageSize = Math.max(1, parseInt(c.req.query('pageSize') ?? '50', 10));

  const deleted = getDeleted(instance!);
  const fixture = (fixtures.messagesByChatId[chatId] ?? []).filter((m) => !deleted.has(m.id));
  const dynamic = getSent(instance!, chatId).filter((m) => !deleted.has(m.id));

  // Merge and deduplicate by id
  const seen = new Set<string>();
  const all: typeof fixture = [];
  for (const m of [...fixture, ...dynamic]) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      all.push(m);
    }
  }
  all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const messages = all.slice(start, start + pageSize);

  return c.json({
    messages,
    pagination: {
      currentPage: page,
      totalPages,
      total,
      hasMore: page < totalPages,
    },
  });
});

// ── POST /channels/:channelId/messages/text ───────────────────────────────────

genericApp.post('/channels/:channelId/messages/text', async (c) => {
  const channelId = c.req.param('channelId');
  const instance = resolveInstance(c);
  const fixtures = instance && instance === channelId ? genericFixturesByInstance[instance] : null;
  if (!fixtures) return c.json({ error: 'Channel not found' }, 404);

  const body = await c.req.json<{ to: string; body: string }>();
  const messageId = `gen-sent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const msg: NormalizedMessage = {
    id: messageId,
    direction: 'outbound',
    content: body.body,
    createdAt: new Date().toISOString(),
    status: 'sent',
    phoneNumber: body.to,
    hasMedia: false,
    messageType: 'text',
    reactionEmoji: null,
    reactedToMessageId: null,
  };
  getSent(instance!, body.to).push(msg);

  // Broadcast via WebSocket
  broadcastToChannel(instance!, { type: 'message.new', chatId: body.to, message: msg });

  return c.json({ messageId, status: 'sent' });
});

// ── POST /channels/:channelId/messages/media ──────────────────────────────────

genericApp.post('/channels/:channelId/messages/media', async (c) => {
  const channelId = c.req.param('channelId');
  const instance = resolveInstance(c);
  const fixtures = instance && instance === channelId ? genericFixturesByInstance[instance] : null;
  if (!fixtures) return c.json({ error: 'Channel not found' }, 404);

  const body = await c.req.json<{ to: string; mediaType: string; media: string; caption?: string; fileName?: string; mimeType?: string }>();
  const messageId = `gen-sent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const msg: NormalizedMessage = {
    id: messageId,
    direction: 'outbound',
    content: body.caption || body.fileName || body.mediaType,
    createdAt: new Date().toISOString(),
    status: 'sent',
    phoneNumber: body.to,
    hasMedia: true,
    messageType: body.mediaType,
    caption: body.caption ?? null,
    filename: body.fileName ?? null,
    mimeType: body.mimeType ?? null,
    reactionEmoji: null,
    reactedToMessageId: null,
  };
  getSent(instance!, body.to).push(msg);

  // Broadcast via WebSocket
  broadcastToChannel(instance!, { type: 'message.new', chatId: body.to, message: msg });

  return c.json({ messageId, status: 'sent' });
});

// ── POST /channels/:channelId/messages/buttons ────────────────────────────────

genericApp.post('/channels/:channelId/messages/buttons', async (c) => {
  const channelId = c.req.param('channelId');
  const instance = resolveInstance(c);
  const fixtures = instance && instance === channelId ? genericFixturesByInstance[instance] : null;
  if (!fixtures) return c.json({ error: 'Channel not found' }, 404);

  const body = await c.req.json<{ to: string; body: string }>();
  const messageId = `gen-sent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  return c.json({ messageId, status: 'sent' });
});

// ── GET /channels/:channelId/media/:messageId ─────────────────────────────────

genericApp.get('/channels/:channelId/media/:messageId', (c) => {
  // Generic server serves pre-signed URLs; the mock just returns a placeholder
  return c.json({ url: '' }, 404);
});

// ── POST /channels/:channelId/chats/:chatId/read — mark chat as read ─────────

genericApp.post('/channels/:channelId/chats/:chatId/read', (c) => {
  const channelId = c.req.param('channelId');
  const chatId = c.req.param('chatId');
  const instance = resolveInstance(c);
  if (!instance || instance !== channelId || !genericFixturesByInstance[instance]) {
    return c.json({ error: 'Channel not found' }, 404);
  }
  getCleared(instance).add(chatId);
  return new Response(null, { status: 204 });
});

// ── POST /channels/:channelId/reset — wipe in-memory test state ──────────────

genericApp.post('/channels/:channelId/reset', (c) => {
  const channelId = c.req.param('channelId');
  const instance = resolveInstance(c);
  if (!instance || instance !== channelId || !genericFixturesByInstance[instance]) {
    return c.json({ error: 'Channel not found' }, 404);
  }
  for (const key of sentMessages.keys()) {
    if (key.startsWith(`${instance}:`)) sentMessages.delete(key);
  }
  deletedIds.delete(instance);
  clearedChats.delete(instance);
  return new Response(null, { status: 204 });
});

// ── DELETE /channels/:channelId/messages/:messageId ───────────────────────────

genericApp.delete('/channels/:channelId/messages/:messageId', (c) => {
  const channelId = c.req.param('channelId');
  const messageId = c.req.param('messageId');
  const instance = resolveInstance(c);
  const fixtures = instance && instance === channelId ? genericFixturesByInstance[instance] : null;
  if (!fixtures) return c.json({ error: 'Channel not found' }, 404);

  getDeleted(instance!).add(messageId);
  return new Response(null, { status: 204 });
});

// ══════════════════════════════════════════════════════════════════════════════
// Custom endpoint routes (/api/v2/...) — demonstrates the endpoint map feature.
// These serve the same data as the default routes above, under different paths.
// The GENERIC_CUSTOM instance in devices.json uses an `endpoints` config that
// maps to these paths.
// ══════════════════════════════════════════════════════════════════════════════

genericApp.get('/api/v2/:channelId/health', (c) => {
  const channelId = c.req.param('channelId');
  const instance = resolveInstance(c);
  if (!instance || instance !== channelId || !genericFixturesByInstance[instance]) {
    return c.json({ error: 'Channel not found' }, 404);
  }
  return c.json({ state: 'open' });
});

genericApp.get('/api/v2/:channelId/conversations', (c) => {
  const channelId = c.req.param('channelId');
  const instance = resolveInstance(c);
  const fixtures = instance && instance === channelId ? genericFixturesByInstance[instance] : null;
  if (!fixtures) return c.json({ error: 'Channel not found' }, 404);

  const deleted = getDeleted(instance!);
  const cleared = getCleared(instance!);
  const chats = fixtures.chats.map((chat) => {
    const sent = getSent(instance!, chat.id).filter((m) => !deleted.has(m.id));
    const unreadCount = cleared.has(chat.id) ? 0 : (chat.unreadCount ?? 0);
    if (sent.length === 0) return { ...chat, unreadCount };
    const latest = sent[sent.length - 1];
    return {
      ...chat,
      lastMessage: { content: latest.content, direction: latest.direction as 'inbound' | 'outbound', type: latest.messageType },
      lastActiveAt: latest.createdAt,
      unreadCount: 0,
    };
  });
  return c.json(chats);
});

genericApp.get('/api/v2/:channelId/conversations/:chatId/history', (c) => {
  const channelId = c.req.param('channelId');
  const chatId = c.req.param('chatId');
  const instance = resolveInstance(c);
  const fixtures = instance && instance === channelId ? genericFixturesByInstance[instance] : null;
  if (!fixtures) return c.json({ error: 'Channel not found' }, 404);

  const page = Math.max(1, parseInt(c.req.query('p') ?? '1', 10));
  const pageSize = Math.max(1, parseInt(c.req.query('limit') ?? '50', 10));

  const deleted = getDeleted(instance!);
  const fixture = (fixtures.messagesByChatId[chatId] ?? []).filter((m) => !deleted.has(m.id));
  const dynamic = getSent(instance!, chatId).filter((m) => !deleted.has(m.id));

  const seen = new Set<string>();
  const all: typeof fixture = [];
  for (const m of [...fixture, ...dynamic]) {
    if (!seen.has(m.id)) { seen.add(m.id); all.push(m); }
  }
  all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const messages = all.slice(start, start + pageSize);

  return c.json({ messages, pagination: { currentPage: page, totalPages, total, hasMore: page < totalPages } });
});

genericApp.post('/api/v2/:channelId/send/text', async (c) => {
  const channelId = c.req.param('channelId');
  const instance = resolveInstance(c);
  const fixtures = instance && instance === channelId ? genericFixturesByInstance[instance] : null;
  if (!fixtures) return c.json({ error: 'Channel not found' }, 404);

  const body = await c.req.json<{ to: string; body: string }>();
  const messageId = `gen-sent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const msg: NormalizedMessage = {
    id: messageId, direction: 'outbound', content: body.body,
    createdAt: new Date().toISOString(), status: 'sent', phoneNumber: body.to,
    hasMedia: false, messageType: 'text', reactionEmoji: null, reactedToMessageId: null,
  };
  getSent(instance!, body.to).push(msg);
  broadcastToChannel(instance!, { type: 'message.new', chatId: body.to, message: msg });
  return c.json({ messageId, status: 'sent' });
});

genericApp.post('/api/v2/:channelId/send/media', async (c) => {
  const channelId = c.req.param('channelId');
  const instance = resolveInstance(c);
  const fixtures = instance && instance === channelId ? genericFixturesByInstance[instance] : null;
  if (!fixtures) return c.json({ error: 'Channel not found' }, 404);

  const body = await c.req.json<{ to: string; mediaType: string; media: string; caption?: string; fileName?: string; mimeType?: string }>();
  const messageId = `gen-sent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const msg: NormalizedMessage = {
    id: messageId, direction: 'outbound', content: body.caption || body.fileName || body.mediaType,
    createdAt: new Date().toISOString(), status: 'sent', phoneNumber: body.to,
    hasMedia: true, messageType: body.mediaType, caption: body.caption ?? null,
    filename: body.fileName ?? null, mimeType: body.mimeType ?? null,
    reactionEmoji: null, reactedToMessageId: null,
  };
  getSent(instance!, body.to).push(msg);
  broadcastToChannel(instance!, { type: 'message.new', chatId: body.to, message: msg });
  return c.json({ messageId, status: 'sent' });
});

genericApp.post('/api/v2/:channelId/send/buttons', async (c) => {
  const channelId = c.req.param('channelId');
  const instance = resolveInstance(c);
  const fixtures = instance && instance === channelId ? genericFixturesByInstance[instance] : null;
  if (!fixtures) return c.json({ error: 'Channel not found' }, 404);

  const messageId = `gen-sent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return c.json({ messageId, status: 'sent' });
});

genericApp.get('/api/v2/:channelId/attachments/:messageId', (c) => {
  return c.json({ url: '' }, 404);
});

genericApp.delete('/api/v2/:channelId/history/:messageId', (c) => {
  const channelId = c.req.param('channelId');
  const messageId = c.req.param('messageId');
  const instance = resolveInstance(c);
  const fixtures = instance && instance === channelId ? genericFixturesByInstance[instance] : null;
  if (!fixtures) return c.json({ error: 'Channel not found' }, 404);

  getDeleted(instance!).add(messageId);
  return new Response(null, { status: 204 });
});

genericApp.post('/api/v2/:channelId/conversations/:chatId/read', (c) => {
  const channelId = c.req.param('channelId');
  const chatId = c.req.param('chatId');
  const instance = resolveInstance(c);
  if (!instance || instance !== channelId || !genericFixturesByInstance[instance]) {
    return c.json({ error: 'Channel not found' }, 404);
  }
  getCleared(instance).add(chatId);
  return new Response(null, { status: 204 });
});

genericApp.post('/api/v2/:channelId/reset', (c) => {
  const channelId = c.req.param('channelId');
  const instance = resolveInstance(c);
  if (!instance || instance !== channelId || !genericFixturesByInstance[instance]) {
    return c.json({ error: 'Channel not found' }, 404);
  }
  for (const key of sentMessages.keys()) {
    if (key.startsWith(`${instance}:`)) sentMessages.delete(key);
  }
  deletedIds.delete(instance);
  clearedChats.delete(instance);
  return new Response(null, { status: 204 });
});
