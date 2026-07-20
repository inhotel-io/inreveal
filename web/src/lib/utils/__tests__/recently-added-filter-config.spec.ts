import { AssetTypeEnum, getFilterSuggestions, getSearchSuggestions, Type } from '@immich/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFilterState } from '$lib/components/filter-panel/filter-panel';
import { buildRecentlyAddedFilterConfig } from '$lib/utils/recently-added-filter-config';

vi.mock('@immich/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@immich/sdk')>();
  return {
    ...actual,
    getFilterSuggestions: vi.fn().mockResolvedValue({
      countries: ['Germany'],
      cameraMakes: ['Sony'],
      tags: [{ id: 'tag-1', value: 'Vacation' }],
      people: [{ id: 'person-1', name: 'Alice' }],
      ratings: [5],
      mediaTypes: ['IMAGE'],
      hasUnnamedPeople: false,
    }),
    getSearchSuggestions: vi.fn().mockResolvedValue(['Berlin']),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildRecentlyAddedFilterConfig', () => {
  it('exposes the nine metadata sections in plan order', () => {
    // 'text' is deliberately absent — it arrives in Slice 3 with the search path, so the input
    // is never rendered without a working submit.
    expect(buildRecentlyAddedFilterConfig().sections).toEqual([
      'timeline',
      'people',
      'location',
      'camera',
      'tags',
      'rating',
      'media',
      'favorites',
      'albums',
    ]);
  });

  it('never scopes suggestions to shared spaces, albums, or spaces', async () => {
    const config = buildRecentlyAddedFilterConfig();

    await config.suggestionsProvider!(createFilterState());
    await config.providers!.cities!('Germany');
    await config.providers!.cameraModels!('Sony');

    const filterRequest = vi.mocked(getFilterSuggestions).mock.calls[0][0];
    const cityRequest = vi.mocked(getSearchSuggestions).mock.calls[0][0];
    const cameraRequest = vi.mocked(getSearchSuggestions).mock.calls[1][0];

    for (const request of [filterRequest, cityRequest, cameraRequest]) {
      expect(request).not.toHaveProperty('withSharedSpaces');
      expect(request).not.toHaveProperty('albumId');
      expect(request).not.toHaveProperty('spaceId');
    }
  });

  it('maps tags and people suggestions', async () => {
    vi.mocked(getFilterSuggestions).mockResolvedValueOnce({
      countries: ['Germany'],
      cameraMakes: ['Sony'],
      tags: [{ id: 'tag-1', value: 'Vacation' }],
      people: [{ id: 'person-1', name: 'Alice' }],
      ratings: [5],
      mediaTypes: ['IMAGE'],
      hasUnnamedPeople: true,
    } as never);

    const result = await buildRecentlyAddedFilterConfig().suggestionsProvider!(createFilterState());

    expect(result.tags).toEqual([{ id: 'tag-1', name: 'Vacation' }]);
    expect(result.people).toEqual([
      expect.objectContaining({
        id: 'person-1',
        name: 'Alice',
        thumbnailUrl: expect.stringContaining('/people/person-1/thumbnail'),
      }),
    ]);
    expect(result.hasUnnamedPeople).toBe(true);
    expect(result.countries).toEqual(['Germany']);
    expect(result.cameraMakes).toEqual(['Sony']);
    expect(result.ratings).toEqual([5]);
  });

  it('resolves a space-person suggestion to its shared-space thumbnail', async () => {
    // A shared-space person can still be *suggested* (they may appear on an own asset); only the
    // asset scope is restricted. The thumbnail must route to the space endpoint, because the
    // space-person id has no row in the owner-only person table.
    vi.mocked(getFilterSuggestions).mockResolvedValueOnce({
      countries: [],
      cameraMakes: [],
      tags: [],
      people: [
        {
          id: 'space-person:space-person-1',
          name: 'Space Person',
          primaryProfile: { type: Type.SpacePerson, id: 'space-person-1', spaceId: 'space-1' },
        },
      ],
      ratings: [],
      mediaTypes: [],
      hasUnnamedPeople: false,
    } as never);

    const result = await buildRecentlyAddedFilterConfig().suggestionsProvider!(createFilterState());

    expect(result.people).toEqual([
      expect.objectContaining({
        id: 'space-person:space-person-1',
        thumbnailUrl: '/api/shared-spaces/space-1/people/space-person-1/thumbnail',
      }),
    ]);
  });

  it('maps people suggestions by scoped filter id', async () => {
    vi.mocked(getFilterSuggestions).mockResolvedValueOnce({
      countries: [],
      cameraMakes: [],
      tags: [],
      people: [
        {
          id: 'identity-group-1',
          filterId: 'person:person-1',
          name: 'Alice',
          primaryProfile: { type: Type.UserPerson, id: 'person-1' },
        },
      ],
      ratings: [],
      mediaTypes: [],
      hasUnnamedPeople: false,
    } as never);

    const result = await buildRecentlyAddedFilterConfig().suggestionsProvider!(createFilterState());

    expect(result.people[0]).toEqual(expect.objectContaining({ id: 'person:person-1', name: 'Alice' }));
  });

  it('forwards the active filters to the suggestion request', async () => {
    await buildRecentlyAddedFilterConfig().suggestionsProvider!({
      ...createFilterState(),
      personIds: ['person:p1'],
      tagIds: ['tag-1'],
      mediaType: 'image',
      isFavorite: true,
      dateAfter: '2024-01-01',
      dateBefore: '2024-12-31',
    });

    expect(getFilterSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({
        personIds: ['person:p1'],
        tagIds: ['tag-1'],
        mediaType: AssetTypeEnum.Image,
        isFavorite: true,
        takenAfter: '2024-01-01T00:00:00.000Z',
        takenBefore: '2025-01-01T00:00:00.000Z',
      }),
    );
  });

  it('passes the dependent-provider arguments and context through', async () => {
    const config = buildRecentlyAddedFilterConfig();

    await config.providers!.cities!('Germany', { takenAfter: '2024-01-01T00:00:00.000Z' });
    await config.providers!.cameraModels!('Sony', { takenBefore: '2024-12-31T00:00:00.000Z' });

    expect(getSearchSuggestions).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ country: 'Germany', takenAfter: '2024-01-01T00:00:00.000Z' }),
    );
    expect(getSearchSuggestions).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ make: 'Sony', takenBefore: '2024-12-31T00:00:00.000Z' }),
    );
  });
});
