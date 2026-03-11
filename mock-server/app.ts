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

const MESSAGES_PER_PAGE = 20;
const VALID_TOKENS = new Set(['mock-token-123', 'mock-token-456']);

export const app = new Hono();

// ── CORS ──────────────────────────────────────────────────────────────────────

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'apikey', 'Authorization'],
}));

// ── Auth ──────────────────────────────────────────────────────────────────────

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

// Reconstruct the full JID from a bare number (strips @suffix before comparison).
// The real Evolution API receives stripped numbers (e.g. "120363012345678901" for a group)
// and the mock must restore the correct suffix (@g.us, @s.whatsapp.net, @lid).
function resolveJid(number: string, fixtures: InstanceFixtures): string {
  if (number.includes('@')) return number;
  const allJids = [
    ...fixtures.chats.map((c) => c.remoteJid),
    ...Object.keys(fixtures.messagesByJid),
  ];
  const match = allJids.find((jid) => jid.split('@')[0] === number);
  if (match) return match;
  return `${number}@s.whatsapp.net`;
}

function getContactName(instance: string, jid: string, fixtures: InstanceFixtures): string {
  const dynContact = store.getContact(instance, jid);
  if (dynContact?.pushName) return dynContact.pushName;
  const fixtureContact = fixtures.contacts.find((c) => c.remoteJid === jid);
  if (fixtureContact?.pushName) return fixtureContact.pushName;
  const chat = fixtures.chats.find((c) => c.remoteJid === jid);
  if (chat?.name) return chat.name;
  return jid.split('@')[0];
}

