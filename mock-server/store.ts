import type { EvolutionMessageFixture } from './fixtures.js';

type Contact = { remoteJid: string; pushName: string; profilePicUrl: null };
type MediaEntry = { base64: string; mimetype: string };

export type StoreMutationEvent = {
  instance: string;
  type: string;
  data: unknown;
};

type MutationHandler = (event: StoreMutationEvent) => void;

class MockStore {
  private messages: Map<string, EvolutionMessageFixture[]> = new Map();
  private _deletedIds: Map<string, Set<string>> = new Map();
  private mediaStore: Map<string, MediaEntry> = new Map();
  private dynamicContacts: Map<string, Map<string, Contact>> = new Map();
  // Pending unread = incoming dynamic messages not yet cleared by findMessages
  private pendingUnread: Map<string, Map<string, number>> = new Map();
  // JIDs that have been opened (findMessages called) at least once
  private clearedJids: Map<string, Set<string>> = new Map();
  // Mutation listeners for WebSocket broadcasting
  private mutationHandlers = new Set<MutationHandler>();

  // ── mutation events ─────────────────────────────────────────────────────

  onMutation(handler: MutationHandler): () => void {
    this.mutationHandlers.add(handler);
    return () => { this.mutationHandlers.delete(handler); };
  }

  private emitMutation(event: StoreMutationEvent): void {
    for (const handler of this.mutationHandlers) {
      try { handler(event); } catch { /* ignore */ }
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private msgsFor(instance: string): EvolutionMessageFixture[] {
    if (!this.messages.has(instance)) this.messages.set(instance, []);
    return this.messages.get(instance)!;
  }

  private deletedFor(instance: string): Set<string> {
    if (!this._deletedIds.has(instance)) this._deletedIds.set(instance, new Set());
    return this._deletedIds.get(instance)!;
  }

  private contactsFor(instance: string): Map<string, Contact> {
    if (!this.dynamicContacts.has(instance)) this.dynamicContacts.set(instance, new Map());
    return this.dynamicContacts.get(instance)!;
  }

  private pendingFor(instance: string): Map<string, number> {
    if (!this.pendingUnread.has(instance)) this.pendingUnread.set(instance, new Map());
    return this.pendingUnread.get(instance)!;
  }

  private clearedFor(instance: string): Set<string> {
    if (!this.clearedJids.has(instance)) this.clearedJids.set(instance, new Set());
    return this.clearedJids.get(instance)!;
  }

  // ── messages ──────────────────────────────────────────────────────────────

  addMessage(instance: string, msg: EvolutionMessageFixture): void {
    this.msgsFor(instance).push(msg);
    // Count as unread if incoming and not a system message
    const countsAsUnread =
      !msg.key.fromMe &&
      msg.messageType !== 'protocolMessage' &&
      msg.messageType !== 'reactionMessage';
    if (countsAsUnread) {
      const pending = this.pendingFor(instance);
      const jid = msg.key.remoteJid;
      pending.set(jid, (pending.get(jid) ?? 0) + 1);
    }
    // Emit WS event
    this.emitMutation({ instance, type: 'messages.upsert', data: msg });
  }

  getAllMessages(instance: string): EvolutionMessageFixture[] {
    return this.msgsFor(instance);
  }

  getMessagesForJid(instance: string, remoteJid: string): EvolutionMessageFixture[] {
    return this.msgsFor(instance).filter((m) => m.key.remoteJid === remoteJid);
  }

  updateMessageStatus(instance: string, id: string, status: string): void {
    const msg = this.msgsFor(instance).find((m) => m.key.id === id);
    if (msg) {
      msg.MessageUpdate = [{ status }];
      // Emit WS event
      this.emitMutation({
        instance,
        type: 'messages.update',
        data: [{ key: { id: msg.key.id, remoteJid: msg.key.remoteJid }, update: { status } }],
      });
    }
  }

  getMessageById(instance: string, id: string): EvolutionMessageFixture | undefined {
    return this.msgsFor(instance).find((m) => m.key.id === id);
  }

  // ── deletion ──────────────────────────────────────────────────────────────

  deletedIds(instance: string): Set<string> {
    return this.deletedFor(instance);
  }

  addDeletedId(instance: string, id: string): void {
    this.deletedFor(instance).add(id);
    // Find the message to get remoteJid for the WS event
    const msg = this.getMessageById(instance, id);
    this.emitMutation({
      instance,
      type: 'messages.delete',
      data: { key: { id, remoteJid: msg?.key.remoteJid ?? '' } },
    });
  }

  // ── media ─────────────────────────────────────────────────────────────────

  storeMedia(instance: string, messageId: string, base64: string, mimetype: string): void {
    this.mediaStore.set(`${instance}:${messageId}`, { base64, mimetype });
  }

  getMedia(instance: string, messageId: string): MediaEntry | undefined {
    return this.mediaStore.get(`${instance}:${messageId}`);
  }

  // ── contacts ──────────────────────────────────────────────────────────────

  upsertContact(instance: string, contact: Contact): void {
    this.contactsFor(instance).set(contact.remoteJid, contact);
  }

  getContact(instance: string, jid: string): Contact | undefined {
    return this.contactsFor(instance).get(jid);
  }

  getDynamicContacts(instance: string): Contact[] {
    return Array.from(this.contactsFor(instance).values());
  }

  // ── unread ────────────────────────────────────────────────────────────────

  getPendingUnread(instance: string, jid: string): number {
    return this.pendingFor(instance).get(jid) ?? 0;
  }

  hasBeenCleared(instance: string, jid: string): boolean {
    return this.clearedFor(instance).has(jid);
  }

  clearUnread(instance: string, jid: string): void {
    this.clearedFor(instance).add(jid);
    this.pendingFor(instance).set(jid, 0);
  }

  // ── reset ─────────────────────────────────────────────────────────────────

  reset(instance?: string): void {
    if (instance) {
      this.messages.delete(instance);
      this._deletedIds.delete(instance);
      for (const key of this.mediaStore.keys()) {
        if (key.startsWith(`${instance}:`)) this.mediaStore.delete(key);
      }
      this.dynamicContacts.delete(instance);
      this.pendingUnread.delete(instance);
      this.clearedJids.delete(instance);
    } else {
      this.messages.clear();
      this._deletedIds.clear();
      this.mediaStore.clear();
      this.dynamicContacts.clear();
      this.pendingUnread.clear();
      this.clearedJids.clear();
    }
  }
}

export const store = new MockStore();
