import { describe, expect, it } from 'vitest';
import { extractRegion } from '../lib/snippet.js';

const source = [
  "import { Client } from '@meshcorejs/client';",
  '',
  '// #region bot',
  'const client = new Client();',
  '',
  '// #region inner',
  'client.register([]);',
  '// #endregion inner',
  'await client.login();',
  '// #endregion bot',
  '',
  '// #region other',
  'console.log(1);',
  '// #endregion',
  '',
].join('\n');

describe('extractRegion', () => {
  it('returns the lines between the region markers, without the markers', () => {
    expect(extractRegion(source, 'other')).toBe('console.log(1);');
  });

  it('strips nested region markers and keeps their content', () => {
    expect(extractRegion(source, 'bot')).toBe(
      ['const client = new Client();', '', 'client.register([]);', 'await client.login();'].join('\n'),
    );
  });

  it('trims blank lines at both ends of the region', () => {
    expect(extractRegion('// #region a\n\n\nx\n\n// #endregion a\n', 'a')).toBe('x');
  });

  it('throws when the region does not exist', () => {
    expect(() => extractRegion(source, 'missing')).toThrow('region "missing" not found');
  });

  it('throws when the region is never closed', () => {
    expect(() => extractRegion('// #region a\nx\n', 'a')).toThrow('region "a" is not closed');
  });
});
