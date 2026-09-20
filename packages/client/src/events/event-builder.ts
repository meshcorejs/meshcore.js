import { BRICK, type Brick } from '../bricks/brick.js';
import type { Client } from '../client/client.js';
import type { ClientEvents } from '../client/events.js';
import { LoadError } from '../errors.js';

/** The name of a `Client` event an `EventBuilder` can listen to. */
export type EventName = keyof ClientEvents & string;

/** What an `EventBuilder` builds: the event, whether it fires once, and the handler. */
export interface EventDefinition {
  event: EventName;
  once: boolean;
  handler: (client: Client, ...args: unknown[]) => unknown;
}

export class EventBuilder<E extends EventName = EventName> implements Brick<EventDefinition> {
  readonly [BRICK] = 'event' as const;
  #event: EventName | null = null;
  #once = false;
  #handler: EventDefinition['handler'] | null = null;

  /** @param event A Client event name */
  setEvent<const E2 extends EventName>(event: E2): EventBuilder<E2> {
    this.#event = event;
    return this as unknown as EventBuilder<E2>;
  }

  /** @param once Run the handler only once. Default true */
  setOnce(once = true): this {
    this.#once = once;
    return this;
  }

  /** @param handler Receives the client and the event arguments */
  setHandler(handler: (client: Client, ...args: ClientEvents[E]) => unknown): this {
    this.#handler = handler as EventDefinition['handler'];
    return this;
  }

  build(): EventDefinition {
    const problems: string[] = [];
    if (!this.#event) problems.push('setEvent() is required');
    if (!this.#handler) problems.push('setHandler() is required');
    if (problems.length > 0) {
      throw new LoadError(problems.map((message) => ({ brick: `event "${this.#event ?? '?'}"`, message })));
    }
    return { event: this.#event as EventName, once: this.#once, handler: this.#handler as EventDefinition['handler'] };
  }
}
