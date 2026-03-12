/**
 * Contact store - handles dynamic contact storage.
 * Single responsibility: managing contacts created during runtime.
 */

type Contact = { remoteJid: string; pushName: string; profilePicUrl: null };

export interface IContactStore {
  upsert(instance: string, contact: Contact): void;
  get(instance: string, jid: string): Contact | undefined;
  getAll(instance: string): Contact[];
}

export class ContactStore implements IContactStore {
  private contacts = new Map<string, Map<string, Contact>>();

  private getFor(instance: string): Map<string, Contact> {
    if (!this.contacts.has(instance)) {
      this.contacts.set(instance, new Map());
    }
    return this.contacts.get(instance)!;
  }

  upsert(instance: string, contact: Contact): void {
    this.getFor(instance).set(contact.remoteJid, contact);
  }

  get(instance: string, jid: string): Contact | undefined {
    return this.getFor(instance).get(jid);
  }

  getAll(instance: string): Contact[] {
    return Array.from(this.getFor(instance).values());
  }

  reset(instance?: string): void {
    if (instance) {
      this.contacts.delete(instance);
    } else {
      this.contacts.clear();
    }
  }
}

export type { Contact };
