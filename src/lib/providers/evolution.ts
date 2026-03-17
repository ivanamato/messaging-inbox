import type {
  MessagingProvider,
  ProviderCapabilities,
  DeleteMessageParams,
  Chat,
  Message,
  SendTextParams,
  SendMediaParams,
  SendButtonsParams,
  SendResult,
  FindMessagesOptions,
  PaginatedMessages,
} from './types';
import {
  stripJid,
  epochToIso,
  resolveStatusFromUpdates,
  extractLastMessageContent,
  extractContent,
  type EvolutionChatLastMessage,
  type EvolutionMessage,
  type EvolutionMessageKey,
  type MessageUpdateEntry,
} from './evolution-helpers';

// -- API response types (matched to actual Evolution API v2 responses) --

type EvolutionChat = {
  id: string;
  remoteJid?: string;
  name?: string;
  pushName?: string;
  profilePicUrl?: string;
  unreadCount?: number;
  updatedAt?: string;
  lastMessage?: EvolutionChatLastMessage;
};

type EvolutionContact = {
  remoteJid: string;
  pushName?: string | null;
  profilePicUrl?: string | null;
};

// -- Provider implementation --

const DEFAULT_EVOLUTION_CAPABILITIES: ProviderCapabilities = {
  templates: false,
  messagingWindow24h: false,
  pushToTalk: true,
  interactiveButtons: true,
  deleteForEveryone: true,
  markAsRead: true,
  conversationInitiation: { canInitiate: true, identifierType: 'phone' },
};

export class EvolutionProvider implements MessagingProvider {
  readonly type = 'evolution' as const;
  readonly capabilities: ProviderCapabilities;

  // Cache: @s.whatsapp.net JID -> @lid JID (built during findChats)
  private phoneLidMap = new Map<string, string>();

  // LRU cache for media blob URLs — avoids refetching base64 per render
  private mediaCache = new Map<string, string>();
  private mediaCacheOrder: string[] = [];
  private static readonly MEDIA_CACHE_MAX = 50;

