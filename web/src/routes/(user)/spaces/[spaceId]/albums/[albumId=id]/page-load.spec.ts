import {
  SharedSpaceRole,
  type AlbumResponseDto,
  type SharedSpaceMemberResponseDto,
  type SharedSpaceResponseDto,
} from '@immich/sdk';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { load } from './+page';

const { authenticate } = vi.hoisted(() => ({
  authenticate: vi.fn(),
}));

vi.mock('$lib/utils/auth', () => ({ authenticate }));

const space: SharedSpaceResponseDto = {
  id: 'space-1',
  name: 'Test Space',
  createdAt: '2026-01-01T00:00:00.000Z',
  createdById: 'owner-user-id',
} as SharedSpaceResponseDto;

const members: SharedSpaceMemberResponseDto[] = [
  {
    userId: 'current-user-id',
    email: 'user@example.com',
    name: 'Current User',
    role: SharedSpaceRole.Editor,
    showInTimeline: false,
    joinedAt: '2026-01-01T00:00:00.000Z',
  } as SharedSpaceMemberResponseDto,
];

const linkedAlbums = [
  {
    albumId: 'album-1',
    albumName: 'Vacation',
    assetCount: 5,
    albumThumbnailAssetId: null,
    showInTimeline: true,
    addedById: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const album = {
  id: 'album-1',
  albumName: 'Vacation',
  assetCount: 5,
  shared: false,
  albumUsers: [],
  hasSharedLink: false,
  isActivityEnabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as AlbumResponseDto;

const event = {
  url: new URL('https://gallery.test/spaces/space-1/albums/album-1'),
  params: { spaceId: 'space-1', albumId: 'album-1' },
};

describe('space album detail page load', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sdkMock.getSpace.mockResolvedValue(space as never);
    sdkMock.getMembers.mockResolvedValue(members as never);
    sdkMock.getSharedSpaceAlbums.mockResolvedValue(linkedAlbums as never);
    sdkMock.getAlbumInfo.mockResolvedValue(album as never);
  });

  it('authenticates, verifies linkage, calls getAlbumInfo and returns data', async () => {
    const result = await load(event as never);

    expect(authenticate).toHaveBeenCalledWith(event.url);
    expect(sdkMock.getSpace).toHaveBeenCalledWith({ id: 'space-1' });
    expect(sdkMock.getMembers).toHaveBeenCalledWith({ id: 'space-1' });
    expect(sdkMock.getSharedSpaceAlbums).toHaveBeenCalledWith({ id: 'space-1' });
    expect(sdkMock.getAlbumInfo).toHaveBeenCalledWith({ id: 'album-1' });

    expect(result).toEqual({
      space,
      members,
      album,
      meta: { title: 'Vacation' },
    });
  });

  it('redirects to /spaces/:id/albums and does NOT call getAlbumInfo when album is not linked to this space', async () => {
    // Album exists (owner might have access) but is NOT linked to this space
    sdkMock.getSharedSpaceAlbums.mockResolvedValue([] as never);
    sdkMock.getAlbumInfo.mockResolvedValue(album as never); // would succeed if called — but must NOT be called

    let thrown: unknown;
    try {
      await load(event as never);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeDefined();
    expect((thrown as { status: number }).status).toBe(302);
    expect((thrown as { location: string }).location).toBe('/spaces/space-1/albums');
    expect(sdkMock.getAlbumInfo).not.toHaveBeenCalled();
  });

  it('redirects when the album is present in the space but for a different albumId', async () => {
    sdkMock.getSharedSpaceAlbums.mockResolvedValue([{ ...linkedAlbums[0], albumId: 'other-album' }] as never);

    let thrown: unknown;
    try {
      await load(event as never);
    } catch (error) {
      thrown = error;
    }

    expect((thrown as { status: number }).status).toBe(302);
    expect((thrown as { location: string }).location).toBe('/spaces/space-1/albums');
    expect(sdkMock.getAlbumInfo).not.toHaveBeenCalled();
  });
});
