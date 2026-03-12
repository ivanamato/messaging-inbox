/**
 * Unread store - tracks unread message counts per JID.
 * Single responsibility: managing unread counts and cleared status.
 */

export interface IUnreadStore {
  getPending(instance: string, jid: string): number;
  incrementPending(instance: string, jid: string): void;
  hasBeenCleared(instance: string, jid: string): boolean;
  clear(instance: string, jid: string): void;
}

export class UnreadStore implements IUnreadStore {
  private pendingUnread = new Map<string, Map<string, number>>();
  private clearedJids = new Map<string, Set<string>>();

  private getPendingFor(instance: string): Map<string, number> {
    if (!this.pendingUnread.has(instance)) {
      this.pendingUnread.set(instance, new Map());
    }
    return this.pendingUnread.get(instance)!;
  }

  private getClearedFor(instance: string): Set<string> {
    if (!this.clearedJids.has(instance)) {
      this.clearedJids.set(instance, new Set());
    }
    return this.clearedJids.get(instance)!;
  }

  getPending(instance: string, jid: string): number {
    return this.getPendingFor(instance).get(jid) ?? 0;
  }

  incrementPending(instance: string, jid: string): void {
    const pending = this.getPendingFor(instance);
    pending.set(jid, (pending.get(jid) ?? 0) + 1);
  }

  hasBeenCleared(instance: string, jid: string): boolean {
    return this.getClearedFor(instance).has(jid);
  }

  clear(instance: string, jid: string): void {
    this.getClearedFor(instance).add(jid);
    this.getPendingFor(instance).set(jid, 0);
  }

  reset(instance?: string): void {
    if (instance) {
      this.pendingUnread.delete(instance);
      this.clearedJids.delete(instance);
    } else {
      this.pendingUnread.clear();
      this.clearedJids.clear();
    }
  }
}
