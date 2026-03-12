/**
 * Media store - handles media blob storage.
 * Single responsibility: storing and retrieving media payloads.
 */

type MediaEntry = { base64: string; mimetype: string };

export interface IMediaStore {
  store(instance: string, messageId: string, base64: string, mimetype: string): void;
  get(instance: string, messageId: string): MediaEntry | undefined;
}

export class MediaStore implements IMediaStore {
  private media = new Map<string, MediaEntry>();

  private key(instance: string, messageId: string): string {
    return `${instance}:${messageId}`;
  }

  store(instance: string, messageId: string, base64: string, mimetype: string): void {
    this.media.set(this.key(instance, messageId), { base64, mimetype });
  }

  get(instance: string, messageId: string): MediaEntry | undefined {
    return this.media.get(this.key(instance, messageId));
  }

  reset(instance?: string): void {
    if (instance) {
      // Delete all keys starting with instance:
      for (const key of this.media.keys()) {
        if (key.startsWith(`${instance}:`)) {
          this.media.delete(key);
        }
      }
    } else {
      this.media.clear();
    }
  }
}

export type { MediaEntry };
