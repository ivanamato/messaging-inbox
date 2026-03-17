/**
 * Domain layer for message-related business logic.
 * Pure functions with no external dependencies.
 */

import type { Message } from '@/lib/providers/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MessageDirection = 'inbound' | 'outbound';
export type MessageStatus = 'pending' | 'sent' | 'failed' | 'DELIVERY_ACK' | 'READ' | 'SERVER_ACK';
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'reaction' | 'deleted' | 'revoked';

export type CreateOptimisticMessageParams = {
  id?: string;
  content: string;
  direction?: MessageDirection;
  phoneNumber: string;
  hasMedia?: boolean;
  messageType?: MessageType;
  caption?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  /** Local blob URL for immediate media preview (before server confirms) */
  mediaData?: { url: string; contentType?: string; filename?: string };
};

// ─── Factory Functions ────────────────────────────────────────────────────────

/**
 * Creates an optimistic message for immediate UI display.
 * Used before the server confirms the message was sent.
 */
export function createOptimisticMessage(params: CreateOptimisticMessageParams): Message {
  const {
    id,
    content,
    direction = 'outbound',
    phoneNumber,
    hasMedia = false,
    messageType = 'text',
    caption = null,
    filename = null,
    mimeType = null,
    mediaData,
  } = params;

  return {
    id: id ?? `optimistic-${Date.now()}`,
    direction,
    content,
    createdAt: new Date().toISOString(),
    status: 'pending',
    phoneNumber,
    hasMedia,
    ...(mediaData ? { mediaData } : {}),
    messageType,
    caption,
    reactionEmoji: null,
    reactedToMessageId: null,
    filename,
    mimeType,
  };
}

/**
 * Creates an optimistic voice message.
 */
export function createOptimisticVoiceMessage(
  phoneNumber: string,
  mimeType: string,
  id?: string,
): Message {
  return createOptimisticMessage({
    id,
    content: 'Voice message',
    phoneNumber,
    hasMedia: true,
    messageType: 'audio',
    filename: 'voice.ogg',
    mimeType,
  });
}

/**
 * Creates an optimistic media message (image/video).
 */
export function createOptimisticMediaMessage(
  phoneNumber: string,
  mediaType: 'image' | 'video',
  label: string,
  mimeType: string,
): Message {
  const filename = mediaType === 'image' ? 'image.jpg' : 'video.mp4';
  return createOptimisticMessage({
    content: label,
    phoneNumber,
    hasMedia: true,
    messageType: mediaType,
    filename,
    mimeType,
  });
}

// ─── Message Processing ────────────────────────────────────────────────────────

/**
 * Processes raw messages by merging reactions into their target messages
 * and sorting by creation time.
 */
export function processMessages(messages: Message[]): Message[] {
  const reactions = messages.filter(m => m.messageType === 'reaction');
  const regular = messages.filter(m => m.messageType !== 'reaction');

  // Build reaction map: target message ID -> emoji
  const reactionMap = new Map<string, string>();
  for (const r of reactions) {
    if (r.reactedToMessageId && r.reactionEmoji) {
      reactionMap.set(r.reactedToMessageId, r.reactionEmoji);
    }
  }

  // Merge reactions and sort
  return regular
    .map(m => {
      const emoji = reactionMap.get(m.id);
      return emoji ? { ...m, reactionEmoji: emoji } : m;
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/**
 * Removes optimistic messages from a list (used for reconciliation).
 */
export function removeOptimisticMessages(messages: Message[]): Message[] {
  return messages.filter(m => !m.id.startsWith('optimistic-'));
}

/**
 * Updates an optimistic message's status to failed.
 */
export function markMessageFailed(messages: Message[], messageId: string): Message[] {
  return messages.map(m => (m.id === messageId ? { ...m, status: 'failed' as const } : m));
}

// ─── 24-Hour Window Logic ──────────────────────────────────────────────────────

/**
 * Checks if the most recent inbound message is within 24 hours.
 * Used for messaging window restrictions on some platforms.
 */
export function isWithin24HourWindow(messages: Message[]): boolean {
  const inbound = messages.filter(m => m.direction === 'inbound');
  if (inbound.length === 0) return false;

  const last = inbound[inbound.length - 1];
  try {
    const date = new Date(last.createdAt);
    const now = new Date();
    const hoursDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    return hoursDiff < 24;
  } catch {
    return false;
  }
}

/**
 * Returns the appropriate disabled input message based on message history.
 */
export function getDisabledInputMessage(
  messages: Message[],
  noInboundMessage: string,
  outside24hMessage: string,
): string {
  return messages.some(m => m.direction === 'inbound') ? outside24hMessage : noInboundMessage;
}
