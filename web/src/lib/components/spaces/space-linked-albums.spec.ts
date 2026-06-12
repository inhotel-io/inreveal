import { AlbumUserRole, type SharedSpaceLinkedAlbumDto, type SharedSpaceResponseDto } from '@immich/sdk';
import { modalManager } from '@immich/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import '$lib/__mocks__/sdk.mock';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import SpaceLinkedAlbums from '$lib/components/spaces/space-linked-albums.svelte';

vi.mock('@immich/ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('@immich/ui')>();
  return {
    ...original,
    modalManager: { show: vi.fn(), showDialog: vi.fn() },
  };
});

vi.mock('svelte-persisted-store', async () => {
  const { writable } = await import('svelte/store');
  return {
    persisted: (_key: string, initialValue: unknown) => writable(initialValue),
  };
});

vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: { user: { id: 'user-1' } },
}));

const makeSpace = (overrides: Partial<SharedSpaceResponseDto> = {}): SharedSpaceResponseDto => ({
  id: 'space-1',
  name: 'Family Photos',
  description: '',
  createdById: 'user-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  memberCount: 1,
  assetCount: 0,
  thumbnailAssetId: null,
  recentAssetIds: [],
  recentAssetThumbhashes: [],
  lastActivityAt: null,
  newAssetCount: 0,
  members: [],
  linkedLibraries: [],
  ...overrides,
});

