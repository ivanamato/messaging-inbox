/**
 * Evolution API mock server routes.
 *
 * Route handlers are thin orchestrators that delegate to services.
 * Business logic lives in ./services/ following Single Responsibility Principle.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  connectionState,
  fixturesByInstance,
  RED_PIXEL_PNG_BASE64,
  type EvolutionMessageFixture,
  type InstanceFixtures,
} from './fixtures.js';
import { store } from './store.js';
import {
  JidResolver,
  ContactNameResolver,
  ChatMerger,
  DeliveryScheduler,
} from './services/index.js';
import { PAGINATION, VALID_TOKENS } from './config/index.js';

// ── Service initialization ────────────────────────────────────────────────────

const jidResolver = new JidResolver();
const contactNameResolver = new ContactNameResolver(store);
const chatMerger = new ChatMerger(store, contactNameResolver);
const deliveryScheduler = new DeliveryScheduler(store, contactNameResolver);

// ── App setup ─────────────────────────────────────────────────────────────────

export const app = new Hono();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'apikey', 'Authorization'],
}));

// ── Auth middleware ───────────────────────────────────────────────────────────

app.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();
  const apikey = c.req.header('apikey');
  if (!apikey || !VALID_TOKENS.has(apikey)) {
    return c.json({ error: 'Unauthorized', status: 401 }, 401);
  }
  return next();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFixtures(instance: string): InstanceFixtures | null {
  return fixturesByInstance[instance] ?? null;
}

function notFound(c: typeof app) {
  return c.json({ error: 'Instance not found' }, 404);
}

// ── Connection State ──────────────────────────────────────────────────────────

app.get('/instance/connectionState/:instance', (c) => {
  const instance = c.req.param('instance');
  if (!getFixtures(instance)) return notFound(c);
  return c.json(connectionState);
});

// ── Find Chats ────────────────────────────────────────────────────────────────

app.post('/chat/findChats/:instance', (c) => {
  const instance = c.req.param('instance');
  const fixtures = getFixtures(instance);
  if (!fixtures) return notFound(c);

  const chats = chatMerger.merge(instance, fixtures);
  return c.json(chats);
});

// ── Test reset ────────────────────────────────────────────────────────────────

app.post('/test/reset/:instance', (c) => {
  const instance = c.req.param('instance');
  if (!getFixtures(instance)) return notFound(c);
  store.reset(instance);
  return new Response(null, { status: 204 });
});

// ── Find Contacts ─────────────────────────────────────────────────────────────

app.post('/chat/findContacts/:instance', (c) => {
  const instance = c.req.param('instance');
  const fixtures = getFixtures(instance);
  if (!fixtures) return notFound(c);

  const contactMap = new Map(fixtures.contacts.map((c) => [c.remoteJid, c]));
  for (const dc of store.getDynamicContacts(instance)) {
    contactMap.set(dc.remoteJid, dc);
  }
  return c.json(Array.from(contactMap.values()));
});

// ── Find Messages ─────────────────────────────────────────────────────────────

app.post('/chat/findMessages/:instance', async (c) => {
  const instance = c.req.param('instance');
  const fixtures = getFixtures(instance);
  if (!fixtures) return notFound(c);

  const body = await c.req.json<{
    where?: { key?: { remoteJid?: string; id?: string } };
    page?: number;
    offset?: number;
    limit?: number;
  }>();

  const { where, page, offset, limit } = body;

  // Case 1: lookup by message id (for getMediaUrl flow)
  if (where?.key?.id) {
    const msgId = where.key.id;
    let found: EvolutionMessageFixture | undefined;
    for (const msgs of Object.values(fixtures.messagesByJid)) {
      found = msgs.find((m) => m.key.id === msgId);
      if (found) break;
    }
    if (!found) found = store.getMessageById(instance, msgId);
    return c.json({ messages: { records: found ? [found] : [] } });
  }

  const remoteJid = where?.key?.remoteJid;
  if (!remoteJid) return c.json({ messages: { records: [] } });

  const baseMessages: EvolutionMessageFixture[] = fixtures.messagesByJid[remoteJid] ?? [];
  const storedMsgs = store.getMessagesForJid(instance, remoteJid);
  const deletedIds = store.deletedIds(instance);

  // Merge, sort by timestamp, deduplicate by message ID
  const seen = new Set<string>();
  const allMessages = [...baseMessages, ...storedMsgs]
    .sort((a, b) => (a.messageTimestamp ?? 0) - (b.messageTimestamp ?? 0))
    .filter((m) => {
      if (deletedIds.has(m.key.id)) return false;
      if (seen.has(m.key.id)) return false;
      seen.add(m.key.id);
      return true;
    });

  // Case 2: paginated (page param present)
  if (typeof page === 'number') {
    const pageSize = typeof offset === 'number' ? offset : PAGINATION.MESSAGES_PER_PAGE;
    const effectivePageSize = Math.min(pageSize, PAGINATION.MESSAGES_PER_PAGE);
    const total = allMessages.length;
    const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));
    const safePage = Math.max(1, Math.min(page, totalPages));
    const reversed = [...allMessages].reverse();
    const startIdx = (safePage - 1) * effectivePageSize;
    const records = reversed.slice(startIdx, startIdx + effectivePageSize).reverse();
    return c.json({ messages: { total, pages: totalPages, currentPage: safePage, records } });
  }

  // Case 3: plain with optional limit
  const effectiveLimit = typeof limit === 'number' ? limit : 50;
  return c.json({ messages: { records: allMessages.slice(-effectiveLimit) } });
});

// ── Mark as Read ──────────────────────────────────────────────────────────────

app.put('/chat/markMessageAsRead/:instance', async (c) => {
  const instance = c.req.param('instance');
  if (!getFixtures(instance)) return notFound(c);

  const body = await c.req.json<{ readMessages?: Array<{ remoteJid?: string }> }>();
  for (const entry of body.readMessages ?? []) {
    if (entry.remoteJid) store.clearUnread(instance, entry.remoteJid);
  }
  return c.json({ success: true });
});

// ── Get Media (Base64) ────────────────────────────────────────────────────────

app.post('/chat/getBase64FromMediaMessage/:instance', async (c) => {
  const instance = c.req.param('instance');
  if (!getFixtures(instance)) return notFound(c);

  const body = await c.req.json<{
    message?: { key?: { id?: string }; message?: Record<string, unknown> };
    convertToMp4?: boolean;
  }>();

  // Return actual stored media if available (sent via sendMedia this session)
  const msgId = body?.message?.key?.id;
  if (msgId) {
    const stored = store.getMedia(instance, msgId);
    if (stored) return c.json({ base64: stored.base64, mimetype: stored.mimetype });
  }

  // Fallback for fixture media: infer MIME type and return a placeholder
  const msg = body?.message?.message as Record<string, unknown> | undefined;
  let mimetype = 'image/jpeg';
  if (msg) {
    if (msg.imageMessage) mimetype = ((msg.imageMessage as { mimetype?: string }).mimetype) || 'image/jpeg';
    else if (msg.videoMessage) mimetype = ((msg.videoMessage as { mimetype?: string }).mimetype) || 'video/mp4';
    else if (msg.audioMessage) mimetype = ((msg.audioMessage as { mimetype?: string }).mimetype) || 'audio/ogg';
    else if (msg.documentMessage) mimetype = ((msg.documentMessage as { mimetype?: string }).mimetype) || 'application/pdf';
    else if (msg.stickerMessage) mimetype = ((msg.stickerMessage as { mimetype?: string }).mimetype) || 'image/webp';
  }
  return c.json({ base64: RED_PIXEL_PNG_BASE64, mimetype });
});

// ── Send Text ─────────────────────────────────────────────────────────────────

app.post('/message/sendText/:instance', async (c) => {
  const instance = c.req.param('instance');
  const fixtures = getFixtures(instance);
  if (!fixtures) return notFound(c);

  const body = await c.req.json<{ number: string; text: string }>();
  const id = `sent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const jid = jidResolver.resolve(body.number, fixtures);

  // Register unknown contacts so they appear in contact list and chat names resolve
  const knownInFixtures = fixtures.contacts.some((ct) => ct.remoteJid === jid);
  if (!knownInFixtures && !store.getContact(instance, jid)) {
    store.upsertContact(instance, {
      remoteJid: jid,
      pushName: jid.split('@')[0],
      profilePicUrl: null,
    });
  }

  store.addMessage(instance, {
    key: { remoteJid: jid, fromMe: true, id },
    messageType: 'conversation',
    messageTimestamp: Math.floor(Date.now() / 1000),
    MessageUpdate: [{ status: 'PENDING' }],
    message: { conversation: body.text },
  });

  deliveryScheduler.schedule(instance, id, jid, fixtures);
  return c.json({ key: { id }, status: 'PENDING' });
});

// ── Send Media ────────────────────────────────────────────────────────────────

app.post('/message/sendMedia/:instance', async (c) => {
  const instance = c.req.param('instance');
  const fixtures = getFixtures(instance);
  if (!fixtures) return notFound(c);

  const body = await c.req.json<{
    number: string;
    mediatype: string;
    media: string;
    caption?: string;
    fileName?: string;
    mimetype?: string;
    ptt?: boolean;
  }>();

  const id = `sent-media-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const jid = jidResolver.resolve(body.number, fixtures);
  const mediatype = body.mediatype?.toLowerCase() ?? 'document';
  const mimetype =
    body.mimetype ??
    (mediatype === 'image'
      ? 'image/jpeg'
      : mediatype === 'video'
        ? 'video/mp4'
        : mediatype === 'audio'
          ? 'audio/ogg'
          : 'application/octet-stream');

  // Store actual base64 so getBase64FromMediaMessage can return it later
  store.storeMedia(instance, id, body.media, mimetype);

  // Compute real byte size from base64 (strip padding then calculate)
  const byteLength = Math.floor(body.media.replace(/=+$/, '').length * 3 / 4);

  let messageContent: Record<string, unknown>;
  if (mediatype === 'image') {
    messageContent = { imageMessage: { mimetype, caption: body.caption ?? '', fileName: body.fileName ?? 'image.jpg', fileLength: byteLength } };
  } else if (mediatype === 'video') {
    messageContent = { videoMessage: { mimetype, caption: body.caption ?? '', fileName: body.fileName ?? 'video.mp4', fileLength: byteLength } };
  } else if (mediatype === 'audio') {
    messageContent = { audioMessage: { mimetype, fileName: body.fileName ?? 'audio.ogg', fileLength: byteLength, ptt: body.ptt ?? false } };
  } else {
    messageContent = { documentMessage: { mimetype, title: body.fileName ?? 'document', fileName: body.fileName ?? 'document', fileLength: byteLength, caption: body.caption ?? '' } };
  }

  store.addMessage(instance, {
    key: { remoteJid: jid, fromMe: true, id },
    messageType: `${mediatype}Message`,
    messageTimestamp: Math.floor(Date.now() / 1000),
    MessageUpdate: [{ status: 'PENDING' }],
    message: messageContent,
  });

  deliveryScheduler.schedule(instance, id, jid, fixtures);
  return c.json({ key: { id }, status: 'PENDING' });
});

// ── Send Buttons ──────────────────────────────────────────────────────────────

app.post('/message/sendButtons/:instance', async (c) => {
  const instance = c.req.param('instance');
  const fixtures = getFixtures(instance);
  if (!fixtures) return notFound(c);

  const body = await c.req.json<{
    number: string;
    title?: string;
    description: string;
    buttons: unknown[];
  }>();

  const id = `sent-btn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const jid = jidResolver.resolve(body.number, fixtures);

  store.addMessage(instance, {
    key: { remoteJid: jid, fromMe: true, id },
    messageType: 'buttonsMessage',
    messageTimestamp: Math.floor(Date.now() / 1000),
    MessageUpdate: [{ status: 'PENDING' }],
    message: {
      buttonsMessage: {
        contentText: body.description,
        headerText: body.title,
        buttons: body.buttons,
      },
    },
  });

  deliveryScheduler.schedule(instance, id, jid, fixtures);
  return c.json({ key: { id }, status: 'PENDING' });
});

// ── Delete Message ────────────────────────────────────────────────────────────

app.delete('/chat/deleteMessageForEveryone/:instance', async (c) => {
  const instance = c.req.param('instance');
  if (!getFixtures(instance)) return notFound(c);

  const body = await c.req.json<{ id: string; remoteJid: string; fromMe: boolean }>();

  if (body.id) {
    store.addDeletedId(instance, body.id);
    // Emit REVOKE protocol message so polling picks up the deletion event
    store.addMessage(instance, {
      key: { remoteJid: body.remoteJid, fromMe: body.fromMe, id: `revoke-${body.id}` },
      messageType: 'protocolMessage',
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: {
        protocolMessage: {
          key: { remoteJid: body.remoteJid, fromMe: body.fromMe, id: body.id },
          type: 'REVOKE',
        },
      },
    });
  }

  return c.json({});
});
