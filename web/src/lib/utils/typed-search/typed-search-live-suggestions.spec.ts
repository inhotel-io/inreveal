import { describe, expect, it } from 'vitest';
import { resolveLiveTypedSearchSuggestions } from './typed-search-live-suggestions';
import { parseTypedSearch } from './typed-search-parser';

describe('resolveLiveTypedSearchSuggestions foundation', () => {
  it('returns idle for unsupported typed tokens', async () => {
    const parsed = parseTypedSearch('camera:nik', { mode: 'draft' });

    await expect(resolveLiveTypedSearchSuggestions({ parsed, activeToken: parsed.tokens[0] })).resolves.toEqual({
      status: 'idle',
    });
  });
});
