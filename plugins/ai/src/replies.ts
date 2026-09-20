export interface Replies {
  /** The model could not be reached, or answered nothing. */
  unavailable: string;
  /** `/ask` without a question. */
  empty: string;
}

export const englishReplies: Replies = Object.freeze<Replies>({
  unavailable: '⚠️ The assistant is unavailable, try again later',
  empty: '❓ Ask me something: /ask <question>',
});

export const frenchReplies: Replies = Object.freeze<Replies>({
  unavailable: "⚠️ L'assistant est indisponible, réessaie plus tard",
  empty: '❓ Pose-moi une question : /ask <question>',
});

/**
 * The English defaults with `overrides` applied on top.
 * @param overrides Texts replacing the English defaults
 */
export function mergeReplies(overrides: Partial<Replies> = {}): Replies {
  return Object.freeze<Replies>({ ...englishReplies, ...overrides });
}
