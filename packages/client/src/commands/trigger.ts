export type Trigger = { type: 'command'; name: string; argsText: string } | { type: 'helper' };

export function parseTrigger(content: string, isDM: boolean, botName: string): Trigger | null {
  const text = content.trim();
  let body: string;
  const mentioned = stripMention(text, botName);
  if (isDM && mentioned === null) {
    if (!text.startsWith('/')) return null;
    body = text.slice(1);
    if (/^\s/.test(body)) return null;
  } else {
    if (mentioned === null) return null;
    body = mentioned.trim();
    if (body === '?') return { type: 'helper' };
    if (body.startsWith('/')) return null;
  }
  if (body === '') return { type: 'helper' };
  const name = (body.split(/\s/, 1)[0] as string).toLowerCase();
  if (name === 'help') return { type: 'helper' };
  return { type: 'command', name, argsText: body.slice(name.length).trim() };
}

function stripMention(text: string, botName: string): string | null {
  const lower = text.toLowerCase();
  const name = botName.toLowerCase();
  for (const mention of [`@[${name}]`, `@${name}`]) {
    if (!lower.startsWith(mention)) continue;
    const rest = text.slice(mention.length);
    if (rest === '' || /^\s/.test(rest)) return rest;
  }
  return null;
}
