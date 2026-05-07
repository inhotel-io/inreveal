import { getAllPeople, getFilterSuggestions, searchPerson } from '@immich/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveLiveTypedSearchSuggestions } from './typed-search-live-suggestions';
import { parseTypedSearch } from './typed-search-parser';

vi.mock('@immich/sdk', async () => ({
  ...(await vi.importActual<typeof import('@immich/sdk')>('@immich/sdk')),
  getAllPeople: vi.fn(),
  getFilterSuggestions: vi.fn(),
  searchPerson: vi.fn(),
}));

describe('resolveLiveTypedSearchSuggestions foundation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns idle for unsupported typed tokens', async () => {
    const parsed = parseTypedSearch('camera:nik', { mode: 'draft' });

    await expect(resolveLiveTypedSearchSuggestions({ parsed, activeToken: parsed.tokens[0] })).resolves.toEqual({
      status: 'idle',
    });
  });

  it.each(['tag:travel', 'country:ge', 'city:par'])('keeps unsupported live key %s idle', async (search) => {
    const parsed = parseTypedSearch(search, { mode: 'draft' });

    await expect(resolveLiveTypedSearchSuggestions({ parsed, activeToken: parsed.tokens[0] })).resolves.toEqual({
      status: 'idle',
    });
  });

  it('searches people by active person token value with stable choice spans', async () => {
    vi.mocked(searchPerson).mockResolvedValue([
      { id: 'person-1', name: 'Anna Maria' },
      { id: 'person-2', name: 'Annika' },
    ] as never);
    const parsed = parseTypedSearch('beach person:ann', { mode: 'draft' });

    const result = await resolveLiveTypedSearchSuggestions({ parsed, activeToken: parsed.tokens[0] });

    expect(searchPerson).toHaveBeenCalledWith(
      { name: 'ann', withHidden: false, withSharedSpaces: true },
      expect.anything(),
    );
    expect(result).toEqual({
      status: 'ok',
      key: 'person',
      total: 2,
      items: [
        expect.objectContaining({
          id: 'person:6:16:person-1',
          key: 'person',
          label: 'Anna Maria',
          value: 'Anna Maria',
          tokenStart: 6,
          tokenEnd: 16,
          entityId: 'person-1',
        }),
        expect.objectContaining({ key: 'person', label: 'Annika', value: 'Annika', entityId: 'person-2' }),
      ],
    });
  });

  it('loads initial people suggestions for empty person token', async () => {
    vi.mocked(getAllPeople).mockResolvedValue({
      people: [{ id: 'person-1', name: 'Zoe' }],
      total: 1,
      hidden: 0,
      hasNextPage: false,
    } as never);
    const parsed = parseTypedSearch('person:', { mode: 'draft' });

    const result = await resolveLiveTypedSearchSuggestions({ parsed, activeToken: parsed.tokens[0] });

    expect(getAllPeople).toHaveBeenCalledWith({ size: 10, withSharedSpaces: true }, expect.anything());
    expect(result).toMatchObject({ status: 'ok', key: 'person', total: 1 });
  });

  it('uses space-scoped people suggestions when spaceId is present', async () => {
    vi.mocked(getFilterSuggestions).mockResolvedValue({
      people: [
        { id: 'space-person-1', name: 'Anna Space' },
        { id: 'space-person-2', name: 'Beth Space' },
      ],
      countries: [],
      cameraMakes: [],
      tags: [],
      ratings: [],
      mediaTypes: [],
      hasUnnamedPeople: false,
    } as never);
    const parsed = parseTypedSearch('person:ann', { mode: 'draft' });

    const result = await resolveLiveTypedSearchSuggestions({
      parsed,
      activeToken: parsed.tokens[0],
      spaceId: 'space-1',
    });

    expect(getFilterSuggestions).toHaveBeenCalledWith({ spaceId: 'space-1' }, expect.anything());
    expect(result).toMatchObject({ status: 'ok', key: 'person', total: 1 });
    if (result.status === 'ok') {
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({ entityId: 'space-person-1', label: 'Anna Space' });
    }
  });

  it('returns empty when no people match', async () => {
    vi.mocked(searchPerson).mockResolvedValue([]);
    const parsed = parseTypedSearch('person:zzzz', { mode: 'draft' });

    await expect(resolveLiveTypedSearchSuggestions({ parsed, activeToken: parsed.tokens[0] })).resolves.toEqual({
      status: 'empty',
      key: 'person',
    });
  });

  it('returns a quiet live error when person suggestions fail', async () => {
    vi.mocked(searchPerson).mockRejectedValue(new Error('network down'));
    const parsed = parseTypedSearch('person:ann', { mode: 'draft' });

    await expect(resolveLiveTypedSearchSuggestions({ parsed, activeToken: parsed.tokens[0] })).resolves.toEqual({
      status: 'error',
      key: 'person',
      message: 'network down',
    });
  });

  it('rethrows AbortError from person suggestions', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    vi.mocked(searchPerson).mockRejectedValue(abortError);
    const parsed = parseTypedSearch('person:ann', { mode: 'draft' });

    await expect(resolveLiveTypedSearchSuggestions({ parsed, activeToken: parsed.tokens[0] })).rejects.toBe(abortError);
  });
});
