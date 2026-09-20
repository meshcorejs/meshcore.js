import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path, { posix as posixPath } from 'node:path';
import {
  Application,
  DeclarationReflection,
  type ProjectReflection,
  ReflectionKind,
  type TypeDocOptions,
} from 'typedoc';
import type { PluginOptions } from 'typedoc-plugin-markdown';
import { type ModuleMove, remapLink, rewriteLinks, splitTitle, withFrontmatter } from './reference/markdown.js';
import { kindMeta, referenceMeta } from './reference/meta.js';
import { PACKAGES, type ReferencePackage } from './reference/packages.js';

const root = path.resolve(import.meta.dirname, '../../..');
const contentDir = path.resolve(import.meta.dirname, '../content/docs');
const strictEverywhere = process.env.REFERENCE_STRICT === '1';

const DOCUMENTED_KINDS =
  ReflectionKind.Class |
  ReflectionKind.Interface |
  ReflectionKind.Function |
  ReflectionKind.TypeAlias |
  ReflectionKind.Variable |
  ReflectionKind.Enum;

function undocumented(project: ProjectReflection): DeclarationReflection[] {
  return project.getReflectionsByKind(DOCUMENTED_KINDS).filter((ref): ref is DeclarationReflection => {
    if (!(ref instanceof DeclarationReflection)) return false;
    return !ref.hasComment() && !ref.signatures?.some((signature) => signature.hasComment());
  });
}

async function generate(pkg: ReferencePackage): Promise<boolean> {
  const out = path.join(contentDir, pkg.tab, 'reference');
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  const options: Partial<TypeDocOptions> & Partial<PluginOptions> = {
    entryPoints: pkg.entries.map((entry) => path.join(root, pkg.dir, entry)),
    tsconfig: path.join(root, pkg.dir, 'tsconfig.json'),
    plugin: ['typedoc-plugin-markdown'],
    out,
    readme: 'none',
    name: pkg.name,
    basePath: root,
    displayBasePath: root,
    disableGit: true,
    sourceLinkTemplate: 'https://github.com/meshcorejs/meshcore.js/blob/main/{path}#L{line}',
    excludeInternal: true,
    excludeExternals: true,
    validation: { notExported: true, invalidLink: true, notDocumented: false },
    outputFileStrategy: 'members',
    fileExtension: '.md',
    entryFileName: 'index',
    hidePageHeader: true,
    hideBreadcrumbs: true,
    useCodeBlocks: true,
    useHTMLEncodedBrackets: true,
  };
  const app = await Application.bootstrapWithPlugins(options as Partial<TypeDocOptions>);
  const project = await app.convert();
  if (!project) return false;
  app.validate(project);
  if (pkg.documented || strictEverywhere) {
    for (const ref of undocumented(project)) {
      const file = ref.sources?.[0]?.fileName ?? 'unknown file';
      app.logger.warn(
        `${ref.getFriendlyFullName()} (${ReflectionKind[ref.kind]}), defined in ${file}, does not have any documentation`,
      );
    }
  }
  if (app.logger.hasErrors() || app.logger.hasWarnings()) return false;
  await app.generateOutputs(project);

  await postprocess(out, pkg);
  return true;
}

async function postprocess(out: string, pkg: ReferencePackage): Promise<void> {
  const moves = moduleMoves(pkg);
  const niceTitle = (to: string) => (to === 'main' ? pkg.name : `${pkg.name}/${to}`);

  for (const file of await walk(out)) {
    const fileDir = posixPath.dirname(toPosixRelative(out, file));
    const markdown = await readFile(file, 'utf8');
    const page = splitTitle(markdown, path.basename(file, '.md'));
    const move = moves.find((m) => fileDir === m.from && path.basename(file) === 'index.md');
    const title = move ? niceTitle(move.to) : page.title;
    let body = rewriteLinks(page.body, (target) => remapLink(fileDir, target, moves));
    for (const m of moves) body = body.replaceAll(`[${m.from}]`, `[${niceTitle(m.to)}]`);
    await writeFile(file, withFrontmatter({ title, body }));
  }

  for (const move of [...moves].sort((a, b) => b.from.length - a.from.length)) {
    await rename(path.join(out, ...move.from.split('/')), path.join(out, ...move.to.split('/')));
  }
  if (moves.length > 0) {
    const wrapper = pkg.dir.split('/')[0];
    if (wrapper) await rm(path.join(out, wrapper), { recursive: true, force: true });
  }

  const subfolders = (await readdir(out, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  await writeJson(path.join(out, 'meta.json'), referenceMeta(subfolders));
  for (const folder of subfolders) {
    const meta = kindMeta(folder) ?? { title: moduleTitle(folder), pages: ['index', '...'] };
    await writeJson(path.join(out, folder, 'meta.json'), meta);
    for (const kind of (await readdir(path.join(out, folder), { withFileTypes: true })).filter((e) =>
      e.isDirectory(),
    )) {
      const nested = kindMeta(kind.name);
      if (nested) await writeJson(path.join(out, folder, kind.name, 'meta.json'), nested);
    }
  }
}

function moduleMoves(pkg: ReferencePackage): ModuleMove[] {
  if (pkg.entries.length < 2) return [];
  return pkg.entries.map((entry) => {
    const from = posixPath.join(pkg.dir, entry).replace(/(\/index)?\.tsx?$/, '');
    const dir = posixPath.dirname(entry);
    const to = dir === 'src' ? 'main' : posixPath.basename(dir);
    return { from, to };
  });
}

function moduleTitle(folder: string): string {
  return folder === 'main' ? 'Main entry' : `/${folder} subpath`;
}

function toPosixRelative(base: string, file: string): string {
  return path.relative(base, file).split(path.sep).join('/');
}

async function walk(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(p)));
    else if (entry.name.endsWith('.md')) files.push(p);
  }
  return files;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

const failed: string[] = [];
for (const pkg of PACKAGES) {
  if (await generate(pkg)) console.log(`reference: ${pkg.name} → content/docs/${pkg.tab}/reference`);
  else failed.push(pkg.name);
}
if (failed.length > 0) {
  console.error(`reference: TypeDoc reported problems for ${failed.join(', ')} (see the warnings above)`);
  process.exit(1);
}
