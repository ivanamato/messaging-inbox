import type { Chat, Message, PaginatedMessages, SendResult } from '../providers/types';
import type { ValidationIssue } from './debug-store';

type Ctx = { method: string; deviceId: string };

export function validateChats(chats: Chat[], ctx: Ctx): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for duplicate IDs
  const ids = new Set<string>();
  for (const c of chats) {
    if (ids.has(c.id)) {
      issues.push({ severity: 'error', ...ctx, message: `Duplicate chat ID: ${c.id}` });
    }
    ids.add(c.id);
  }

  // Check required fields
  for (const c of chats) {
    if (!c.id) issues.push({ severity: 'error', ...ctx, message: 'Chat missing id' });
    if (!c.phoneNumber) issues.push({ severity: 'warning', ...ctx, message: `Chat ${c.id} missing phoneNumber` });
  }

  // Check sort order (should be descending by lastActiveAt)
  for (let i = 1; i < chats.length; i++) {
    const prev = chats[i - 1].lastActiveAt;
    const curr = chats[i].lastActiveAt;
    if (prev && curr && new Date(prev) < new Date(curr)) {
      issues.push({
        severity: 'warning',
        ...ctx,
        message: `Chats not sorted by recency at index ${i - 1}→${i}`,
        details: { prevDate: prev, currDate: curr },
      });
      break; // one warning is enough
    }
  }

  // Warn if many chats lack contact names
  const noName = chats.filter(c => !c.contactName).length;
  if (chats.length > 3 && noName > chats.length * 0.5) {
    issues.push({
      severity: 'warning',
      ...ctx,
      message: `${noName}/${chats.length} chats missing contactName`,
    });
  }

  return issues;
}

export function validateMessages(messages: Message[], ctx: Ctx): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for duplicate IDs
  const ids = new Set<string>();
  for (const m of messages) {
    if (ids.has(m.id)) {
      issues.push({ severity: 'error', ...ctx, message: `Duplicate message ID: ${m.id}` });
    }
    ids.add(m.id);
  }

  // Check required fields
  for (const m of messages) {
    if (!m.id) issues.push({ severity: 'error', ...ctx, message: 'Message missing id' });
    if (!m.direction) issues.push({ severity: 'error', ...ctx, message: `Message ${m.id} missing direction` });
    if (!m.createdAt) issues.push({ severity: 'warning', ...ctx, message: `Message ${m.id} missing createdAt` });
  }

  // Check media consistency
  for (const m of messages) {
    if (m.hasMedia && !m.metadata?.mediaId && !m.mimeType) {
      issues.push({
        severity: 'warning',
        ...ctx,
        message: `Message ${m.id} has hasMedia=true but no media metadata`,
      });
    }
  }

  return issues;
}

export function validatePaginatedMessages(result: PaginatedMessages, ctx: Ctx): ValidationIssue[] {
  const issues = validateMessages(result.messages, ctx);

  const { pagination } = result;
  if (pagination) {
    if (pagination.hasMore && pagination.currentPage >= pagination.totalPages) {
      issues.push({
        severity: 'warning',
        ...ctx,
        message: `hasMore=true but currentPage (${pagination.currentPage}) >= totalPages (${pagination.totalPages})`,
      });
    }
    if (!pagination.hasMore && pagination.currentPage < pagination.totalPages) {
      issues.push({
        severity: 'warning',
        ...ctx,
        message: `hasMore=false but currentPage (${pagination.currentPage}) < totalPages (${pagination.totalPages})`,
      });
    }
  }

  return issues;
}

export function validateSendResult(result: SendResult, ctx: Ctx): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!result.messageId) {
    issues.push({ severity: 'error', ...ctx, message: 'SendResult missing messageId' });
  }
  return issues;
}

export function validateConnectionState(state: string, ctx: Ctx): ValidationIssue[] {
  const valid = ['open', 'close', 'connecting'];
  if (!valid.includes(state)) {
    return [{ severity: 'error', ...ctx, message: `Unexpected connection state: "${state}" (expected: ${valid.join(', ')})` }];
  }
  return [];
}