function scheduleDelivery(
  instance: string,
  id: string,
  jid: string,
  fixtures: InstanceFixtures,
): void {
  // Realistic status progression: PENDING → SERVER_ACK → DELIVERY_ACK → READ
  setTimeout(() => store.updateMessageStatus(instance, id, 'SERVER_ACK'), 300);
  setTimeout(() => store.updateMessageStatus(instance, id, 'DELIVERY_ACK'), 1500);

  const replyDelay = 2000 + Math.random() * 1000;
  setTimeout(() => {
    // Mark as READ right before the reply (they read it then typed)
    store.updateMessageStatus(instance, id, 'READ');

    const replyId = `reply-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const isGroup = jid.endsWith('@g.us');

    if (isGroup) {
      // Pick a random participant from fixture group messages
      const groupMsgs = fixtures.messagesByJid[jid] ?? [];
      const participants = [
        ...new Set(
          groupMsgs
            .filter((m) => !m.key.fromMe && m.key.participant)
            .map((m) => m.key.participant!),
        ),
      ];
      const participant =
        participants[Math.floor(Math.random() * participants.length)] ??
        '5511999999999@s.whatsapp.net';
      const pushName =
        fixtures.contacts.find((c) => c.remoteJid === participant)?.pushName ?? 'Group Member';
      store.addMessage(instance, {
        key: { remoteJid: jid, fromMe: false, id: replyId, participant },
        pushName,
        messageType: 'conversation',
        messageTimestamp: Math.floor(Date.now() / 1000),
        message: { conversation: 'Example response' },
      });
    } else {
      store.addMessage(instance, {
        key: { remoteJid: jid, fromMe: false, id: replyId },
        pushName: getContactName(instance, jid, fixtures),
        messageType: 'conversation',
        messageTimestamp: Math.floor(Date.now() / 1000),
        message: { conversation: 'Example response' },
      });
    }
  }, replyDelay);
}

// ── Connection State ──────────────────────────────────────────────────────────

app.get('/instance/connectionState/:instance', (c) => {
  const instance = c.req.param('instance');
  if (!getFixtures(instance)) return c.json({ error: 'Instance not found' }, 404);
  return c.json(connectionState);
});

// ── Find Chats ────────────────────────────────────────────────────────────────

app.post('/chat/findChats/:instance', (c) => {
  const instance = c.req.param('instance');
  const fixtures = getFixtures(instance);
  if (!fixtures) return c.json({ error: 'Instance not found' }, 404);

  const deletedIds = store.deletedIds(instance);

  // Build map of jid → latest dynamic message (exclude system/reaction messages as lastMessage)
  const latestByJid = new Map<string, EvolutionMessageFixture>();
  for (const msg of store.getAllMessages(instance)) {
    if (deletedIds.has(msg.key.id)) continue;
    if (msg.messageType === 'protocolMessage') continue;
    if (msg.messageType === 'reactionMessage') continue;
    const jid = msg.key.remoteJid;
    const existing = latestByJid.get(jid);
    if (!existing || (msg.messageTimestamp ?? 0) > (existing.messageTimestamp ?? 0)) {
      latestByJid.set(jid, msg);
    }
  }

  const fixtureJids = new Set(fixtures.chats.map((c) => c.remoteJid));

  // Update fixture chats with dynamic state
  const updatedChats = fixtures.chats.map((chat) => {
    const latestDynamic = latestByJid.get(chat.remoteJid);
    const fixtureTs = chat.lastMessage?.messageTimestamp ?? 0;
    const dynamicTs = latestDynamic?.messageTimestamp ?? 0;

    const lastMessage = dynamicTs > fixtureTs ? latestDynamic : chat.lastMessage;
    const updatedAt =
      dynamicTs > fixtureTs
        ? new Date(dynamicTs * 1000).toISOString()
        : chat.updatedAt;

    // Unread: if last message is ours, 0; otherwise fixture base + pending dynamic
    const lastIsFromMe = lastMessage?.key?.fromMe ?? false;
    const baseUnread = store.hasBeenCleared(instance, chat.remoteJid) ? 0 : chat.unreadCount;
    const pendingUnread = store.getPendingUnread(instance, chat.remoteJid);
    const unreadCount = lastIsFromMe ? 0 : baseUnread + pendingUnread;

    return { ...chat, lastMessage, updatedAt, unreadCount };
  });

  // Create new chats for JIDs that exist only in the store (sent to unknown contacts)
  for (const [jid, msg] of latestByJid) {
    if (fixtureJids.has(jid)) continue;
    const name = getContactName(instance, jid, fixtures);
    const pendingUnread = store.getPendingUnread(instance, jid);
    const unreadCount = msg.key.fromMe ? 0 : pendingUnread;
    updatedChats.push({
      id: jid,
      remoteJid: jid,
      name,
      pushName: name,
      profilePicUrl: undefined,
      unreadCount,
      updatedAt: new Date((msg.messageTimestamp ?? 0) * 1000).toISOString(),
      lastMessage: msg,
    });
  }

  // Sort by most recent first
  updatedChats.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return c.json(updatedChats);
});

// ── Test reset — wipe in-memory state for an instance ────────────────────────

app.post('/test/reset/:instance', (c) => {
  const instance = c.req.param('instance');
  if (!getFixtures(instance)) return c.json({ error: 'Instance not found' }, 404);
  store.reset(instance);
  return new Response(null, { status: 204 });
});

// ── Find Contacts ─────────────────────────────────────────────────────────────

app.post('/chat/findContacts/:instance', (c) => {
  const instance = c.req.param('instance');
  const fixtures = getFixtures(instance);
  if (!fixtures) return c.json({ error: 'Instance not found' }, 404);

  // Merge fixture contacts + dynamic contacts (dynamic takes priority for same JID)
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
  if (!fixtures) return c.json({ error: 'Instance not found' }, 404);

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

  // Opening a chat → mark as read (clears unread count)
  store.clearUnread(instance, remoteJid);

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
    const pageSize = typeof offset === 'number' ? offset : MESSAGES_PER_PAGE;
    const effectivePageSize = Math.min(pageSize, MESSAGES_PER_PAGE);
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
  if (!getFixtures(instance)) return c.json({ error: 'Instance not found' }, 404);
  const body = await c.req.json<{ readMessages?: Array<{ remoteJid?: string }> }>();
  for (const entry of body.readMessages ?? []) {
    if (entry.remoteJid) store.clearUnread(instance, entry.remoteJid);
  }
  return c.json({ success: true });
});

// ── Get Media (Base64) ────────────────────────────────────────────────────────

app.post('/chat/getBase64FromMediaMessage/:instance', async (c) => {
  const instance = c.req.param('instance');
  if (!getFixtures(instance)) return c.json({ error: 'Instance not found' }, 404);

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
  if (!fixtures) return c.json({ error: 'Instance not found' }, 404);

  const body = await c.req.json<{ number: string; text: string }>();
  const id = `sent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const jid = resolveJid(body.number, fixtures);

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

  scheduleDelivery(instance, id, jid, fixtures);
  return c.json({ key: { id }, status: 'PENDING' });
});

// ── Send Media ────────────────────────────────────────────────────────────────

app.post('/message/sendMedia/:instance', async (c) => {
  const instance = c.req.param('instance');
  const fixtures = getFixtures(instance);
  if (!fixtures) return c.json({ error: 'Instance not found' }, 404);

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
  const jid = resolveJid(body.number, fixtures);
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

  scheduleDelivery(instance, id, jid, fixtures);
  return c.json({ key: { id }, status: 'PENDING' });
});

// ── Send Buttons ──────────────────────────────────────────────────────────────

app.post('/message/sendButtons/:instance', async (c) => {
  const instance = c.req.param('instance');
  const fixtures = getFixtures(instance);
  if (!fixtures) return c.json({ error: 'Instance not found' }, 404);

  const body = await c.req.json<{
    number: string;
    title?: string;
    description: string;
    buttons: unknown[];
  }>();

  const id = `sent-btn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const jid = resolveJid(body.number, fixtures);

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

  scheduleDelivery(instance, id, jid, fixtures);
  return c.json({ key: { id }, status: 'PENDING' });
});

// ── Delete Message ────────────────────────────────────────────────────────────

app.delete('/chat/deleteMessageForEveryone/:instance', async (c) => {
  const instance = c.req.param('instance');
  if (!getFixtures(instance)) return c.json({ error: 'Instance not found' }, 404);

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
