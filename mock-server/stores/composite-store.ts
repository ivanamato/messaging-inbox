/**
 * Composite store - aggregates all focused stores into a unified interface.
 * Provides the same public API as the original MockStore for backward compatibility.
 *
 * This follows the Composite pattern, delegating to specialized stores
 * while presenting a simple unified interface to consumers.
 */

import type { EvolutionMessageFixture } from '../fixtures.js';
import { MessageStore } from './message-store.js';
import { DeletedStore } from './deleted-store.js';
import { ContactStore, type Contact } from './contact-store.js';
import { MediaStore, type MediaEntry } from './media-store.js';
import { UnreadStore } from './unread-store.js';
import { MutationEmitter, type StoreMutationEvent } from './mutation-store.js';

export type { StoreMutationEvent };

/**
 * CompositeStore aggregates all specialized stores.
 * Maintains the same public API as the original MockStore for backward compatibility.
 */
export class CompositeStore {
  readonly messages: MessageStore;
  readonly deleted: DeletedStore;
  readonly contacts: ContactStore;
  readonly media: MediaStore;
  readonly unread: UnreadStore;
  readonly mutations: MutationEmitter;

  constructor() {
    this.messages = new MessageStore();
    this.deleted = new DeletedStore();
    this.contacts = new ContactStore();
    this.media = new MediaStore();
    this.unread = new UnreadStore();
    this.mutations = new MutationEmitter();
  }

  // ── Mutation events ─────────────────────────────────────────────────────

  onMutation(handler: (event: StoreMutationEvent) => void): () => void {
    return this.mutations.subscribe(handler);
  }

  private emitMutation(event: StoreMutationEvent): void {
    this.mutations.emit(event);
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  addMessage(instance: string, msg: EvolutionMessageFixture): void {
    this.messages.add(instance, msg);

    // Count as unread if incoming and not a system message
    const countsAsUnread =
      !msg.key.fromMe &&
      msg.messageType !== 'protocolMessage' &&
      msg.messageType !== 'reactionMessage';

    if (countsAsUnread) {
      this.unread.incrementPending(instance, msg.key.remoteJid);
    }

    // Emit WS event
    this.emitMutation({ instance, type: 'messages.upsert', data: msg });
  }

  getAllMessages(instance: string): EvolutionMessageFixture[] {
    return this.messages.getAll(instance);
  }

  getMessagesForJid(instance: string, jid: string): EvolutionMessageFixture[] {
    return this.messages.getForJid(instance, jid);
  }

  getMessageById(instance: string, id: string): EvolutionMessageFixture | undefined {
    return this.messages.getById(instance, id);
  }

  updateMessageStatus(instance: string, id: string, status: string): void {
    const msg = this.messages.updateStatus(instance, id, status);
    if (msg) {
      this.emitMutation({
        instance,
        type: 'messages.update',
        data: [{ key: { id: msg.key.id, remoteJid: msg.key.remoteJid }, update: { status } }],
      });
    }
  }

  // ── Deletion ─────────────────────────────────────────────────────────────

  deletedIds(instance: string): Set<string> {
    return this.deleted.getAll(instance);
  }

  addDeletedId(instance: string, id: string): void {
    this.deleted.add(instance, id);
    const msg = this.getMessageById(instance, id);
    this.emitMutation({
      instance,
      type: 'messages.delete',
      data: { key: { id, remoteJid: msg?.key.remoteJid ?? '' } },
    });
  }

  // ── Media ────────────────────────────────────────────────────────────────

  storeMedia(instance: string, messageId: string, base64: string, mimetype: string): void {
    this.media.store(instance, messageId, base64, mimetype);
  }

  getMedia(instance: string, messageId: string): MediaEntry | undefined {
    return this.media.get(instance, messageId);
  }

  // ── Contacts ─────────────────────────────────────────────────────────────

  upsertContact(instance: string, contact: Contact): void {
    this.contacts.upsert(instance, contact);
  }

  getContact(instance: string, jid: string): Contact | undefined {
    return this.contacts.get(instance, jid);
  }

  getDynamicContacts(instance: string): Contact[] {
    return this.contacts.getAll(instance);
  }

  // ── Unread ───────────────────────────────────────────────────────────────

  getPendingUnread(instance: string, jid: string): number {
    return this.unread.getPending(instance, jid);
  }

  hasBeenCleared(instance: string, jid: string): boolean {
    return this.unread.hasBeenCleared(instance, jid);
  }

  clearUnread(instance: string, jid: string): void {
    this.unread.clear(instance, jid);
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  reset(instance?: string): void {
    this.messages.reset(instance);
    this.deleted.reset(instance);
    this.media.reset(instance);
    this.contacts.reset(instance);
    this.unread.reset(instance);
    // Note: We don't reset mutations (WebSocket handlers) on instance reset
  }
}

// Re-export types from sub-stores for convenience
export type { Contact, MediaEntry };