  constructor(
    private readonly baseUrl: string,
    private readonly instanceToken: string,
    capabilitiesOverride?: Partial<ProviderCapabilities>,
  ) {
    this.capabilities = { ...DEFAULT_EVOLUTION_CAPABILITIES, ...capabilitiesOverride };
    // Validate API URL protocol
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error(`Unsupported API URL protocol: ${parsed.protocol}`);
      }
      if (parsed.protocol === 'http:') {
        const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
        if (process.env.NODE_ENV === 'production' && !isLocal) {
          throw new Error(
            'API URL must use HTTPS in production. Sending instance tokens over HTTP exposes them to network interception.',
          );
        }
        console.warn(
          '[WhatsApp Inbox] API URL uses HTTP — instance tokens will be sent in cleartext. Use HTTPS in production.',
        );
      }
    } catch (e) {
      if (e instanceof Error && (e.message.startsWith('Unsupported') || e.message.startsWith('API URL must'))) throw e;
      throw new Error(`Invalid API URL: ${baseUrl}`);
    }
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        apikey: this.instanceToken,
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (process.env.NODE_ENV !== 'production') {
        console.error(`Evolution API error ${res.status}:`, body.slice(0, 500));
      }
      throw new Error(`Request failed (${res.status})`);
    }

    // Guard against oversized responses (10 MB limit)
    const contentLength = res.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) {
      throw new Error('Response too large');
    }

    return res.json() as Promise<T>;
  }

  async getConnectionState(instanceName: string): Promise<'open' | 'close' | 'connecting'> {
    const data = await this.request<{ instance: { state: string } }>(
      `/instance/connectionState/${encodeURIComponent(instanceName)}`
    );
    const state = data.instance?.state;
    if (state === 'open') return 'open';
    if (state === 'connecting') return 'connecting';
    return 'close';
  }

  async findChats(instanceName: string): Promise<Chat[]> {
    const [data, contacts] = await Promise.all([
      this.request<EvolutionChat[]>(
        `/chat/findChats/${encodeURIComponent(instanceName)}`,
        { method: 'POST', body: JSON.stringify({}) }
      ),
      this.request<EvolutionContact[]>(
        `/chat/findContacts/${encodeURIComponent(instanceName)}`,
        { method: 'POST', body: JSON.stringify({}) }
      ).catch(() => [] as EvolutionContact[]),
    ]);

    // Build contact name lookup from the contacts endpoint (has pushName for most contacts)
    const contactNameByJid = new Map<string, string>();
    for (const contact of contacts) {
      if (contact.pushName) {
        contactNameByJid.set(contact.remoteJid, contact.pushName);
      }
    }

    // Build a map: phone number (from @s.whatsapp.net) -> merged chat data
    // WhatsApp's LID migration means the same contact may have separate entries
    // under @s.whatsapp.net (phone-based) and @lid (anonymous logical ID).
    // We merge them into a single chat keyed by the @s.whatsapp.net JID.

    // First pass: build a map from @lid JID -> @s.whatsapp.net JID using remoteJidAlt
    const lidToPhone = new Map<string, string>();
    for (const chat of data) {
      const jid = chat.remoteJid || chat.id;
      const alt = chat.lastMessage?.key?.remoteJidAlt;
      if (jid?.endsWith('@lid') && alt?.endsWith('@s.whatsapp.net')) {
        lidToPhone.set(jid, alt);
        // Cache reverse mapping for findMessages: phone -> lid
        this.phoneLidMap.set(alt, jid);
      }
    }

    // Second pass: merge chats
    const merged = new Map<string, Chat & { lidJid?: string }>();

    for (const chat of data) {
      const jid = chat.remoteJid || chat.id;
      if (!jid) continue;

      let canonicalJid: string;
      if (jid.endsWith('@g.us')) {
        // Group chats use their own JID directly (no LID merging)
        canonicalJid = jid;
      } else if (jid.endsWith('@lid')) {
        const alt = lidToPhone.get(jid);
        if (!alt) continue; // Can't resolve this @lid chat, skip
        canonicalJid = alt;
      } else if (jid.endsWith('@s.whatsapp.net')) {
        canonicalJid = jid;
      } else {
        continue;
      }

      const existing = merged.get(canonicalJid);
      const lastMsgContent = extractLastMessageContent(chat.lastMessage);
      const lastActiveAt = chat.updatedAt
        || (chat.lastMessage?.messageTimestamp
          ? epochToIso(chat.lastMessage.messageTimestamp)
          : undefined);

      // Resolve contact name: for groups use chat.name (group subject); for
      // individuals use contacts endpoint > chat.pushName > lastMessage.pushName.
      const isGroup = canonicalJid.endsWith('@g.us');
      let resolvedName: string | undefined;
      if (isGroup) {
        resolvedName = chat.name || chat.pushName || undefined;
      } else {
        const lastMsgPushName = (chat.lastMessage?.pushName && !chat.lastMessage.key.fromMe)
          ? chat.lastMessage.pushName
          : undefined;
        resolvedName = contactNameByJid.get(jid)
          || contactNameByJid.get(canonicalJid)
          || chat.pushName
          || lastMsgPushName
          || undefined;
      }

      if (!existing) {
        merged.set(canonicalJid, {
          id: canonicalJid,
          phoneNumber: stripJid(canonicalJid),
          contactName: resolvedName,
          profilePicUrl: chat.profilePicUrl || undefined,
          lastActiveAt,
          lastMessage: lastMsgContent,
          unreadCount: chat.unreadCount,
          lidJid: jid.endsWith('@lid') ? jid : undefined,
        });
      } else {
        // Merge: keep the most recent lastActiveAt, prefer non-empty fields
        if (jid.endsWith('@lid')) {
          existing.lidJid = jid;
        }
        existing.contactName = existing.contactName || resolvedName;
        existing.profilePicUrl = existing.profilePicUrl || chat.profilePicUrl || undefined;
        existing.unreadCount = (existing.unreadCount || 0) + (chat.unreadCount || 0);

        // Use most recent lastActiveAt and its lastMessage
        if (lastActiveAt && (!existing.lastActiveAt || new Date(lastActiveAt) > new Date(existing.lastActiveAt))) {
          existing.lastActiveAt = lastActiveAt;
          existing.lastMessage = lastMsgContent || existing.lastMessage;
        }
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => {
        if (!a.lastActiveAt || !b.lastActiveAt) return 0;
        return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
      });
  }

  private async ensureLidMap(instanceName: string): Promise<void> {
    if (this.phoneLidMap.size > 0) return;
    // Populate the lid mapping by fetching chats once
    const data = await this.request<EvolutionChat[]>(
      `/chat/findChats/${encodeURIComponent(instanceName)}`,
      { method: 'POST', body: JSON.stringify({}) }
    );
    for (const chat of data) {
      const jid = chat.remoteJid || chat.id;
      const alt = chat.lastMessage?.key?.remoteJidAlt;
      if (jid?.endsWith('@lid') && alt?.endsWith('@s.whatsapp.net')) {
        this.phoneLidMap.set(alt, jid);
      }
    }
  }

  private convertToMessages(allMessages: EvolutionMessage[], phoneNumber: string, contactNameByJid?: Map<string, string>): Message[] {
    // First pass: collect IDs of messages that were revoked (deleted for everyone)
    const revokedIds = new Set<string>();
    for (const msg of allMessages) {
      const extracted = extractContent(msg);
      if (extracted.messageType === 'revoked' && extracted.revokedMessageId) {
        revokedIds.add(extracted.revokedMessageId);
      }
    }

    return allMessages
      .filter((msg) => {
        const extracted = extractContent(msg);
        return extracted.messageType !== 'revoked';
      })
      .map((msg) => {
        const extracted = extractContent(msg);
        const status = resolveStatusFromUpdates(msg.MessageUpdate);
        const isDeleted = revokedIds.has(msg.key.id);

        return {
          id: msg.key.id,
          direction: msg.key.fromMe ? 'outbound' as const : 'inbound' as const,
          content: isDeleted ? '' : extracted.content,
          createdAt: epochToIso(msg.messageTimestamp),
          status,
          phoneNumber,
          hasMedia: isDeleted ? false : extracted.hasMedia,
          messageType: isDeleted ? 'deleted' : extracted.messageType,
          reactionEmoji: extracted.reactionEmoji,
          reactedToMessageId: extracted.reactedToMessageId,
          caption: isDeleted ? null : extracted.caption,
          filename: isDeleted ? null : extracted.filename,
          mimeType: isDeleted ? null : extracted.mimeType,
          metadata: (!isDeleted && extracted.hasMedia)
            ? { mediaId: msg.key.id }
            : {},
          senderName: (() => {
            if (msg.key.fromMe) return undefined;
            if (msg.pushName) return msg.pushName;
            // For group messages, fall back to contact lookup by participant JID
            if (msg.key.participant) {
              const participantPhone = stripJid(msg.key.participant);
              return contactNameByJid?.get(msg.key.participant)
                || contactNameByJid?.get(`${participantPhone}@s.whatsapp.net`)
                || participantPhone;
            }
            return undefined;
          })(),
        };
      });
  }

  async findMessagesPaginated(
    instanceName: string,
    chatId: string,
    options: FindMessagesOptions = {},
  ): Promise<PaginatedMessages> {
    const { page = 1, pageSize = 50 } = options;
    const isGroup = chatId.endsWith('@g.us');
    const primaryJid = chatId.includes('@') ? chatId : `${chatId}@s.whatsapp.net`;

    type PaginatedResponse = {
      messages: {
        total: number;
        pages: number;
        currentPage: number;
        records: EvolutionMessage[];
      };
    };

    const fetchJidPaginated = (remoteJid: string) =>
      this.request<PaginatedResponse>(
        `/chat/findMessages/${encodeURIComponent(instanceName)}`,
        {
          method: 'POST',
          body: JSON.stringify({
            where: { key: { remoteJid } },
            page,
            offset: pageSize,
          }),
        }
      ).then((d) => ({
        records: d?.messages?.records || [],
        total: d?.messages?.total ?? 0,
        pages: d?.messages?.pages ?? 1,
        currentPage: d?.messages?.currentPage ?? page,
      }));

    let phoneResult: { records: EvolutionMessage[]; total: number; pages: number; currentPage: number };
    let lidResult: { records: EvolutionMessage[]; total: number; pages: number; currentPage: number };

    if (isGroup) {
      phoneResult = await fetchJidPaginated(primaryJid);
      lidResult = { records: [], total: 0, pages: 0, currentPage: page };
    } else {
      await this.ensureLidMap(instanceName);
      const lidJid = this.phoneLidMap.get(primaryJid);
      [phoneResult, lidResult] = await Promise.all([
        fetchJidPaginated(primaryJid),
        lidJid ? fetchJidPaginated(lidJid) : Promise.resolve({ records: [], total: 0, pages: 0, currentPage: page }),
      ]);
    }

    // Deduplicate by message key ID
    const seen = new Set<string>();
    const allMessages: EvolutionMessage[] = [];
    for (const msg of [...phoneResult.records, ...lidResult.records]) {
      if (!seen.has(msg.key.id)) {
        seen.add(msg.key.id);
        allMessages.push(msg);
      }
    }

    const phoneNumber = stripJid(primaryJid);

    // For groups, fetch contacts to resolve participant names
    let contactNameByJid: Map<string, string> | undefined;
    if (isGroup) {
      const contacts = await this.request<EvolutionContact[]>(
        `/chat/findContacts/${encodeURIComponent(instanceName)}`,
        { method: 'POST', body: JSON.stringify({ where: {} }) }
      ).catch(() => [] as EvolutionContact[]);
      contactNameByJid = new Map();
      for (const c of contacts) {
        if (c.pushName) contactNameByJid.set(c.remoteJid, c.pushName);
      }
    }

    const messages = this.convertToMessages(allMessages, phoneNumber, contactNameByJid);

    // For dual JID: use max pages from either source
    const totalPages = Math.max(phoneResult.pages, lidResult.pages);
    const total = phoneResult.total + lidResult.total;

    return {
      messages,
      pagination: {
        currentPage: page,
        totalPages,
        total,
        hasMore: page < totalPages,
      },
    };
  }

  async findMessages(instanceName: string, chatId: string, limit = 50): Promise<Message[]> {
    const isGroup = chatId.endsWith('@g.us');
    const primaryJid = chatId.includes('@') ? chatId : `${chatId}@s.whatsapp.net`;

    const fetchJid = (remoteJid: string) =>
      this.request<{ messages: { records: EvolutionMessage[] } }>(
        `/chat/findMessages/${encodeURIComponent(instanceName)}`,
        {
          method: 'POST',
          body: JSON.stringify({
            where: { key: { remoteJid } },
            limit,
          }),
        }
      ).then((d) => d?.messages?.records || []);

    let phoneMessages: EvolutionMessage[];
    let lidMessages: EvolutionMessage[];

    if (isGroup) {
      phoneMessages = await fetchJid(primaryJid);
      lidMessages = [];
    } else {
      await this.ensureLidMap(instanceName);
      const lidJid = this.phoneLidMap.get(primaryJid);
      [phoneMessages, lidMessages] = await Promise.all([
        fetchJid(primaryJid),
        lidJid ? fetchJid(lidJid) : Promise.resolve([]),
      ]);
    }

    // Deduplicate by message key ID
    const seen = new Set<string>();
    const allMessages: EvolutionMessage[] = [];
    for (const msg of [...phoneMessages, ...lidMessages]) {
      if (!seen.has(msg.key.id)) {
        seen.add(msg.key.id);
        allMessages.push(msg);
      }
    }

    let contactNameByJid: Map<string, string> | undefined;
    if (isGroup) {
      const contacts = await this.request<EvolutionContact[]>(
        `/chat/findContacts/${encodeURIComponent(instanceName)}`,
        { method: 'POST', body: JSON.stringify({ where: {} }) }
      ).catch(() => [] as EvolutionContact[]);
      contactNameByJid = new Map();
      for (const c of contacts) {
        if (c.pushName) contactNameByJid.set(c.remoteJid, c.pushName);
      }
    }

    return this.convertToMessages(allMessages, stripJid(primaryJid), contactNameByJid);
  }

  async sendText(instanceName: string, params: SendTextParams): Promise<SendResult> {
    const data = await this.request<{ key: { id: string }; status?: string }>(
      `/message/sendText/${encodeURIComponent(instanceName)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          number: params.to,
          text: params.body,
        }),
      }
    );

    return {
      messageId: data.key?.id || '',
      status: data.status,
    };
  }

  async sendMedia(instanceName: string, params: SendMediaParams): Promise<SendResult> {
    // Use dedicated sendWhatsAppAudio endpoint for voice notes (PTT audio)
    const isVoiceNote = params.ptt && params.mediaType === 'audio';
    const endpoint = isVoiceNote
      ? `/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`
      : `/message/sendMedia/${encodeURIComponent(instanceName)}`;

    const payload = isVoiceNote
      ? { number: params.to, audio: params.media }
      : {
          number: params.to,
          mediatype: params.mediaType,
          media: params.media,
          caption: params.caption || undefined,
          fileName: params.fileName || undefined,
          mimetype: params.mimeType || undefined,
          ptt: params.ptt ?? undefined,
        };

    const data = await this.request<{ key: { id: string }; status?: string }>(
      endpoint,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );

    return {
      messageId: data.key?.id || '',
      status: data.status,
    };
  }

  async sendButtons(instanceName: string, params: SendButtonsParams): Promise<SendResult> {
    const data = await this.request<{ key: { id: string }; status?: string }>(
      `/message/sendButtons/${encodeURIComponent(instanceName)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          number: params.to,
          title: params.header || '',
          description: params.body,
          buttons: params.buttons.map((btn) => ({
            buttonId: btn.id,
            buttonText: { displayText: btn.title },
            type: 'reply',
          })),
        }),
      }
    );

    return {
      messageId: data.key?.id || '',
      status: data.status,
    };
  }

  async deleteMessage(instanceName: string, params: DeleteMessageParams): Promise<void> {
    const { messageId, metadata = {} } = params;
    const { remoteJid, fromMe } = metadata as { remoteJid?: string; fromMe?: boolean };
    await this.request(`/chat/deleteMessageForEveryone/${encodeURIComponent(instanceName)}`, {
      method: 'DELETE',
      body: JSON.stringify({ id: messageId, remoteJid, fromMe }),
    });
  }

  async markChatAsRead(instanceName: string, chatId: string): Promise<void> {
    const remoteJid = chatId.includes('@') ? chatId : `${chatId}@s.whatsapp.net`;
    await this.request(`/chat/markMessageAsRead/${encodeURIComponent(instanceName)}`, {
      method: 'PUT',
      body: JSON.stringify({ readMessages: [{ remoteJid, fromMe: false, id: 'all' }] }),
    });
  }

  private evictMediaCache(): void {
    while (this.mediaCacheOrder.length > EvolutionProvider.MEDIA_CACHE_MAX) {
      const oldest = this.mediaCacheOrder.shift()!;
      const url = this.mediaCache.get(oldest);
      if (url) {
        URL.revokeObjectURL(url);
        this.mediaCache.delete(oldest);
      }
    }
  }

  async getMediaUrl(instanceName: string, messageId: string): Promise<string | null> {
    // Check cache first (empty string = cached failure)
    if (this.mediaCache.has(messageId)) {
      const cached = this.mediaCache.get(messageId)!;
      return cached || null;
    }

    try {
      // Fetch the full message object so the Evolution API has mediaKey/directPath
      // to decrypt and download media (passing only key.id often fails for audio)
      const msgData = await this.request<{ messages: { records: EvolutionMessage[] } }>(
        `/chat/findMessages/${encodeURIComponent(instanceName)}`,
        {
          method: 'POST',
          body: JSON.stringify({
            where: { key: { id: messageId } },
            limit: 1,
          }),
        }
      );

      const fullMessage = msgData?.messages?.records?.[0];
      if (!fullMessage) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[WhatsApp Inbox] getMediaUrl: message not found for id=${messageId}`);
        }
        return null;
      }

      const data = await this.request<{ base64?: string; mimetype?: string }>(
        `/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`,
        {
          method: 'POST',
          body: JSON.stringify({
            message: {
              key: fullMessage.key,
              message: fullMessage.message,
            },
            convertToMp4: false,
          }),
        }
      );

      if (data.base64 && data.mimetype) {
        // Validate MIME type before constructing blob URL to prevent script execution
        const SAFE_MEDIA_MIMES = /^(image\/(jpeg|png|gif|webp|bmp|tiff|svg\+xml)|video\/|audio\/|application\/(pdf|octet-stream))/i;
        if (!SAFE_MEDIA_MIMES.test(data.mimetype)) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`[WhatsApp Inbox] getMediaUrl: rejected MIME type "${data.mimetype}" for id=${messageId}`);
          }
          return null;
        }

        // Convert base64 to Blob URL — much less memory than data URI strings
        // Strip whitespace (APIs often return MIME-formatted base64 with line breaks)
        const byteChars = atob(data.base64.replace(/\s/g, ''));
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteArray[i] = byteChars.charCodeAt(i);
        }
        const blob = new Blob([byteArray], { type: data.mimetype });
        const blobUrl = URL.createObjectURL(blob);

        // Store in LRU cache
        this.mediaCache.set(messageId, blobUrl);
        this.mediaCacheOrder.push(messageId);
        this.evictMediaCache();

        return blobUrl;
      }
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[WhatsApp Inbox] getMediaUrl: no base64/mimetype in response for id=${messageId}`, { hasBase64: !!data.base64, mimetype: data.mimetype });
      }
      return null;
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[WhatsApp Inbox] getMediaUrl failed for id=${messageId}:`, err);
      }
      return null;
    }
  }
}
