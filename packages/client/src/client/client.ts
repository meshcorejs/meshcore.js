import {
  type ChannelMessageFrame,
  type ContactMessageFrame,
  type DeviceInfo,
  MIN_FIRMWARE_VERSION,
  type PushFrame,
  type SelfInfo,
  TxtType,
} from '@meshcorejs/protocol';
import { type Transport, TypedEmitter } from '@meshcorejs/transports';
import type { Brick } from '../bricks/brick.js';
import { CommandManager } from '../commands/command-manager.js';
import { coreCommands } from '../commands/core/index.js';
import { mergeReplies, type Replies } from '../commands/replies.js';
import {
  ClientStateError,
  ConnectionError,
  LoadError,
  RadioConfigError,
  RadioError,
  RateLimitError,
  UnsupportedFirmwareError,
} from '../errors.js';
import { EventManager } from '../events/event-manager.js';
import { JobManager } from '../jobs/job-manager.js';
import { createConsoleLogger, type Logger } from '../logger.js';
import { ChannelManager } from '../managers/channel-manager.js';
import { ContactManager } from '../managers/contact-manager.js';
import { SendQueue } from '../messages/send-queue.js';
import { Permissions } from '../permissions/permission-builder.js';
import { PermissionManager, RoleManager } from '../permissions/permission-manager.js';
import { PluginManager } from '../plugins/plugin-manager.js';
import { Radio } from '../radio/radio.js';
import type { RadioConfig, RadioSetting } from '../radio/radio-config.js';
import { formatParams, paramsFromSelf } from '../radio/radio-settings.js';
import { Message, parseChannelText } from '../structures/message.js';
import type { ClientEvents, ErrorSource } from './events.js';
import { BrickLoader, type LoadOptions } from './loader.js';
import { BrickRegistry } from './registry.js';

/** Infrastructure for a `Client`: transport, optional radio config, replies override, logger, app name, bricks dir, max hops. */
export interface ClientOptions {
  transport: Transport;
  radio?: RadioConfig;
  replies?: Partial<Replies>;
  logger?: Logger;
  appName?: string;
  load?: string | URL;
  /** Ignore commands and refuse `message.reply()` beyond this many hops (`Message.hopCount`). Default: no limit */
  maxHops?: number;
}

/** Lifecycle state of a `Client`, from construction to `destroy()`. */
export type ClientStatus = 'idle' | 'connecting' | 'ready' | 'reconnecting' | 'destroyed';

/** Delay before the first reconnection attempt; doubles on each further failure, not configurable. */
export const RECONNECT_BASE_DELAY_MS = 1000;
/** Cap on the exponential reconnection backoff, not configurable. */
export const RECONNECT_MAX_DELAY_MS = 60_000;
/** Interval between health-check pings once connected, not configurable. */
export const HEALTH_CHECK_INTERVAL_MS = 60_000;
/** Consecutive health-check failures before a reconnection is triggered, not configurable. */
export const HEALTH_CHECK_MAX_FAILURES = 2;
/** How long `destroy()` waits for in-flight sends to flush before closing anyway, not configurable. */
export const DESTROY_FLUSH_TIMEOUT_MS = 5000;

/**
 * A bot: logs into a Companion radio over a Transport, keeps contact and channel caches, turns radio messages
 * into `Message` objects and runs the registered bricks. Takes infrastructure only (transport, radio config,
 * replies, logger); bot content comes from builders through `register()` / `load()`.
 */
export class Client extends TypedEmitter<ClientEvents> {
  readonly transport: Transport;
  readonly logger: Logger;
  readonly radio: Radio;
  readonly contacts: ContactManager;
  readonly channels: ChannelManager;
  readonly sendQueue: SendQueue;
  readonly commands: CommandManager;
  readonly events: EventManager;
  readonly jobs: JobManager;
  readonly permissions: PermissionManager;
  readonly roles: RoleManager;
  readonly plugins: PluginManager;
  readonly replies: Replies;
  readonly radioConfig: RadioConfig | null;
  readonly maxHops: number | null;
  /** @internal */
  readonly registry: BrickRegistry;
  readonly #appName: string;
  #pendingLoad: string | URL | null;
  readonly #loaders: BrickLoader[] = [];
  #status: ClientStatus = 'idle';
  #self: SelfInfo | null = null;
  #device: DeviceInfo | null = null;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #healthTimer: ReturnType<typeof setInterval> | null = null;
  #healthFailures = 0;
  #draining: Promise<void> | null = null;
  #drainAgain = false;
  readonly #onTransportClose = (error?: Error) => this.#handleDisconnect(error);

