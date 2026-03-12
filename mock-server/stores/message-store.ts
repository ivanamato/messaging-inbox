/**
 * Message store - handles message storage and retrieval.
 * Single responsibility: managing message data for instances.
 */

import type { EvolutionMessageFixture } from '../fixtures.js';

export interface IMessageStore {
  add(instance: string, msg: EvolutionMessageFixture): void;
  getAll(instance: string): EvolutionMessageFixture[];
  getForJid(instance: string, jid: string): EvolutionMessageFixture[];
  getById(instance: string, id: string): EvolutionMessageFixture | undefined;
  updateStatus(instance: string, id: string, status: string): void;
}

export class MessageStore implements IMessageStore {
  private messages = new Map<string, EvolutionMessageFixture[]>();

  private getFor(instance: string): EvolutionMessageFixture[] {
    if (!this.messages.has(instance)) {
      this.messages.set(instance, []);
    }
    return this.messages.get(instance)!;
  }

  add(instance: string, msg: EvolutionMessageFixture): void {
    this.getFor(instance).push(msg);
  }

  getAll(instance: string): EvolutionMessageFixture[] {
    return this.getFor(instance);
  }

  getForJid(instance: string, jid: string): EvolutionMessageFixture[] {
    return this.getFor(instance).filter((m) => m.key.remoteJid === jid);
  }

  getById(instance: string, id: string): EvolutionMessageFixture | undefined {
    return this.getFor(instance).find((m) => m.key.id === id);
  }

  updateStatus(instance: string, id: string, status: string): EvolutionMessageFixture | undefined {
    const msg = this.getById(instance, id);
    if (msg) {
      msg.MessageUpdate = [{ status }];
    }
    return msg;
  }

  reset(instance?: string): void {
    if (instance) {
      this.messages.delete(instance);
    } else {
      this.messages.clear();
    }
  }
}
