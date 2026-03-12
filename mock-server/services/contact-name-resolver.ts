/**
 * Contact name resolver - resolves display names for contacts.
 *
 * Priority: dynamic contacts > fixture contacts > chat names > JID
 */

import type { CompositeStore } from '../stores/index.js';
import type { InstanceFixtures } from '../fixtures.js';

export class ContactNameResolver {
  constructor(
    private readonly store: CompositeStore,
  ) {}

  /**
   * Get the display name for a JID.
   */
  resolve(instance: string, jid: string, fixtures: InstanceFixtures): string {
    // 1. Check dynamic contacts (created during runtime)
    const dynContact = this.store.getContact(instance, jid);
    if (dynContact?.pushName) return dynContact.pushName;

    // 2. Check fixture contacts
    const fixtureContact = fixtures.contacts.find((c) => c.remoteJid === jid);
    if (fixtureContact?.pushName) return fixtureContact.pushName;

    // 3. Check chat name
    const chat = fixtures.chats.find((c) => c.remoteJid === jid);
    if (chat?.name) return chat.name;

    // 4. Fallback to JID phone number
    return jid.split('@')[0];
  }
}
