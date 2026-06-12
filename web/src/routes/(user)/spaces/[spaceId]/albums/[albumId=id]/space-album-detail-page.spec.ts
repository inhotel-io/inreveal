import {
  AlbumUserRole,
  AssetOrder,
  SharedSpaceRole,
  type AlbumResponseDto,
  type SharedSpaceMemberResponseDto,
  type SharedSpaceResponseDto,
} from '@immich/sdk';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import { authManager } from '$lib/managers/auth-manager.svelte';
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

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

vi.mock('$lib/managers/asset-multi-select-manager.svelte', () => ({
  assetMultiSelectManager: {
    selectionActive: false,
    assets: [],
    clear: vi.fn(),
  },
  AssetMultiSelectManager: class {
    selectionActive = false;
    assets = [];
    clear = vi.fn();
  },
}));

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

  it('timeline options include albumId', () => {
    renderPage({ album: makeAlbum({ id: 'album-1' }) });
    const options = JSON.parse(screen.getByTestId('timeline-options').textContent ?? '{}');
    expect(options).toMatchObject({ albumId: 'album-1' });
  });
});
