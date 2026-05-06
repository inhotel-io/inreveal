import { describe, expect, it } from 'vitest';
import { parseTypedSearch } from './typed-search-parser';
import { resolveLiveTypedSearchSuggestions } from './typed-search-live-suggestions';

describe('resolveLiveTypedSearchSuggestions foundation', () => {
  it('returns idle for unsupported typed tokens', async () => {
    const parsed = parseTypedSearch('camera:nik', { mode: 'draft' });

    await expect(resolveLiveTypedSearchSuggestions({ parsed, activeToken: parsed.tokens[0] })).resolves.toEqual({
      status: 'idle',
    });
  });
});
