/**
 * Chat merger - merges fixture chats with dynamic messages.
 *
 * Handles:
 * - Merging fixture chats with store messages
 * - Computing lastMessage, updatedAt, unreadCount
 * - Creating new chats for unknown JIDs
 * - Sorting by recency
 */

import type { EvolutionMessageFixture, InstanceFixtures, EvolutionChatFixture } from '../fixtures.js';
import type { CompositeStore } from '../stores/index.js';
import { ContactNameResolver } from './contact-name-resolver.js';

export class ChatMerger {
  constructor(
    private readonly store: CompositeStore,
    private readonly contactNameResolver: ContactNameResolver,
  ) {}

  /**
   * Merge fixture chats with dynamic messages and return sorted chat list.
   */
  merge(instance: string, fixtures: InstanceFixtures): EvolutionChatFixture[] {
    const deletedIds = this.store.deletedIds(instance);

    // Build map of jid → latest dynamic message (exclude system/reaction messages)
    const latestByJid = this.buildLatestMessagesMap(instance, deletedIds);

    // Get set of fixture JIDs
    const fixtureJids = new Set(fixtures.chats.map((c) => c.remoteJid));

    // Update fixture chats with dynamic state
    const updatedChats = fixtures.chats.map((chat) =>
      this.updateChatWithDynamicState(instance, chat, latestByJid),
    );

    // Create new chats for JIDs that exist only in the store
    for (const [jid, msg] of latestByJid) {
      if (!fixtureJids.has(jid)) {
        updatedChats.push(this.createNewChat(instance, jid, msg, fixtures));
      }
    }

    // Sort by most recent first
    return updatedChats.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  private buildLatestMessagesMap(
    instance: string,
    deletedIds: Set<string>,
  ): Map<string, EvolutionMessageFixture> {
    const latestByJid = new Map<string, EvolutionMessageFixture>();

    for (const msg of this.store.getAllMessages(instance)) {
      if (deletedIds.has(msg.key.id)) continue;
      if (msg.messageType === 'protocolMessage') continue;
      if (msg.messageType === 'reactionMessage') continue;

      const jid = msg.key.remoteJid;
      const existing = latestByJid.get(jid);

      if (!existing || (msg.messageTimestamp ?? 0) > (existing.messageTimestamp ?? 0)) {
        latestByJid.set(jid, msg);
      }
    }

    return latestByJid;
  }

  private updateChatWithDynamicState(
    instance: string,
    chat: EvolutionChatFixture,
    latestByJid: Map<string, EvolutionMessageFixture>,
  ): EvolutionChatFixture {
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
    const baseUnread = this.store.hasBeenCleared(instance, chat.remoteJid) ? 0 : chat.unreadCount;
    const pendingUnread = this.store.getPendingUnread(instance, chat.remoteJid);
    const unreadCount = lastIsFromMe ? 0 : baseUnread + pendingUnread;

    return { ...chat, lastMessage, updatedAt, unreadCount };
  }

  private createNewChat(
    instance: string,
    jid: string,
    msg: EvolutionMessageFixture,
    fixtures: InstanceFixtures,
  ): EvolutionChatFixture {
    const name = this.contactNameResolver.resolve(instance, jid, fixtures);
    const pendingUnread = this.store.getPendingUnread(instance, jid);
    const unreadCount = msg.key.fromMe ? 0 : pendingUnread;

    return {
      id: jid,
      remoteJid: jid,
      name,
      pushName: name,
      profilePicUrl: undefined,
      unreadCount,
      updatedAt: new Date((msg.messageTimestamp ?? 0) * 1000).toISOString(),
      lastMessage: msg,
    };
  }
}
