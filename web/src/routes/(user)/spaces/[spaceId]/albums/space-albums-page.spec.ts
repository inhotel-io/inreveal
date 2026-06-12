import {
  AlbumUserRole,
  SharedSpaceRole,
  type AlbumResponseDto,
  type SharedSpaceLinkedAlbumDto,
  type SharedSpaceMemberResponseDto,
  type SharedSpaceResponseDto,
} from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { albumFactory } from '@test-data/factories/album-factory';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';
import SpaceAlbumsPage from './+page.svelte';

vi.mock('$lib/components/layouts/UserPageLayout.svelte', async () => {
  const { default: MockComponent } = await import('$lib/components/spaces/mock-user-page-layout.test-wrapper.svelte');
  return { default: MockComponent };
});

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
  page: {
    subscribe: (run: (v: unknown) => void) => {
      run({ url: new URL('http://localhost/spaces/space-1/albums'), route: { id: '' } });
      return () => {};
    },
  },
}));

const { modalManagerMock } = vi.hoisted(() => ({
  modalManagerMock: { show: vi.fn(), showDialog: vi.fn() },
}));

vi.mock('@immich/ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('@immich/ui')>();
  return {
    ...original,
    modalManager: modalManagerMock,
    toastManager: { primary: vi.fn(), success: vi.fn(), warning: vi.fn() },
  };
});

const BASE_SPACE: SharedSpaceResponseDto = {
  id: 'space-1',
  name: 'Test Space',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ownerId: 'owner-user-id',
  createdById: 'owner-user-id',
  description: '',
  slug: null,
  isPublic: false,
  publicSlug: null,
  allowDownload: true,
  showMetadata: true,
  showExif: true,
  password: null,
  expiresAt: null,
  assets: [],
  albumId: null,
  assetCount: 0,
  faceRecognitionEnabled: true,
  petsEnabled: true,
} as SharedSpaceResponseDto;

