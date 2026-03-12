/**
 * Delivery scheduler - simulates message delivery progression and auto-replies.
 *
 * Realistic status progression: PENDING → SERVER_ACK → DELIVERY_ACK → READ
 * Then optionally sends an auto-reply.
 */

import type { InstanceFixtures, EvolutionMessageFixture } from '../fixtures.js';
import type { CompositeStore } from '../stores/index.js';
import { ContactNameResolver } from './contact-name-resolver.js';

/**
 * Delivery timing configuration.
 * Can be overridden for testing or different simulation speeds.
 */
export const DELIVERY_TIMING = {
  /** Time until SERVER_ACK status */
  SERVER_ACK_MS: 300,
  /** Time until DELIVERY_ACK status */
  DELIVERY_ACK_MS: 1500,
  /** Minimum time until READ + auto-reply */
  REPLY_MIN_MS: 2000,
  /** Maximum time until READ + auto-reply */
  REPLY_MAX_MS: 3000,
} as const;

export class DeliveryScheduler {
  constructor(
    private readonly store: CompositeStore,
    private readonly contactNameResolver: ContactNameResolver,
    private readonly timing: typeof DELIVERY_TIMING = DELIVERY_TIMING,
  ) {}

  /**
   * Schedule delivery progression and auto-reply for a sent message.
   */
  schedule(
    instance: string,
    messageId: string,
    jid: string,
    fixtures: InstanceFixtures,
  ): void {
    // Status progression: PENDING → SERVER_ACK → DELIVERY_ACK
    setTimeout(
      () => this.store.updateMessageStatus(instance, messageId, 'SERVER_ACK'),
      this.timing.SERVER_ACK_MS,
    );

    setTimeout(
      () => this.store.updateMessageStatus(instance, messageId, 'DELIVERY_ACK'),
      this.timing.DELIVERY_ACK_MS,
    );

    // Auto-reply with READ status
    const replyDelay = this.timing.REPLY_MIN_MS + Math.random() * (this.timing.REPLY_MAX_MS - this.timing.REPLY_MIN_MS);

    setTimeout(() => {
      this.handleReply(instance, messageId, jid, fixtures);
    }, replyDelay);
  }

  private handleReply(
    instance: string,
    messageId: string,
    jid: string,
    fixtures: InstanceFixtures,
  ): void {
    // Mark as READ right before the reply (they read it then typed)
    this.store.updateMessageStatus(instance, messageId, 'READ');

    const replyId = `reply-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const isGroup = jid.endsWith('@g.us');

    if (isGroup) {
      this.sendGroupReply(instance, jid, replyId, fixtures);
    } else {
      this.sendDirectReply(instance, jid, replyId, fixtures);
    }
  }

  private sendGroupReply(
    instance: string,
    jid: string,
    replyId: string,
    fixtures: InstanceFixtures,
  ): void {
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

    this.store.addMessage(instance, {
      key: { remoteJid: jid, fromMe: false, id: replyId, participant },
      pushName,
      messageType: 'conversation',
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: { conversation: 'Example response' },
    });
  }

  private sendDirectReply(
    instance: string,
    jid: string,
    replyId: string,
    fixtures: InstanceFixtures,
  ): void {
    const pushName = this.contactNameResolver.resolve(instance, jid, fixtures);

    this.store.addMessage(instance, {
      key: { remoteJid: jid, fromMe: false, id: replyId },
      pushName,
      messageType: 'conversation',
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: { conversation: 'Example response' },
    });
  }
}
