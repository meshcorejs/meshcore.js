import { posix as posixPath } from 'node:path';

export interface TitledPage {
  title: string;
  body: string;
}

const HEADING = /^# (?:[A-Za-z ]+: )?(.+)$/;

export function splitTitle(markdown: string, fallbackTitle: string): TitledPage {
  const newline = markdown.indexOf('\n');
  const firstLine = newline === -1 ? markdown : markdown.slice(0, newline);
  const match = HEADING.exec(firstLine);
  if (!match?.[1]) return { title: fallbackTitle, body: markdown };
  const rest = newline === -1 ? '' : markdown.slice(newline + 1);
  return { title: match[1].replace(/\\(.)/g, '$1'), body: rest.replace(/^\n+/, '') };
}

export function withFrontmatter(page: TitledPage): string {
  const title = page.title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `---\ntitle: "${title}"\n---\n\n${page.body}`;
}

export interface ModuleMove {
  from: string;
  to: string;
}

const EXTERNAL_LINK = /^(?:[a-z][a-z0-9+.-]*:|#)/i;
const LINK_TARGET = /]\(([^)\s]+)\)/g;

export function rewriteLinks(markdown: string, remap: (target: string) => string): string {
  return markdown.replace(LINK_TARGET, (match, target: string) =>
    EXTERNAL_LINK.test(target) ? match : `](${remap(target)})`,
  );
}

export function remapLink(fileDir: string, target: string, moves: readonly ModuleMove[]): string {
  const hashIndex = target.indexOf('#');
  const pathPart = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : target.slice(hashIndex);
  if (!pathPart) return target;
  const oldAbs = posixPath.normalize(posixPath.join(fileDir, pathPart));
  const newAbs = applyMoves(oldAbs, moves);
  const newFileDir = applyMoves(fileDir, moves);
  const rel = posixPath.relative(newFileDir, newAbs);
  const prefixed = rel.startsWith('../') || rel.startsWith('./') ? rel : `./${rel}`;
  return `${prefixed}${hash}`;
}

function applyMoves(target: string, moves: readonly ModuleMove[]): string {
  const byLongestFrom = [...moves].sort((a, b) => b.from.length - a.from.length);
  for (const move of byLongestFrom) {
    if (target === move.from) return move.to;
    if (target.startsWith(`${move.from}/`)) return move.to + target.slice(move.from.length);
  }
  return target;
}
