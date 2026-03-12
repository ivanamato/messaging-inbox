/**
 * Mutation event emitter - handles WebSocket event broadcasting.
 * Single responsibility: managing mutation event listeners and emission.
 */

export type StoreMutationEvent = {
  instance: string;
  type: string;
  data: unknown;
};

type MutationHandler = (event: StoreMutationEvent) => void;

export interface IMutationEmitter {
  emit(event: StoreMutationEvent): void;
  subscribe(handler: MutationHandler): () => void;
}

export class MutationEmitter implements IMutationEmitter {
  private handlers = new Set<MutationHandler>();

  emit(event: StoreMutationEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }

  subscribe(handler: MutationHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  reset(): void {
    this.handlers.clear();
  }
}
