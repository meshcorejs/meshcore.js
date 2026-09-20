export const KIND_FOLDERS: ReadonlyArray<{ folder: string; title: string }> = [
  { folder: 'classes', title: 'Classes' },
  { folder: 'interfaces', title: 'Interfaces' },
  { folder: 'functions', title: 'Functions' },
  { folder: 'type-aliases', title: 'Types' },
  { folder: 'variables', title: 'Variables' },
  { folder: 'enumerations', title: 'Enumerations' },
];

export function kindMeta(folder: string): { title: string; pages: string[] } | undefined {
  const kind = KIND_FOLDERS.find((k) => k.folder === folder);
  return kind ? { title: kind.title, pages: ['...'] } : undefined;
}

export function referenceMeta(subfolders: string[]): { title: 'Reference'; pages: string[] } {
  const known = KIND_FOLDERS.map((k) => k.folder).filter((f) => subfolders.includes(f));
  const modules = subfolders.filter((f) => !known.includes(f)).sort();
  return { title: 'Reference', pages: ['index', ...known, ...modules] };
}
