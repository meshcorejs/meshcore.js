import type { Client } from '../client/client.js';
import type { EventDefinition } from './event-builder.js';

export interface RegisteredEvent {
  readonly definition: EventDefinition;
  /** @internal */
  readonly listener: (...args: unknown[]) => void;
}

/** `client.events`: the event bricks currently registered, with the listeners attached to the client. */
export class EventManager {
  readonly client: Client;
  readonly #registered = new Set<RegisteredEvent>();

  /** @param client Owning client */
  constructor(client: Client) {
    this.client = client;
  }

  get size(): number {
    return this.#registered.size;
  }

  /** @internal */
  add(definition: EventDefinition): RegisteredEvent {
    const source = { type: 'event' as const, name: definition.event };
    const registered: RegisteredEvent = {
      definition,
      listener: (...args: unknown[]) => {
        if (definition.once) this.remove(registered);
        try {
          const result = definition.handler(this.client, ...args);
          if (result instanceof Promise) result.catch((error: unknown) => this.client._reportError(error, source));
        } catch (error) {
          this.client._reportError(error, source);
        }
      },
    };
    this.#registered.add(registered);
    this.client.on(definition.event, registered.listener as never);
    return registered;
  }

  /** @internal */
  remove(registered: RegisteredEvent): void {
    if (!this.#registered.delete(registered)) return;
    this.client.off(registered.definition.event, registered.listener as never);
  }
}
