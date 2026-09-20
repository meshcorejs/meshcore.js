import { describe, expect, it } from 'vitest';
import { remapLink, rewriteLinks, splitTitle, withFrontmatter } from '../scripts/reference/markdown.js';
import { KIND_FOLDERS, kindMeta, referenceMeta } from '../scripts/reference/meta.js';

describe('splitTitle', () => {
  it('strips the kind prefix and the heading from a member page', () => {
    const page = splitTitle('# Class: FrameDecoder\n\nDefined in: x\n\n## Constructors\n', 'FrameDecoder');
    expect(page.title).toBe('FrameDecoder');
    expect(page.body).toBe('Defined in: x\n\n## Constructors\n');
  });

  it('unescapes Markdown escapes in the title', () => {
    expect(splitTitle('# Variable: MAX\\_FRAME\\_SIZE\n\nbody', 'x').title).toBe('MAX_FRAME_SIZE');
  });

  it('keeps a module heading as is', () => {
    expect(splitTitle('# @meshcorejs/protocol\n\n## Classes\n', 'index').title).toBe('@meshcorejs/protocol');
  });

  it('keeps the parentheses of a function page', () => {
    expect(splitTitle('# Function: encodeAppStart()\n\nbody', 'x').title).toBe('encodeAppStart()');
  });

  it('falls back to the file name when there is no heading', () => {
    const page = splitTitle('plain text\n', 'fallback');
    expect(page).toEqual({ title: 'fallback', body: 'plain text\n' });
  });
});

describe('withFrontmatter', () => {
  it('writes a quoted title and escapes double quotes', () => {
    expect(withFrontmatter({ title: 'say "hi"', body: 'b\n' })).toBe('---\ntitle: "say \\"hi\\""\n---\n\nb\n');
  });
});

describe('rewriteLinks', () => {
  it('rewrites relative link targets and leaves external and anchor links alone', () => {
    const markdown = 'See [A](../classes/A.md) and [ext](https://x) and [anchor](#y).';
    expect(rewriteLinks(markdown, (t) => `X/${t}`)).toBe(
      'See [A](X/../classes/A.md) and [ext](https://x) and [anchor](#y).',
    );
  });
});

describe('remapLink', () => {
  const moves = [
    { from: 'packages/transports/src', to: 'main' },
    { from: 'packages/transports/src/mock', to: 'mock' },
  ];

  it('adds a hop for a link from the main module into mock', () => {
    expect(remapLink('packages/transports/src', 'mock/index.md', moves)).toBe('../mock/index.md');
  });

  it('inserts the main folder for a link from mock back into the main module', () => {
    expect(remapLink('packages/transports/src/mock/classes', '../../classes/X.md', moves)).toBe(
      '../../main/classes/X.md',
    );
  });

  it('prefixes a bare relative link with ./ so Fumadocs resolves it to the page URL', () => {
    expect(remapLink('packages/transports/src', 'classes/X.md', moves)).toBe('./classes/X.md');
    expect(remapLink('packages/transports/src/classes', 'Y.md', moves)).toBe('./Y.md');
    expect(remapLink('packages/transports/src/classes', 'Y.md#method', moves)).toBe('./Y.md#method');
  });

  it('leaves a link that already starts with ./ or ../ as is', () => {
    expect(remapLink('packages/transports/src/classes', './Y.md', moves)).toBe('./Y.md');
    expect(remapLink('packages/transports/src/classes', '../index.md', moves)).toBe('../index.md');
  });

  it('keeps a fragment', () => {
    expect(remapLink('packages/transports/src/mock/classes', '../../classes/X.md#method', moves)).toBe(
      '../../main/classes/X.md#method',
    );
  });

  it('is a no-op with no moves', () => {
    expect(remapLink('classes', '../interfaces/Transport.md', [])).toBe('../interfaces/Transport.md');
  });
});

describe('meta', () => {
  it('knows the six TypeDoc kind folders in display order', () => {
    expect(KIND_FOLDERS.map((k) => k.folder)).toEqual([
      'classes',
      'interfaces',
      'functions',
      'type-aliases',
      'variables',
      'enumerations',
    ]);
    expect(kindMeta('type-aliases')).toEqual({ title: 'Types', pages: ['...'] });
    expect(kindMeta('unknown')).toBeUndefined();
  });

  it('orders the reference folder: index page, known kinds, then module folders alphabetically', () => {
    expect(referenceMeta(['variables', 'mock', 'classes', 'main'])).toEqual({
      title: 'Reference',
      pages: ['index', 'classes', 'variables', 'main', 'mock'],
    });
  });
});
