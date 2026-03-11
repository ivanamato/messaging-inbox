// Shared helpers extracted from evolution.ts for reuse by both the HTTP
// provider and the WebSocket realtime connection.

// -- API response types --

export type EvolutionChatLastMessage = {
  key: {
    id: string;
    fromMe: boolean;
    remoteJid: string;
    remoteJidAlt?: string;
  };
  pushName?: string;
  messageType?: string;
  message?: Record<string, unknown>;
  messageTimestamp?: number;
};

export type EvolutionMessageKey = {
  remoteJid: string;
  fromMe: boolean;
  id: string;
  participant?: string;
};

export type MessageUpdateEntry = {
  status: string; // "SERVER_ACK", "DELIVERY_ACK", "READ", "PLAYED", "ERROR"
};

export type EvolutionMessage = {
  id?: string;
  key: EvolutionMessageKey;
  pushName?: string;
  messageType?: string;
  messageTimestamp?: number;
  status?: number;
  source?: string;
  MessageUpdate?: MessageUpdateEntry[];
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: {
      url?: string;
      mimetype?: string;
      caption?: string;
      fileName?: string;
      fileLength?: string | number;
      mediaKey?: string;
      directPath?: string;
    };
    videoMessage?: {
      url?: string;
      mimetype?: string;
      caption?: string;
      fileName?: string;
      fileLength?: string | number;
      seconds?: number;
    };
    audioMessage?: {
      url?: string;
      mimetype?: string;
      fileName?: string;
      fileLength?: string | number;
      seconds?: number;
      ptt?: boolean;
    };
    documentMessage?: {
      url?: string;
      mimetype?: string;
      title?: string;
      fileName?: string;
      fileLength?: string | number;
      caption?: string;
    };
    stickerMessage?: {
      url?: string;
      mimetype?: string;
      fileLength?: string | number;
    };
    reactionMessage?: {
      key?: { id?: string };
      text?: string;
    };
    buttonsResponseMessage?: {
      selectedButtonId?: string;
      selectedDisplayText?: string;
    };
    listResponseMessage?: {
      title?: string;
      singleSelectReply?: { selectedRowId?: string };
    };
    contactMessage?: { displayName?: string; vcard?: string };
    locationMessage?: { degreesLatitude?: number; degreesLongitude?: number; name?: string };
    protocolMessage?: {
      key?: { remoteJid?: string; fromMe?: boolean; id?: string };
      type?: string; // "REVOKE" for deleted messages
    };
  };
};

// -- Helpers --

export function stripJid(jid: string): string {
  return jid.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '').replace(/@lid$/, '');
}

export function epochToIso(epoch?: number): string {
  if (!epoch) return new Date().toISOString();
  const ts = epoch > 1e12 ? epoch : epoch * 1000;
  return new Date(ts).toISOString();
}

export const STATUS_PRIORITY: Record<string, number> = {
  ERROR: 0,
  PENDING: 1,
  SERVER_ACK: 2,
  DELIVERY_ACK: 3,
  READ: 4,
  PLAYED: 5,
};

export const STATUS_MAP: Record<string, string> = {
  ERROR: 'failed',
  PENDING: 'sent',
  SERVER_ACK: 'sent',
  DELIVERY_ACK: 'delivered',
  READ: 'read',
  PLAYED: 'read',
};

export function resolveStatusFromUpdates(updates?: MessageUpdateEntry[]): string | undefined {
  if (!updates || updates.length === 0) return undefined;
  let best = '';
  let bestPriority = -1;
  for (const entry of updates) {
    const p = STATUS_PRIORITY[entry.status] ?? -1;
    if (p > bestPriority) {
      bestPriority = p;
      best = entry.status;
    }
  }
  return STATUS_MAP[best];
}

export function extractLastMessageContent(lastMsg?: EvolutionChatLastMessage): {
  content: string;
  direction: 'inbound' | 'outbound';
  type?: string;
} | undefined {
  if (!lastMsg) return undefined;

  const direction = lastMsg.key.fromMe ? 'outbound' as const : 'inbound' as const;
  const msg = lastMsg.message;

  if (!msg) return { content: '', direction, type: lastMsg.messageType };

  const text =
    (typeof msg.conversation === 'string' ? msg.conversation : undefined) ||
    (msg.extendedTextMessage && typeof (msg.extendedTextMessage as { text?: string }).text === 'string'
      ? (msg.extendedTextMessage as { text: string }).text
      : undefined) ||
    (msg.imageMessage && typeof (msg.imageMessage as { caption?: string }).caption === 'string'
      ? (msg.imageMessage as { caption: string }).caption
      : undefined) ||
    '';

  return {
    content: text || `[${lastMsg.messageType || 'message'}]`,
    direction,
    type: lastMsg.messageType,
  };
}