const makeLinkedAlbum = (overrides: Partial<SharedSpaceLinkedAlbumDto> = {}): SharedSpaceLinkedAlbumDto => ({
  albumId: 'album-1',
  albumName: 'My Album',
  albumThumbnailAssetId: null,
  assetCount: 10,
  showInTimeline: true,
  addedById: 'user-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('SpaceLinkedAlbums component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sdkMock.getSharedSpaceAlbums.mockResolvedValue([]);
    sdkMock.getAllAlbums.mockResolvedValue([]);
  });

  it('should render the component root', async () => {
    render(SpaceLinkedAlbums, { space: makeSpace(), canManage: false });
    await waitFor(() => {
      expect(screen.getByTestId('linked-albums')).toBeInTheDocument();
    });
  });

  it('should show empty state when no albums are linked', async () => {
    render(SpaceLinkedAlbums, { space: makeSpace(), canManage: false });
    await waitFor(() => {
      expect(screen.getByTestId('linked-albums-empty')).toBeInTheDocument();
    });
  });

  it('should render linked albums passed from the server', async () => {
    sdkMock.getSharedSpaceAlbums.mockResolvedValue([
      makeLinkedAlbum({ albumId: 'album-1', albumName: 'Holiday Trip' }),
    ]);
    render(SpaceLinkedAlbums, { space: makeSpace(), canManage: false });
    await waitFor(() => {
      expect(screen.getByText('Holiday Trip')).toBeInTheDocument();
    });
  });

  it('should render multiple linked albums', async () => {
    sdkMock.getSharedSpaceAlbums.mockResolvedValue([
      makeLinkedAlbum({ albumId: 'album-1', albumName: 'Album One' }),
      makeLinkedAlbum({ albumId: 'album-2', albumName: 'Album Two' }),
    ]);
    render(SpaceLinkedAlbums, { space: makeSpace(), canManage: false });
    await waitFor(() => {
      expect(screen.getByText('Album One')).toBeInTheDocument();
      expect(screen.getByText('Album Two')).toBeInTheDocument();
    });
  });

  describe('when canManage is true', () => {
    it('should render unlink buttons for each linked album', async () => {
      sdkMock.getSharedSpaceAlbums.mockResolvedValue([
        makeLinkedAlbum({ albumId: 'album-1', albumName: 'My Album' }),
      ]);
      render(SpaceLinkedAlbums, { space: makeSpace(), canManage: true });
      await waitFor(() => {
        expect(screen.getAllByTestId('album-unlink-button').length).toBeGreaterThan(0);
      });
    });

    it('should render timeline toggle for each linked album', async () => {
      sdkMock.getSharedSpaceAlbums.mockResolvedValue([
        makeLinkedAlbum({ albumId: 'album-1', albumName: 'My Album' }),
      ]);
      render(SpaceLinkedAlbums, { space: makeSpace(), canManage: true });
      await waitFor(() => {
        expect(screen.getAllByTestId('album-timeline-toggle').length).toBeGreaterThan(0);
      });
    });

    it('should render the link album button', async () => {
      render(SpaceLinkedAlbums, { space: makeSpace(), canManage: true });
      await waitFor(() => {
        expect(screen.getByTestId('open-album-picker-button')).toBeInTheDocument();
      });
    });

    it('should call updateSharedSpaceAlbum when timeline toggle is activated', async () => {
      sdkMock.getSharedSpaceAlbums.mockResolvedValue([
        makeLinkedAlbum({ albumId: 'album-1', albumName: 'My Album', showInTimeline: true }),
      ]);
      sdkMock.updateSharedSpaceAlbum.mockResolvedValue(undefined as never);
      render(SpaceLinkedAlbums, { space: makeSpace(), canManage: true });
      const toggle = await screen.findByTestId('album-timeline-toggle');
      await fireEvent.click(toggle);
      await waitFor(() => {
        expect(sdkMock.updateSharedSpaceAlbum).toHaveBeenCalledWith({
          id: 'space-1',
          albumId: 'album-1',
          sharedSpaceAlbumLinkUpdateDto: { showInTimeline: false },
        });
      });
    });

    it('should call unlinkAlbum after confirmation', async () => {
      sdkMock.getSharedSpaceAlbums.mockResolvedValue([
        makeLinkedAlbum({ albumId: 'album-1', albumName: 'My Album' }),
      ]);
      sdkMock.unlinkAlbum.mockResolvedValue(undefined as never);
      vi.mocked(modalManager.showDialog).mockResolvedValue(true);

      render(SpaceLinkedAlbums, { space: makeSpace(), canManage: true });
      const unlinkBtn = await screen.findByTestId('album-unlink-button');
      await fireEvent.click(unlinkBtn);
      await waitFor(() => {
        expect(sdkMock.unlinkAlbum).toHaveBeenCalledWith({ id: 'space-1', albumId: 'album-1' });
      });
    });

    it('should open the album picker when Link album is clicked', async () => {
      render(SpaceLinkedAlbums, { space: makeSpace(), canManage: true });
      const linkBtn = await screen.findByTestId('open-album-picker-button');
      await fireEvent.click(linkBtn);
      await waitFor(() => {
        expect(screen.getByTestId('album-picker')).toBeInTheDocument();
      });
    });

    it('should call linkAlbum when a picker item is clicked', async () => {
      sdkMock.getAllAlbums.mockResolvedValue([
        {
          id: 'album-99',
          albumName: 'Linkable Album',
          albumThumbnailAssetId: null,
          assetCount: 5,
          albumUsers: [{ role: AlbumUserRole.Owner, user: { id: 'user-1' } as never }],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          description: '',
          hasSharedLink: false,
          isActivityEnabled: true,
          shared: false,
        },
      ]);
      sdkMock.linkAlbum.mockResolvedValue(undefined as never);

      render(SpaceLinkedAlbums, { space: makeSpace(), canManage: true });
      const linkBtn = await screen.findByTestId('open-album-picker-button');
      await fireEvent.click(linkBtn);
      const pickerItem = await screen.findByTestId('album-picker-item');
      await fireEvent.click(pickerItem);
      await waitFor(() => {
        expect(sdkMock.linkAlbum).toHaveBeenCalledWith({ id: 'space-1', albumId: 'album-99' });
      });
    });
  });

  describe('when canManage is false', () => {
    it('should NOT render unlink buttons', async () => {
      sdkMock.getSharedSpaceAlbums.mockResolvedValue([makeLinkedAlbum()]);
      render(SpaceLinkedAlbums, { space: makeSpace(), canManage: false });
      await waitFor(() => {
        expect(screen.queryByTestId('album-unlink-button')).not.toBeInTheDocument();
      });
    });

    it('should NOT render the timeline toggle', async () => {
      sdkMock.getSharedSpaceAlbums.mockResolvedValue([makeLinkedAlbum()]);
      render(SpaceLinkedAlbums, { space: makeSpace(), canManage: false });
      await waitFor(() => {
        expect(screen.queryByTestId('album-timeline-toggle')).not.toBeInTheDocument();
      });
    });

    it('should NOT render the link album button', async () => {
      render(SpaceLinkedAlbums, { space: makeSpace(), canManage: false });
      await waitFor(() => {
        expect(screen.queryByTestId('open-album-picker-button')).not.toBeInTheDocument();
      });
    });
  });
});