function makeAlbum(overrides: Partial<SharedSpaceLinkedAlbumDto> = {}): SharedSpaceLinkedAlbumDto {
  return {
    albumId: 'album-1',
    albumName: 'Vacation',
    assetCount: 5,
    albumThumbnailAssetId: null,
    showInTimeline: true,
    addedById: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMember(role: SharedSpaceRole): SharedSpaceMemberResponseDto {
  return {
    userId: 'current-user-id',
    email: 'user@example.com',
    name: 'Current User',
    role,
    showInTimeline: false,
    sharePersonMetadata: true,
    joinedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeAvailableAlbum(overrides: Partial<AlbumResponseDto> = {}): AlbumResponseDto {
  return albumFactory.build({
    id: 'available-album-1',
    albumName: 'Available Trip',
    albumUsers: [{ user: userAdminFactory.build({ id: 'current-user-id' }), role: AlbumUserRole.Owner }],
    ...overrides,
  });
}

function renderPage(albums: SharedSpaceLinkedAlbumDto[], role: SharedSpaceRole = SharedSpaceRole.Editor) {
  return render(SpaceAlbumsPage, {
    props: {
      data: {
        space: BASE_SPACE,
        members: [makeMember(role)],
        albums,
        meta: { title: 'Test Space - Albums' },
      },
    },
  });
}

describe('Space albums page', () => {
  beforeAll(async () => {
    register('en-US', () => import('$i18n/en.json'));
    await init({ fallbackLocale: 'en-US', initialLocale: 'en-US' });
    await waitLocale('en-US');
  });

  beforeEach(() => {
    vi.resetAllMocks();
    authManager.setUser(userAdminFactory.build({ id: 'current-user-id' }));
    authManager.setPreferences(preferencesFactory.build());
    sdkMock.getSharedSpaceAlbums.mockResolvedValue([]);
  });

  it('renders one card per album', () => {
    renderPage([makeAlbum({ albumId: 'a-1', albumName: 'Trip' }), makeAlbum({ albumId: 'a-2', albumName: 'Home' })]);
    expect(screen.getAllByTestId('space-album-card')).toHaveLength(2);
  });

  it('editor sees the "Link album" button', () => {
    renderPage([makeAlbum()], SharedSpaceRole.Editor);
    expect(screen.getByTestId('link-album-button')).toBeInTheDocument();
  });

  it('owner sees the "Link album" button', () => {
    renderPage([makeAlbum()], SharedSpaceRole.Owner);
    expect(screen.getByTestId('link-album-button')).toBeInTheDocument();
  });

  it('viewer does NOT see the "Link album" button', () => {
    renderPage([makeAlbum()], SharedSpaceRole.Viewer);
    expect(screen.queryByTestId('link-album-button')).not.toBeInTheDocument();
  });

  it('shows empty-state text when albums list is empty', () => {
    renderPage([], SharedSpaceRole.Viewer);
    expect(screen.getByTestId('empty-state-message')).toBeInTheDocument();
  });

  it('shows editor CTA when albums list is empty and user is editor', () => {
    renderPage([], SharedSpaceRole.Editor);
    expect(screen.getByTestId('empty-link-album-button')).toBeInTheDocument();
  });

  describe('interactions', () => {
    it('clicking "Link album" opens the picker and calls getAllAlbums', async () => {
      sdkMock.getAllAlbums.mockResolvedValue([makeAvailableAlbum()]);
      renderPage([], SharedSpaceRole.Editor);

      await fireEvent.click(screen.getByTestId('empty-link-album-button'));

      await waitFor(() => expect(screen.getByTestId('album-picker')).toBeInTheDocument());
      expect(sdkMock.getAllAlbums).toHaveBeenCalledWith({});
    });

    it('clicking an album in the picker calls linkAlbum and closes the picker', async () => {
      const available = makeAvailableAlbum({ id: 'av-1', albumName: 'Road Trip' });
      sdkMock.getAllAlbums.mockResolvedValue([available]);
      sdkMock.linkAlbum.mockResolvedValue(undefined as never);
      sdkMock.getSharedSpaceAlbums.mockResolvedValue([makeAlbum({ albumId: 'av-1', albumName: 'Road Trip' })]);
      renderPage([], SharedSpaceRole.Editor);

      // Open picker via the empty-state CTA
      await fireEvent.click(screen.getByTestId('empty-link-album-button'));
      await waitFor(() => expect(screen.getByTestId('album-picker')).toBeInTheDocument());

      const pickerItem = await screen.findByTestId('album-picker-item');
      await fireEvent.click(pickerItem);

      await waitFor(() => expect(sdkMock.linkAlbum).toHaveBeenCalledWith({ id: 'space-1', albumId: 'av-1' }));
      await waitFor(() => expect(screen.queryByTestId('album-picker')).not.toBeInTheDocument());
    });

    it('unlink: after confirm resolves true, calls unlinkAlbum', async () => {
      modalManagerMock.showDialog.mockResolvedValue(true);
      sdkMock.unlinkAlbum.mockResolvedValue(undefined as never);
      sdkMock.getSharedSpaceAlbums.mockResolvedValue([]);
      const album = makeAlbum({ albumId: 'album-1', albumName: 'Vacation' });
      renderPage([album], SharedSpaceRole.Editor);

      // Find the card's ⋯ menu button and open it
      const menuContainer = screen.getByTestId('space-album-card-menu');
      const menuButton = menuContainer.querySelector('button');
      expect(menuButton).not.toBeNull();
      await fireEvent.click(menuButton!);

      // Wait for menu items to appear, then click "Unlink album"
      const unlinkOption = await screen.findByText('Unlink album');
      await fireEvent.click(unlinkOption);

      await waitFor(() => expect(sdkMock.unlinkAlbum).toHaveBeenCalledWith({ id: 'space-1', albumId: 'album-1' }));
    });

    it('toggle show-in-timeline calls updateSharedSpaceAlbum and flips optimistic state', async () => {
      sdkMock.updateSharedSpaceAlbum.mockResolvedValue(undefined as never);
      const album = makeAlbum({ albumId: 'album-1', albumName: 'Vacation', showInTimeline: true });
      renderPage([album], SharedSpaceRole.Editor);

      // Open the card's ⋯ context menu
      const menuContainer = screen.getByTestId('space-album-card-menu');
      const menuButton = menuContainer.querySelector('button');
      expect(menuButton).not.toBeNull();
      await fireEvent.click(menuButton!);

      // Click "Hide from timeline" (showInTimeline=true → shows hide option)
      const toggleOption = await screen.findByText('Hide from timeline');
      await fireEvent.click(toggleOption);

      await waitFor(() =>
        expect(sdkMock.updateSharedSpaceAlbum).toHaveBeenCalledWith({
          id: 'space-1',
          albumId: 'album-1',
          sharedSpaceAlbumLinkUpdateDto: { showInTimeline: false },
        }),
      );

      // Optimistic flip: "hidden from timeline" label should now appear
      await waitFor(() => expect(screen.getByText(/hidden from timeline/i)).toBeInTheDocument());
    });
  });
});