export function extractContent(msg: EvolutionMessage): {
  content: string;
  messageType: string;
  hasMedia: boolean;
  caption: string | null;
  filename: string | null;
  mimeType: string | null;
  mediaUrl: string | null;
  mediaSize: number | null;
  reactionEmoji: string | null;
  reactedToMessageId: string | null;
  revokedMessageId?: string | null;
} {
  const m = msg.message;
  const fallbackType = msg.messageType || 'unknown';

  if (!m) {
    return {
      content: '',
      messageType: fallbackType,
      hasMedia: false,
      caption: null,
      filename: null,
      mimeType: null,
      mediaUrl: null,
      mediaSize: null,
      reactionEmoji: null,
      reactedToMessageId: null,
    };
  }

  if (m.conversation) {
    return {
      content: m.conversation,
      messageType: 'text',
      hasMedia: false,
      caption: null,
      filename: null,
      mimeType: null,
      mediaUrl: null,
      mediaSize: null,
      reactionEmoji: null,
      reactedToMessageId: null,
    };
  }

  if (m.extendedTextMessage?.text) {
    return {
      content: m.extendedTextMessage.text,
      messageType: 'text',
      hasMedia: false,
      caption: null,
      filename: null,
      mimeType: null,
      mediaUrl: null,
      mediaSize: null,
      reactionEmoji: null,
      reactedToMessageId: null,
    };
  }

  if (m.protocolMessage?.type === 'REVOKE') {
    return {
      content: '',
      messageType: 'revoked',
      hasMedia: false,
      caption: null,
      filename: null,
      mimeType: null,
      mediaUrl: null,
      mediaSize: null,
      reactionEmoji: null,
      reactedToMessageId: null,
      revokedMessageId: m.protocolMessage.key?.id || null,
    };
  }

  if (m.reactionMessage) {
    return {
      content: m.reactionMessage.text || '',
      messageType: 'reaction',
      hasMedia: false,
      caption: null,
      filename: null,
      mimeType: null,
      mediaUrl: null,
      mediaSize: null,
      reactionEmoji: m.reactionMessage.text || null,
      reactedToMessageId: m.reactionMessage.key?.id || null,
    };
  }

  if (m.imageMessage) {
    return {
      content: m.imageMessage.caption || '',
      messageType: 'image',
      hasMedia: true,
      caption: m.imageMessage.caption || null,
      filename: m.imageMessage.fileName || null,
      mimeType: m.imageMessage.mimetype || 'image/jpeg',
      mediaUrl: m.imageMessage.url || null,
      mediaSize: m.imageMessage.fileLength ? Number(m.imageMessage.fileLength) : null,
      reactionEmoji: null,
      reactedToMessageId: null,
    };
  }

  if (m.videoMessage) {
    return {
      content: m.videoMessage.caption || '',
      messageType: 'video',
      hasMedia: true,
      caption: m.videoMessage.caption || null,
      filename: m.videoMessage.fileName || null,
      mimeType: m.videoMessage.mimetype || 'video/mp4',
      mediaUrl: m.videoMessage.url || null,
      mediaSize: m.videoMessage.fileLength ? Number(m.videoMessage.fileLength) : null,
      reactionEmoji: null,
      reactedToMessageId: null,
    };
  }

  if (m.audioMessage) {
    return {
      content: '',
      messageType: 'audio',
      hasMedia: true,
      caption: null,
      filename: m.audioMessage.fileName || null,
      mimeType: m.audioMessage.mimetype || 'audio/ogg',
      mediaUrl: m.audioMessage.url || null,
      mediaSize: m.audioMessage.fileLength ? Number(m.audioMessage.fileLength) : null,
      reactionEmoji: null,
      reactedToMessageId: null,
    };
  }

  if (m.documentMessage) {
    return {
      content: m.documentMessage.caption || '',
      messageType: 'document',
      hasMedia: true,
      caption: m.documentMessage.caption || null,
      filename: m.documentMessage.fileName || m.documentMessage.title || null,
      mimeType: m.documentMessage.mimetype || 'application/octet-stream',
      mediaUrl: m.documentMessage.url || null,
      mediaSize: m.documentMessage.fileLength ? Number(m.documentMessage.fileLength) : null,
      reactionEmoji: null,
      reactedToMessageId: null,
    };
  }

  if (m.stickerMessage) {
    return {
      content: '',
      messageType: 'sticker',
      hasMedia: true,
      caption: null,
      filename: null,
      mimeType: m.stickerMessage.mimetype || 'image/webp',
      mediaUrl: m.stickerMessage.url || null,
      mediaSize: m.stickerMessage.fileLength ? Number(m.stickerMessage.fileLength) : null,
      reactionEmoji: null,
      reactedToMessageId: null,
    };
  }

  if (m.contactMessage) {
    return {
      content: m.contactMessage.displayName || '[Contact]',
      messageType: 'contact',
      hasMedia: false,
      caption: null,
      filename: null,
      mimeType: null,
      mediaUrl: null,
      mediaSize: null,
      reactionEmoji: null,
      reactedToMessageId: null,
    };
  }

  if (m.locationMessage) {
    return {
      content: m.locationMessage.name || `[Location: ${m.locationMessage.degreesLatitude}, ${m.locationMessage.degreesLongitude}]`,
      messageType: 'location',
      hasMedia: false,
      caption: null,
      filename: null,
      mimeType: null,
      mediaUrl: null,
      mediaSize: null,
      reactionEmoji: null,
      reactedToMessageId: null,
    };
  }

  if (m.buttonsResponseMessage) {
    return {
      content: m.buttonsResponseMessage.selectedDisplayText || '[Button response]',
      messageType: 'buttons_response',
      hasMedia: false,
      caption: null,
      filename: null,
      mimeType: null,
      mediaUrl: null,
      mediaSize: null,
      reactionEmoji: null,
      reactedToMessageId: null,
    };
  }

  return {
    content: '',
    messageType: fallbackType,
    hasMedia: false,
    caption: null,
    filename: null,
    mimeType: null,
    mediaUrl: null,
    mediaSize: null,
    reactionEmoji: null,
    reactedToMessageId: null,
  };
}
