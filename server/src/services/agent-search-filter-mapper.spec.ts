import { AssetOrder, AssetType, AssetVisibility } from 'src/enum';
import { buildAgentMetadataSearch } from 'src/services/agent-search-filter-mapper';
import { newUuid } from 'test/small.factory';

describe(buildAgentMetadataSearch.name, () => {
  const userId = newUuid();
  const sharedSpaceId = newUuid();

  it('maps deterministic Pi filters to Gallery metadata search options', () => {
    const tagId = newUuid();
    const albumId = newUuid();
    const personId = newUuid();

    const result = buildAgentMetadataSearch({
      userId,
      request: {
        mode: 'metadata',
        filters: {
          type: AssetType.Video,
          isFavorite: true,
          isNotInAlbum: true,
          takenAfter: new Date('2026-05-01T00:00:00.000Z'),
          takenBefore: new Date('2026-05-31T23:59:59.999Z'),
          createdAfter: new Date('2026-04-01T00:00:00.000Z'),
          createdBefore: new Date('2026-04-30T23:59:59.999Z'),
          updatedAfter: new Date('2026-05-10T00:00:00.000Z'),
          updatedBefore: new Date('2026-05-20T23:59:59.999Z'),
          city: 'Berlin',
          state: 'Berlin',
          country: 'Germany',
          make: 'Sony',
          model: 'A7',
          lensModel: 'FE 35mm',
          rating: null,
          tagIds: [tagId],
          albumIds: [albumId],
          personIds: [personId],
          visibility: AssetVisibility.Archive,
        },
        limit: 25,
        page: 1,
        order: 'desc',
      },
      scope: { owned: true, sharedSpaces: false, locked: false, timelineSpaceIds: [] },
    });

    expect(result.pagination).toEqual({ page: 1, size: 25 });
    expect(result.options).toEqual(
      expect.objectContaining({
        userIds: [userId],
        orderDirection: AssetOrder.Desc,
        type: AssetType.Video,
        isFavorite: true,
        isNotInAlbum: true,
        takenAfter: new Date('2026-05-01T00:00:00.000Z'),
        takenBefore: new Date('2026-05-31T23:59:59.999Z'),
        createdAfter: new Date('2026-04-01T00:00:00.000Z'),
        createdBefore: new Date('2026-04-30T23:59:59.999Z'),
        updatedAfter: new Date('2026-05-10T00:00:00.000Z'),
        updatedBefore: new Date('2026-05-20T23:59:59.999Z'),
        city: 'Berlin',
        state: 'Berlin',
        country: 'Germany',
        make: 'Sony',
        model: 'A7',
        lensModel: 'FE 35mm',
        rating: null,
        tagIds: [tagId],
        albumIds: [albumId],
        personIds: [personId],
        visibility: AssetVisibility.Archive,
      }),
    );
  });

  it('does not leak pagination dto fields into repository options', () => {
    const result = buildAgentMetadataSearch({
      userId,
      request: { mode: 'metadata', filters: {}, limit: 25, page: 2, order: 'desc' },
      scope: { owned: true, sharedSpaces: false, locked: false, timelineSpaceIds: [] },
    });

    expect(result.pagination).toEqual({ page: 2, size: 25 });
    expect(result.options).not.toHaveProperty('order');
    expect(result.options).not.toHaveProperty('page');
    expect(result.options).not.toHaveProperty('size');
  });

  it('uses shared-space timeline IDs without owned user IDs for shared-space-only plans', () => {
    const result = buildAgentMetadataSearch({
      userId,
      request: { mode: 'metadata', filters: {}, limit: 50, page: 1, order: 'desc' },
      scope: { owned: false, sharedSpaces: true, locked: false, timelineSpaceIds: [sharedSpaceId] },
    });

    expect(result.options).toEqual(
      expect.objectContaining({
        userIds: [],
        timelineSpaceIds: [sharedSpaceId],
      }),
    );
  });

  it('sets forceEmptyResult when shared-space-only scope has no timeline spaces', () => {
    const result = buildAgentMetadataSearch({
      userId,
      request: { mode: 'metadata', filters: {}, limit: 50, page: 1, order: 'desc' },
      scope: { owned: false, sharedSpaces: true, locked: false, timelineSpaceIds: [] },
    });

    expect(result.options).toEqual(expect.objectContaining({ userIds: [], forceEmptyResult: true }));
  });

  it('maps explicit withSharedSpaces for owned plus shared sessions', () => {
    const result = buildAgentMetadataSearch({
      userId,
      request: {
        mode: 'metadata',
        filters: { withSharedSpaces: true, isFavorite: true },
        limit: 10,
        page: 1,
        order: 'desc',
      },
      scope: { owned: true, sharedSpaces: true, locked: false, timelineSpaceIds: [sharedSpaceId] },
    });

    expect(result.options).toEqual(
      expect.objectContaining({
        userIds: [userId],
        timelineSpaceIds: [sharedSpaceId],
        isFavorite: true,
      }),
    );
  });

  it('does not force empty results when owned scope requests shared spaces without timeline spaces', () => {
    const result = buildAgentMetadataSearch({
      userId,
      request: {
        mode: 'metadata',
        filters: { withSharedSpaces: true },
        limit: 10,
        page: 1,
        order: 'desc',
      },
      scope: { owned: true, sharedSpaces: true, locked: false, timelineSpaceIds: [] },
    });

    expect(result.options).toEqual(expect.objectContaining({ userIds: [userId] }));
    expect(result.options).not.toHaveProperty('forceEmptyResult');
  });

  it('includes timeline shared spaces for album filters when the session allows shared spaces', () => {
    const albumId = newUuid();
    const result = buildAgentMetadataSearch({
      userId,
      request: { mode: 'metadata', filters: { albumIds: [albumId] }, limit: 10, page: 1, order: 'desc' },
      scope: { owned: true, sharedSpaces: true, locked: false, timelineSpaceIds: [sharedSpaceId] },
    });

    expect(result.options).toEqual(
      expect.objectContaining({
        userIds: [userId],
        timelineSpaceIds: [sharedSpaceId],
        albumIds: [albumId],
      }),
    );
  });

  it('does not force empty results for owned album filters without timeline spaces', () => {
    const albumId = newUuid();
    const result = buildAgentMetadataSearch({
      userId,
      request: { mode: 'metadata', filters: { albumIds: [albumId] }, limit: 10, page: 1, order: 'desc' },
      scope: { owned: true, sharedSpaces: true, locked: false, timelineSpaceIds: [] },
    });

    expect(result.options).toEqual(
      expect.objectContaining({
        userIds: [userId],
        albumIds: [albumId],
      }),
    );
    expect(result.options).not.toHaveProperty('forceEmptyResult');
  });

  it('maps explicit space scope without broad timeline shared-space inclusion', () => {
    const spacePersonId = newUuid();
    const result = buildAgentMetadataSearch({
      userId,
      request: {
        mode: 'metadata',
        filters: { spaceId: sharedSpaceId, spacePersonIds: [spacePersonId] },
        limit: 10,
        page: 1,
        order: 'desc',
      },
      scope: { owned: true, sharedSpaces: true, locked: false, timelineSpaceIds: [newUuid()] },
    });

    expect(result.options).toEqual(
      expect.objectContaining({
        spaceId: sharedSpaceId,
        spacePersonIds: [spacePersonId],
      }),
    );
    expect(result.options).not.toHaveProperty('timelineSpaceIds');
    expect(result.options).not.toHaveProperty('userIds');
  });

  it('omits empty array filters so Gallery search treats them as no-ops', () => {
    const result = buildAgentMetadataSearch({
      userId,
      request: {
        mode: 'metadata',
        filters: { personIds: [], spacePersonIds: [], tagIds: [], albumIds: [] },
        limit: 10,
        page: 1,
        order: 'desc',
      },
      scope: { owned: true, sharedSpaces: false, locked: false, timelineSpaceIds: [] },
    });

    expect(result.options).not.toHaveProperty('personIds');
    expect(result.options).not.toHaveProperty('spacePersonIds');
    expect(result.options).not.toHaveProperty('tagIds');
    expect(result.options).not.toHaveProperty('albumIds');
  });
});
