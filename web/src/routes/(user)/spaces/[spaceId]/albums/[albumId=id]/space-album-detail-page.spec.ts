import {
  AlbumUserRole,
  AssetOrder,
  SharedSpaceRole,
  getAlbumInfo,
  type AlbumResponseDto,
  type SharedSpaceMemberResponseDto,
  type SharedSpaceResponseDto,
} from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { getAlbumAssetsActions } from '$lib/services/album.service';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';
import SpaceAlbumDetailPage from './+page.svelte';

vi.mock('$lib/components/layouts/UserPageLayout.svelte', async () => {
  const { default: MockComponent } = await import('$lib/components/spaces/mock-user-page-layout.test-wrapper.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/Timeline.svelte', async () => {
  const { default: MockComponent } = await import('./mock-timeline.test-wrapper.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/AssetSelectControlBar.svelte', async () => {
  const { default: MockComponent } = await import('./mock-asset-select-control-bar.test-wrapper.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/RemoveFromAlbumAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/DownloadAction.svelte', async () => {
  const { default: MockComponent } = await import('./mock-download-action.test-wrapper.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/shared-components/ControlAppBar.svelte', async () => {
  const { default: MockComponent } =
    await import('../../[[photos=photos]]/[[assetId=id]]/mock-control-app-bar.test-wrapper.svelte');
  return { default: MockComponent };
});

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

vi.mock('$lib/components/timeline/TimelineGroupingControl.svelte', async () => {
  const { default: MockComponent } = await import('./mock-grouping-control.test-wrapper.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/managers/timeline-manager/timeline-anchor', () => ({
  getTimelineTopVisibleAnchor: vi.fn().mockReturnValue(undefined),
}));

vi.mock('$lib/utils/timeline-zoom-navigation', () => ({
  getTimelineBucketZoomTarget: vi.fn(),
}));

const { mockAssetMultiSelectManager } = vi.hoisted(() => ({
  mockAssetMultiSelectManager: {
    selectionActive: false,
    assets: [] as { id: string }[],
    clear: vi.fn(),
    isAllFavorite: false,
    isAllUserOwned: true,
  },
}));

vi.mock('$lib/managers/asset-multi-select-manager.svelte', () => ({
  assetMultiSelectManager: mockAssetMultiSelectManager,
  AssetMultiSelectManager: class {
    selectionActive = false;
    assets: { id: string }[] = [];
    clear = vi.fn();
    isAllFavorite = false;
    isAllUserOwned = true;
  },
}));

vi.mock('@immich/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@immich/sdk')>();
  return {
    ...actual,
    getAlbumInfo: vi.fn(),
  };
});

vi.mock('$lib/services/album.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/services/album.service')>();
  return {
    ...actual,
    getAlbumAssetsActions: vi.fn().mockReturnValue({
      AddAssets: {
        title: 'Add assets',
        icon: '',
        onAction: vi.fn().mockResolvedValue(undefined),
        $if: () => true,
      },
      Upload: {
        title: 'Upload',
        icon: '',
        onAction: vi.fn(),
      },
    }),
  };
});

const BASE_SPACE: SharedSpaceResponseDto = {
  id: 'space-1',
  name: 'Family Memories',
  createdAt: '2026-01-01T00:00:00.000Z',
  createdById: 'owner-user-id',
} as SharedSpaceResponseDto;

function makeAlbum(overrides: Partial<AlbumResponseDto> = {}): AlbumResponseDto {
  return {
    id: 'album-1',
    albumName: 'Vacation 2025',
    assetCount: 12,
    shared: false,
    albumUsers: [
      {
        user: { id: 'current-user-id', email: 'user@example.com', name: 'Current User' } as never,
        role: AlbumUserRole.Owner,
      },
    ],
    hasSharedLink: false,
    isActivityEnabled: true,
    order: AssetOrder.Desc,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as AlbumResponseDto;
}

function makeMember(role: SharedSpaceRole = SharedSpaceRole.Editor): SharedSpaceMemberResponseDto {
  return {
    userId: 'current-user-id',
    email: 'user@example.com',
    name: 'Current User',
    role,
    showInTimeline: false,
    joinedAt: '2026-01-01T00:00:00.000Z',
  } as SharedSpaceMemberResponseDto;
}

function renderPage({
  album = makeAlbum(),
  members = [makeMember()],
  space = BASE_SPACE,
}: {
  album?: AlbumResponseDto;
  members?: SharedSpaceMemberResponseDto[];
  space?: SharedSpaceResponseDto;
} = {}) {
  authManager.setUser(userAdminFactory.build({ id: 'current-user-id' }));
  authManager.setPreferences(preferencesFactory.build());

  return render(SpaceAlbumDetailPage, {
    props: {
      data: {
        space,
        members,
        album,
        meta: { title: album.albumName },
      },
    },
  });
}

describe('Space album detail page', () => {
  beforeAll(async () => {
    register('en-US', () => import('$i18n/en.json'));
    await init({ fallbackLocale: 'en-US', initialLocale: 'en-US' });
    await waitLocale('en-US');
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mockAssetMultiSelectManager.selectionActive = false;
    mockAssetMultiSelectManager.assets = [];
    // Restore the default getAlbumAssetsActions return after resetAllMocks clears it
    vi.mocked(getAlbumAssetsActions).mockReturnValue({
      AddAssets: {
        title: 'Add assets',
        icon: '',
        onAction: vi.fn().mockResolvedValue(undefined),
        $if: () => true,
      },
      Upload: {
        title: 'Upload',
        icon: '',
        onAction: vi.fn(),
      },
    } as never);
  });

  it('renders the album timeline', () => {
    renderPage();
    expect(screen.getByTestId('space-album-timeline')).toBeInTheDocument();
  });

  it('shows the album name in the page title', () => {
    renderPage({ album: makeAlbum({ albumName: 'Summer Trips' }) });
    const layout = screen.getByTestId('user-page-layout');
    expect(layout).toHaveAttribute('data-title', 'Summer Trips');
  });

  it('shows "in {space}" context in description', () => {
    renderPage({ album: makeAlbum(), space: { ...BASE_SPACE, name: 'Family Memories' } });
    const layout = screen.getByTestId('user-page-layout');
    expect(layout.dataset.description).toMatch(/in Family Memories/);
  });

  it('renders the back button in leading slot', () => {
    renderPage();
    const leading = screen.getByTestId('layout-leading');
    expect(leading.querySelector('button')).not.toBeNull();
  });

  it('editor sees the "Add photos" button', () => {
    renderPage({ members: [makeMember(SharedSpaceRole.Editor)] });
    expect(screen.getByTestId('add-photos-button')).toBeInTheDocument();
  });

  it('owner sees the "Add photos" button', () => {
    renderPage({ members: [makeMember(SharedSpaceRole.Owner)] });
    expect(screen.getByTestId('add-photos-button')).toBeInTheDocument();
  });

  it('viewer does NOT see the "Add photos" button when not an album editor', () => {
    renderPage({
      members: [makeMember(SharedSpaceRole.Viewer)],
      album: makeAlbum({
        albumUsers: [
          {
            user: { id: 'current-user-id', email: 'user@example.com', name: 'Current User' } as never,
            role: AlbumUserRole.Viewer,
          },
        ],
      }),
    });
    expect(screen.queryByTestId('add-photos-button')).not.toBeInTheDocument();
  });

  it('album editor/owner can manage even as a space viewer', () => {
    renderPage({
      members: [makeMember(SharedSpaceRole.Viewer)],
      album: makeAlbum({
        albumUsers: [
          {
            user: { id: 'current-user-id', email: 'user@example.com', name: 'Current User' } as never,
            role: AlbumUserRole.Editor,
          },
        ],
      }),
    });
    expect(screen.getByTestId('add-photos-button')).toBeInTheDocument();
  });

  it('showInTimeline=false album still renders the timeline fully', () => {
    renderPage({
      album: makeAlbum(),
    });
    expect(screen.getByTestId('space-album-timeline')).toBeInTheDocument();
  });

  it('timeline has enableRouting=false', () => {
    renderPage();
    expect(screen.getByTestId('space-album-timeline')).toHaveAttribute('data-enable-routing', 'false');
  });

  it('in browse mode, the timeline-desktop-grouping-control renders', () => {
    renderPage();
    expect(screen.getByTestId('timeline-desktop-grouping-control')).toBeInTheDocument();
  });

  it('timeline receives grouping="day" by default (not "month")', () => {
    renderPage();
    expect(screen.getByTestId('space-album-timeline')).toHaveAttribute('data-grouping', 'day');
  });

  it('browse timeline OPTIONS carry the current grouping (default day) so the manager actually groups', () => {
    renderPage({ album: makeAlbum({ id: 'album-1' }) });
    const options = JSON.parse(screen.getByTestId('timeline-options').textContent ?? '{}');
    expect(options.grouping).toBe('day');
  });

  it('changing the grouping control updates the timeline OPTIONS grouping (not just the prop)', async () => {
    renderPage({ album: makeAlbum({ id: 'album-1' }) });
    await fireEvent.click(screen.getByTestId('set-grouping-month'));
    await waitFor(() => {
      const options = JSON.parse(screen.getByTestId('timeline-options').textContent ?? '{}');
      expect(options.grouping).toBe('month');
    });
    // and the prop stays in sync
    expect(screen.getByTestId('space-album-timeline')).toHaveAttribute('data-grouping', 'month');
  });

  it('timeline-desktop-grouping-control is hidden when selection is active in browse mode', () => {
    mockAssetMultiSelectManager.selectionActive = true;
    renderPage();
    expect(screen.queryByTestId('timeline-desktop-grouping-control')).not.toBeInTheDocument();
  });

  it('timeline-desktop-grouping-control is hidden in add mode', async () => {
    renderPage({ members: [makeMember(SharedSpaceRole.Editor)], album: makeAlbum({ id: 'album-1' }) });
    await fireEvent.click(screen.getByTestId('add-photos-button'));
    await waitFor(() => {
      expect(screen.getByTestId('space-album-timeline')).toHaveAttribute('data-mode', 'add');
    });
    expect(screen.queryByTestId('timeline-desktop-grouping-control')).not.toBeInTheDocument();
  });

  it('timeline options include albumId in browse mode', () => {
    renderPage({ album: makeAlbum({ id: 'album-1' }) });
    const options = JSON.parse(screen.getByTestId('timeline-options').textContent ?? '{}');
    expect(options).toMatchObject({ albumId: 'album-1' });
  });

  it('timeline starts in browse mode (options have albumId, not timelineAlbumId)', () => {
    renderPage({ album: makeAlbum({ id: 'album-1' }) });
    expect(screen.getByTestId('space-album-timeline')).toHaveAttribute('data-mode', 'browse');
  });

  it('clicking "Add photos" switches timeline to add mode (picker options)', async () => {
    renderPage({ members: [makeMember(SharedSpaceRole.Editor)], album: makeAlbum({ id: 'album-1' }) });
    const addButton = screen.getByTestId('add-photos-button');

    await fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByTestId('space-album-timeline')).toHaveAttribute('data-mode', 'add');
    });
    const options = JSON.parse(screen.getByTestId('timeline-options').textContent ?? '{}');
    expect(options).toMatchObject({ timelineAlbumId: 'album-1' });
    expect(options).not.toHaveProperty('albumId');
  });

  it('in browse mode with selection active, AssetSelectControlBar is rendered', () => {
    mockAssetMultiSelectManager.selectionActive = true;
    renderPage({ members: [makeMember(SharedSpaceRole.Editor)] });
    expect(screen.getByTestId('asset-select-control-bar')).toBeInTheDocument();
  });

  it('in browse mode with selection active and canManage=true, RemoveFromAlbum and Download actions are wired', () => {
    mockAssetMultiSelectManager.selectionActive = true;
    renderPage({ members: [makeMember(SharedSpaceRole.Editor)] });
    // AssetSelectControlBar renders its children
    expect(screen.getByTestId('asset-select-control-bar')).toBeInTheDocument();
    // RemoveFromAlbumAction (noop-component) is rendered
    expect(screen.getByTestId('noop-component')).toBeInTheDocument();
    // DownloadAction is rendered for all members
    expect(screen.getByTestId('download-action')).toBeInTheDocument();
  });

  it('in browse mode with selection active and canManage=false, control bar shown with Download but no Remove action', () => {
    mockAssetMultiSelectManager.selectionActive = true;
    renderPage({
      members: [makeMember(SharedSpaceRole.Viewer)],
      album: makeAlbum({
        albumUsers: [
          {
            user: { id: 'current-user-id', email: 'user@example.com', name: 'Current User' } as never,
            role: AlbumUserRole.Viewer,
          },
        ],
      }),
    });
    // Control bar shows
    expect(screen.getByTestId('asset-select-control-bar')).toBeInTheDocument();
    // DownloadAction is available to all members (bar is not empty for viewers)
    expect(screen.getByTestId('download-action')).toBeInTheDocument();
    // But RemoveFromAlbumAction (noop-component) is NOT rendered
    expect(screen.queryByTestId('noop-component')).not.toBeInTheDocument();
  });

  it('add mode shows picker control bar (no add-photos button visible while in add mode)', async () => {
    renderPage({ members: [makeMember(SharedSpaceRole.Editor)], album: makeAlbum({ id: 'album-1' }) });
    await fireEvent.click(screen.getByTestId('add-photos-button'));

    await waitFor(() => {
      expect(screen.getByTestId('space-album-timeline')).toHaveAttribute('data-mode', 'add');
    });
    // In add mode, the add-photos button should be hidden / not visible as a standalone button
    // (the ControlAppBar for picker mode replaces the regular app bar)
    expect(screen.queryByTestId('add-photos-button')).not.toBeInTheDocument();
  });

  it('firing AddAssets action in add mode returns to browse and refreshes album', async () => {
    const refreshedAlbum = makeAlbum({ id: 'album-1', albumName: 'Refreshed', assetCount: 5 });
    vi.mocked(getAlbumInfo).mockResolvedValue(refreshedAlbum);

    // Provide AddAssets whose onAction resolves immediately
    const addAssetsOnAction = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getAlbumAssetsActions).mockReturnValue({
      AddAssets: {
        title: 'Add assets',
        icon: '',
        onAction: addAssetsOnAction,
        $if: () => true,
      },
      Upload: {
        title: 'Upload',
        icon: '',
        onAction: vi.fn(),
      },
    } as never);

    renderPage({ members: [makeMember(SharedSpaceRole.Editor)], album: makeAlbum({ id: 'album-1' }) });

    // Enter add mode
    await fireEvent.click(screen.getByTestId('add-photos-button'));
    await waitFor(() => {
      expect(screen.getByTestId('space-album-timeline')).toHaveAttribute('data-mode', 'add');
    });

    // The ControlAppBar mock renders its trailing slot, so the HeaderActionButton for AddAssets
    // is in the DOM. Click it to fire the page's wrapped onAction → handleAddAssetsSuccess.
    const addAssetsButton = screen.getByRole('button', { name: /add assets/i });
    await fireEvent.click(addAssetsButton);

    // handleAddAssetsSuccess: calls AddAssets.onAction (which resolves), then refreshAlbum
    // (getAlbumInfo), then sets mode='browse'
    await waitFor(() => {
      expect(getAlbumInfo).toHaveBeenCalledWith({ id: 'album-1' });
    });
    // After refresh, mode returns to browse (add-photos button reappears)
    await waitFor(() => {
      expect(screen.getByTestId('add-photos-button')).toBeInTheDocument();
    });
  });
});
