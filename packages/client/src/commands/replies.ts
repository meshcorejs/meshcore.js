/** Every text the bot says on its own: refusals, usage errors, and the answers of the built-in `help`, `plugins` and `jobs` commands. Functions receive what they need to format the reply. */
export interface Replies {
  unknownCommandDM: string;
  unknownCommandChannel: string;
  noCommands: string;
  internalError: string;
  channelUntrusted: string;
  missingPermissions: string;
  /** @param seconds Seconds left */
  cooldown(seconds: number): string;
  /**
   * @param name Argument name
   * @param usage Command usage line
   */
  invalidArgument(name: string, usage: string): string;
  /**
   * @param name Argument name
   * @param usage Command usage line
   */
  missingArgument(name: string, usage: string): string;
  /** @param usage Command usage line */
  tooManyArguments(usage: string): string;
  /** @param usage Command usage line */
  usage(usage: string): string;
  noPlugins: string;
  /**
   * @param name Plugin name
   * @param loaded Whether it is loaded
   * @param count Number of bricks
   */
  pluginLine(name: string, loaded: boolean, count: number): string;
  /**
   * @param name Plugin name
   * @param count Number of bricks
   */
  pluginLoaded(name: string, count: number): string;
  /**
   * @param name Plugin name
   * @param count Number of bricks
   */
  pluginReloaded(name: string, count: number): string;
  /** @param name Plugin name */
  pluginUnloaded(name: string): string;
  /** @param name Plugin name */
  pluginAlreadyLoaded(name: string): string;
  /** @param name Plugin name */
  pluginAlreadyUnloaded(name: string): string;
  /**
   * @param name Plugin name
   * @param issue First problem found
   */
  pluginFailed(name: string, issue: string): string;
  unknownPlugin: string;
  noJobs: string;
  /**
   * @param name Job name
   * @param state scheduled, paused or running
   * @param nextRun HH:MM of the next run, or null
   */
  jobLine(name: string, state: 'scheduled' | 'paused' | 'running', nextRun: string | null): string;
  /** @param name Job name */
  jobStarted(name: string): string;
  /** @param name Job name */
  jobAlreadyRunning(name: string): string;
  /** @param name Job name */
  jobPaused(name: string): string;
  /** @param name Job name */
  jobResumed(name: string): string;
  /** @param name Job name */
  jobAlreadyPaused(name: string): string;
  /** @param name Job name */
  jobNotPaused(name: string): string;
  unknownJob: string;
}

const jobIcon = { scheduled: '▶️', paused: '⏸️', running: '🔄' } as const;

const jobLine: Replies['jobLine'] = (name, state, nextRun) =>
  state === 'scheduled' ? `${name} ${jobIcon.scheduled} ${nextRun ?? '--'}` : `${name} ${jobIcon[state]}`;

const pluginLine: Replies['pluginLine'] = (name, loaded, count) => (loaded ? `${name} ✅ ${count}` : `${name} ⏸️`);

/** The default replies, in English. */
export const englishReplies: Replies = Object.freeze<Replies>({
  unknownCommandDM: '❓ Unknown command, /help',
  unknownCommandChannel: '❓ Unknown command',
  noCommands: 'No commands available',
  internalError: '❌ Internal error',
  channelUntrusted: '↪️ Send me this command in a DM',
  missingPermissions: '⛔ Permission denied',
  cooldown: (seconds) => `⏳ Try again in ${seconds}s`,
  invalidArgument: (name, usage) => `⚠️ ${name} is invalid\n${usage}`,
  missingArgument: (name, usage) => `⚠️ ${name} is missing\n${usage}`,
  tooManyArguments: (usage) => `⚠️ too many arguments\n${usage}`,
  usage: (usage) => `⚠️ usage\n${usage}`,
  noPlugins: 'No plugins',
  pluginLine,
  pluginLoaded: (name, count) => `✅ ${name} loaded (${count})`,
  pluginReloaded: (name, count) => `✅ ${name} reloaded (${count})`,
  pluginUnloaded: (name) => `⏸️ ${name} unloaded`,
  pluginAlreadyLoaded: (name) => `ℹ️ ${name} is already loaded`,
  pluginAlreadyUnloaded: (name) => `ℹ️ ${name} is already unloaded`,
  pluginFailed: (name, issue) => `❌ ${name}: ${issue}`,
  unknownPlugin: '❓ Unknown plugin',
  noJobs: 'No jobs',
  jobLine,
  jobStarted: (name) => `▶️ ${name} started`,
  jobAlreadyRunning: (name) => `ℹ️ ${name} is already running`,
  jobPaused: (name) => `⏸️ ${name} paused`,
  jobResumed: (name) => `▶️ ${name} resumed`,
  jobAlreadyPaused: (name) => `ℹ️ ${name} is already paused`,
  jobNotPaused: (name) => `ℹ️ ${name} is not paused`,
  unknownJob: '❓ Unknown job',
});

/** A complete French set of replies, to pass as `replies` to the `Client`. */
export const frenchReplies: Replies = Object.freeze<Replies>({
  unknownCommandDM: '❓ Commande inconnue, /help',
  unknownCommandChannel: '❓ Commande inconnue',
  noCommands: 'Aucune commande disponible',
  internalError: '❌ Erreur interne',
  channelUntrusted: '↪️ Envoie-moi cette commande en DM',
  missingPermissions: '⛔ Permission refusée',
  cooldown: (seconds) => `⏳ Réessaie dans ${seconds}s`,
  invalidArgument: (name, usage) => `⚠️ ${name} invalide\n${usage}`,
  missingArgument: (name, usage) => `⚠️ ${name} manquant\n${usage}`,
  tooManyArguments: (usage) => `⚠️ trop d'arguments\n${usage}`,
  usage: (usage) => `⚠️ usage\n${usage}`,
  noPlugins: 'Aucun plugin',
  pluginLine,
  pluginLoaded: (name, count) => `✅ ${name} chargé (${count})`,
  pluginReloaded: (name, count) => `✅ ${name} rechargé (${count})`,
  pluginUnloaded: (name) => `⏸️ ${name} déchargé`,
  pluginAlreadyLoaded: (name) => `ℹ️ ${name} est déjà chargé`,
  pluginAlreadyUnloaded: (name) => `ℹ️ ${name} est déjà déchargé`,
  pluginFailed: (name, issue) => `❌ ${name} : ${issue}`,
  unknownPlugin: '❓ Plugin inconnu',
  noJobs: 'Aucun job',
  jobLine,
  jobStarted: (name) => `▶️ ${name} lancé`,
  jobAlreadyRunning: (name) => `ℹ️ ${name} est déjà en cours`,
  jobPaused: (name) => `⏸️ ${name} en pause`,
  jobResumed: (name) => `▶️ ${name} repris`,
  jobAlreadyPaused: (name) => `ℹ️ ${name} est déjà en pause`,
  jobNotPaused: (name) => `ℹ️ ${name} n'est pas en pause`,
  unknownJob: '❓ Job inconnu',
});

/** The default replies (`englishReplies`), under the name of the interface. */
export const Replies: Replies = englishReplies;

/**
 * The English defaults with `overrides` applied on top; what `Client` does with its `replies` option.
 * @param overrides Texts replacing the English defaults
 */
export function mergeReplies(overrides: Partial<Replies> = {}): Replies {
  return Object.freeze<Replies>({ ...englishReplies, ...overrides });
}
