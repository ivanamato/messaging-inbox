/**
 * Deleted ID store - tracks deleted message IDs.
 * Single responsibility: tracking which messages have been deleted.
 */

export interface IDeletedStore {
  add(instance: string, id: string): void;
  has(instance: string, id: string): boolean;
  getAll(instance: string): Set<string>;
}

export class DeletedStore implements IDeletedStore {
  private deletedIds = new Map<string, Set<string>>();

  private getFor(instance: string): Set<string> {
    if (!this.deletedIds.has(instance)) {
      this.deletedIds.set(instance, new Set());
    }
    return this.deletedIds.get(instance)!;
  }

  add(instance: string, id: string): void {
    this.getFor(instance).add(id);
  }

  has(instance: string, id: string): boolean {
    return this.getFor(instance).has(id);
  }

  getAll(instance: string): Set<string> {
    return this.getFor(instance);
  }

  reset(instance?: string): void {
    if (instance) {
      this.deletedIds.delete(instance);
    } else {
      this.deletedIds.clear();
    }
  }
}
