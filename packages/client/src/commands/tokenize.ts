export interface Token {
  value: string;
  start: number;
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i] as string)) i++;
    if (i >= input.length) break;
    const start = i;
    if (input[i] === '"') {
      const end = input.indexOf('"', i + 1);
      const stop = end === -1 ? input.length : end;
      tokens.push({ value: input.slice(i + 1, stop), start });
      i = end === -1 ? input.length : end + 1;
      continue;
    }
    while (i < input.length && !/\s/.test(input[i] as string)) i++;
    tokens.push({ value: input.slice(start, i), start });
  }
  return tokens;
}
