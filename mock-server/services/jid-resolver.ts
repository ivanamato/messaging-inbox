/**
 * JID resolver - reconstructs full JIDs from bare numbers.
 *
 * The Evolution API receives stripped numbers (e.g. "120363012345678901" for a group)
 * and must restore the correct suffix (@g.us, @s.whatsapp.net, @lid).
 */

import type { InstanceFixtures } from '../fixtures.js';

export class JidResolver {
  /**
   * Reconstruct the full JID from a bare number.
   * If the number already contains '@', returns it unchanged.
   */
  resolve(number: string, fixtures: InstanceFixtures): string {
    if (number.includes('@')) return number;

    const allJids = [
      ...fixtures.chats.map((c) => c.remoteJid),
      ...Object.keys(fixtures.messagesByJid),
    ];

    const match = allJids.find((jid) => jid.split('@')[0] === number);
    if (match) return match;

    return `${number}@s.whatsapp.net`;
  }
}
