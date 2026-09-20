import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REGION = /^\s*\/\/ #region (\S+)\s*$/;
const ENDREGION = /^\s*\/\/ #endregion(?:\s+\S+)?\s*$/;

export function extractRegion(source: string, name: string): string {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => REGION.exec(line)?.[1] === name);
  if (start === -1) throw new Error(`region "${name}" not found`);

  const body: string[] = [];
  let depth = 1;
  for (const line of lines.slice(start + 1)) {
    if (REGION.test(line)) {
      depth++;
      continue;
    }
    if (ENDREGION.test(line)) {
      depth--;
      if (depth === 0) return trimBlankLines(body).join('\n');
      continue;
    }
    body.push(line);
  }
  throw new Error(`region "${name}" is not closed`);
}

function trimBlankLines(lines: string[]): string[] {
  let from = 0;
  let to = lines.length;
  while (from < to && lines[from]?.trim() === '') from++;
  while (to > from && lines[to - 1]?.trim() === '') to--;
  return lines.slice(from, to);
}

export function readSnippet(file: string, region?: string): string {
  const source = readFileSync(join(process.cwd(), 'snippets', file), 'utf8');
  return region === undefined ? source.trimEnd() : extractRegion(source, region);
}