  /** @param options Transport and optional radio config, replies, logger, app name and load directory */
  constructor(options: ClientOptions) {
    super();
    this.transport = options.transport;
    this.logger = options.logger ?? createConsoleLogger();
    this.#appName = options.appName ?? 'meshcore.js';
    this.replies = mergeReplies(options.replies);
    if (options.maxHops !== undefined && (!Number.isInteger(options.maxHops) || options.maxHops < 0)) {
      throw new RangeError(`maxHops must be an integer >= 0, got ${options.maxHops}`);
    }
    this.maxHops = options.maxHops ?? null;
    this.radio = new Radio(this.transport);
    this.contacts = new ContactManager(this);
    this.channels = new ChannelManager(this);
    this.sendQueue = new SendQueue(this);
    this.commands = new CommandManager(this);
    this.events = new EventManager(this);
    this.jobs = new JobManager(this);
    this.permissions = new PermissionManager(this);
    this.roles = new RoleManager(this);
    this.radioConfig = options.radio ?? null;
    this.plugins = new PluginManager(this);
    this.registry = new BrickRegistry(this);
    this.#pendingLoad = options.load ?? null;
    this.register(coreCommands());

    this.radio.on('raw', (frame) => this.emit('raw', frame));
    this.radio.on('push', (frame) => this.#handlePush(frame));
    this.transport.on('close', this.#onTransportClose);
  }

  get status(): ClientStatus {
    return this.#status;
  }

  get isReady(): boolean {
    return this.#status === 'ready';
  }

  get self(): SelfInfo {
    if (!this.#self) throw new ClientStateError('client.self is only available after login()');
    return this.#self;
  }

  get device(): DeviceInfo {
    if (!this.#device) throw new ClientStateError('client.device is only available after login()');
    return this.#device;
  }

  /** @param bricks One builder or a list */
  register(bricks: Brick | Brick[]): this {
    this.registry.registerAll((Array.isArray(bricks) ? bricks : [bricks]).map((brick) => ({ brick })));
    if (this.#status !== 'idle') void this.plugins.loadPendingReporting();
    return this;
  }

  /**
   * @param directory Folder to scan, or a module path standing for its folder
   * @param options watch enables hot reload
   */
  async load(directory: string | URL, options: LoadOptions = {}): Promise<void> {
    const loader = new BrickLoader(this, directory);
    await loader.load();
    this.#loaders.push(loader);
    if (this.#status !== 'idle') await this.plugins.loadPending();
    if (options.watch) loader.watch();
  }

  async login(): Promise<void> {
    if (this.#status !== 'idle') throw new ClientStateError(`login() called while ${this.#status}`);
    if (this.#pendingLoad !== null) {
      await this.load(this.#pendingLoad);
      this.#pendingLoad = null;
    }
    await this.plugins.loadPending();
    const issues = this.registry.validate();
    if (issues.length > 0) throw new LoadError(issues);
    this.#status = 'connecting';
    try {
      await this.#connectAndSync(true);
    } catch (error) {
      this.#status = 'idle';
      this.radio.reset(new ConnectionError('login failed'));
      await this.transport.close().catch(() => undefined);
      if (
        error instanceof ConnectionError ||
        error instanceof UnsupportedFirmwareError ||
        error instanceof LoadError ||
        error instanceof RadioConfigError
      ) {
        throw error;
      }
      throw new ConnectionError(`handshake with the radio failed: ${(error as Error).message}`, { cause: error });
    }
    this.#becomeReady();
    this.permissions.whoHas(Permissions.Administrator).then(
      (holders) => {
        if (this.roles.size > 0 && holders.length === 0)
          this.logger.warn('no role grants Permissions.Administrator to anyone');
      },
      (error: unknown) => this._reportError(error, { type: 'internal', name: 'permissions' }),
    );
  }

  async destroy(): Promise<void> {
    if (this.#status === 'destroyed') return;
    await this.sendQueue.close(this.#status === 'ready' ? DESTROY_FLUSH_TIMEOUT_MS : 0);
    this.#status = 'destroyed';
    this.#clearTimers();
    this.jobs.stop();
    for (const loader of this.#loaders.splice(0)) loader.close();
    this.transport.off('close', this.#onTransportClose);
    this.radio.reset(new ConnectionError('client destroyed'));
    await this.transport.close();
  }

  _reportError(error: unknown, source: ErrorSource): void {
    const err = error instanceof Error ? error : new Error(String(error));
    if (this.listenerCount('error') > 0) this.emit('error', err, source);
    else this.logger.error(`${source.type}${source.name ? ` "${source.name}"` : ''} failed: ${err.message}`, err);
  }

  async #connectAndSync(initial: boolean): Promise<void> {
    await this.transport.connect();
    this.#self = await this.radio.appStart(this.#appName);
    const device = await this.radio.deviceQuery();
    if (device.firmwareVersion < MIN_FIRMWARE_VERSION) {
      throw new UnsupportedFirmwareError(device.firmwareVersion, MIN_FIRMWARE_VERSION);
    }
    this.#device = device;
    await this.radio.setDeviceTime(Math.floor(Date.now() / 1000));
    await this.#applyRadioConfig();
    await this.contacts.fetch({ emitEvents: !initial });
    await this.channels.fetch({ emitEvents: !initial });
    await this.#drainMessages(true);
  }

  async #applyRadioConfig(): Promise<void> {
    const config = this.radioConfig;
    if (!config) return;
    const self = this.self;
    const changes = config.diff(self);
    if (changes.length === 0) return;
    if (changes.includes('txPower') && config.txPower !== undefined && config.txPower > self.maxTxPowerDbm) {
      throw new RadioConfigError(
        'txPower',
        `txPower ${config.txPower} dBm exceeds the radio's maximum (${self.maxTxPowerDbm} dBm)`,
      );
    }
    for (const setting of changes) {
      try {
        await this.#applyRadioSetting(setting, config, self);
      } catch (error) {
        if (error instanceof RadioError) {
          throw new RadioConfigError(setting, `${setting}: ${error.message}`, error.radioCode, { cause: error });
        }
        throw error;
      }
    }
    this.#self = await this.radio.appStart(this.#appName);
    if (changes.includes('name') || changes.includes('location')) {
      try {
        await this.radio.sendSelfAdvert(true);
        this.logger.info('radio: advert sent (identity changed)');
      } catch (error) {
        if (!(error instanceof RateLimitError)) throw error;
        this.logger.warn(`radio: flood advert skipped, ${error.message}`);
      }
    }
  }

  async #applyRadioSetting(setting: RadioSetting, config: RadioConfig, self: SelfInfo): Promise<void> {
    switch (setting) {
      case 'name':
        if (config.name === undefined) return;
        this.logger.info(`radio: name "${self.name}" → "${config.name}"`);
        return this.radio.setAdvertName(config.name);
      case 'location':
        if (config.location === undefined) return;
        this.logger.info(
          `radio: location (${self.latitude}, ${self.longitude}) → (${config.location.lat}, ${config.location.lon})`,
        );
        return this.radio.setAdvertLatLon(config.location);
      case 'txPower':
        if (config.txPower === undefined) return;
        this.logger.info(`radio: txPower ${self.txPowerDbm} → ${config.txPower} dBm`);
        return this.radio.setTxPower(config.txPower);
      case 'params': {
        if (config.params === undefined) return;
        this.logger.info(`radio: params ${formatParams(paramsFromSelf(self))} → ${formatParams(config.params)}`);
        const device = this.device;
        const options = device.firmwareVersion >= 9 ? { repeat: device.repeatEnabled ?? false } : {};
        return this.radio.setRadioParams(config.params, options);
      }
    }
  }

  #becomeReady(): void {
    this.#status = 'ready';
    this.#healthFailures = 0;
    this.#healthTimer = setInterval(() => this.#checkHealth(), HEALTH_CHECK_INTERVAL_MS);
    this.emit('ready');
    this.sendQueue.resume();
    this.jobs.start();
  }

  #clearTimers(): void {
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    if (this.#healthTimer) clearInterval(this.#healthTimer);
    this.#reconnectTimer = null;
    this.#healthTimer = null;
  }

  #checkHealth(): void {
    if (this.#status !== 'ready') return;
    this.radio.getBattAndStorage().then(
      () => {
        this.#healthFailures = 0;
      },
      (error: unknown) => {
        this.#healthFailures++;
        this.logger.warn(`health check failed (${this.#healthFailures}/${HEALTH_CHECK_MAX_FAILURES})`, error);
        if (this.#healthFailures < HEALTH_CHECK_MAX_FAILURES || this.#status !== 'ready') return;
        void this.transport
          .close()
          .finally(() => this.#handleDisconnect(new ConnectionError('radio stopped responding')));
      },
    );
  }

  #handleDisconnect(error?: Error): void {
    if (this.#status !== 'ready') return;
    this.#status = 'reconnecting';
    this.#clearTimers();
    this.radio.reset(new ConnectionError('connection to the radio lost', { cause: error }));
    this.logger.warn(`disconnected from the radio${error ? `: ${error.message}` : ''}`);
    this.emit('disconnect', error);
    this.#scheduleReconnect(1);
  }

  #scheduleReconnect(attempt: number): void {
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS);
    this.emit('reconnecting', attempt, delay);
    this.#reconnectTimer = setTimeout(async () => {
      this.#reconnectTimer = null;
      if (this.#status !== 'reconnecting') return;
      try {
        await this.#connectAndSync(false);
      } catch (error) {
        this.logger.warn(`reconnection attempt ${attempt} failed: ${(error as Error).message}`);
        this.radio.reset(new ConnectionError('reconnection failed'));
        await this.transport.close().catch(() => undefined);
        if (this.#status === 'reconnecting') this.#scheduleReconnect(attempt + 1);
        return;
      }
      if (this.#status !== 'reconnecting') return;
      this.logger.info('reconnected to the radio');
      this.#becomeReady();
    }, delay);
  }

  #handlePush(frame: PushFrame): void {
    if (frame.type === 'sendConfirmed') {
      this.sendQueue.handleSendConfirmed(frame.ack);
      return;
    }
    if (frame.type === 'msgWaiting') {
      if (this.#status === 'ready') {
        this.#drainMessages(false).catch((error: unknown) =>
          this._reportError(error, { type: 'internal', name: 'sync' }),
        );
      }
      return;
    }
    this.contacts
      ._handlePush(frame)
      .catch((error: unknown) => this._reportError(error, { type: 'internal', name: frame.type }));
  }

  #drainMessages(backlog: boolean): Promise<void> {
    if (this.#draining) {
      this.#drainAgain = true;
      return this.#draining;
    }
    const run = async () => {
      do {
        this.#drainAgain = false;
        for (let frame = await this.radio.syncNextMessage(); frame; frame = await this.radio.syncNextMessage()) {
          await this.#handleIncoming(frame, backlog);
        }
      } while (this.#drainAgain);
    };
    this.#draining = run().finally(() => {
      this.#draining = null;
    });
    return this.#draining;
  }

  async #handleIncoming(frame: ContactMessageFrame | ChannelMessageFrame, backlog: boolean): Promise<void> {
    if (frame.txtType === TxtType.CliData) {
      this.logger.debug('ignoring CLI data message');
      return;
    }
    if (frame.type === 'contactMessage') {
      let author = this.contacts.get(frame.senderPrefix);
      if (!author) {
        await this.contacts.fetch();
        author = this.contacts.get(frame.senderPrefix);
      }
      if (!author) {
        this.logger.warn(`dropping direct message from unknown contact ${frame.senderPrefix}`);
        return;
      }
      this.#emitMessage(
        new Message(this, {
          content: frame.text,
          senderTimestamp: frame.senderTimestamp,
          snr: frame.snr,
          hopCount: frame.hopCount,
          backlog,
          author,
          channel: null,
        }),
      );
      return;
    }
    const channel = this.channels.get(frame.channelIndex);
    if (!channel) {
      this.logger.warn(`dropping message from unknown channel slot ${frame.channelIndex}`);
      return;
    }
    const { authorName, content } = parseChannelText(frame.text);
    this.#emitMessage(
      new Message(this, {
        content,
        senderTimestamp: frame.senderTimestamp,
        snr: frame.snr,
        hopCount: frame.hopCount,
        backlog,
        author: { name: authorName, verified: false },
        channel,
      }),
    );
  }

  #emitMessage(message: Message): void {
    try {
      this.emit('messageCreate', message);
    } catch (error) {
      this._reportError(error, { type: 'internal', name: 'messageCreate' });
    }
  }
}
