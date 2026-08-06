import type { SharedSpaceAlbumFolderDto, SharedSpaceLinkedAlbumDto, SharedSpaceMemberResponseDto } from '@immich/sdk';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import { get } from 'svelte/store';
import SpaceAlbumsList from '$lib/components/spaces/space-albums-list.svelte';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { AlbumSortBy, AlbumViewMode, SortOrder, albumViewSettings } from '$lib/stores/preferences.store';
import { SpaceAlbumGroupBy, spaceAlbumViewSettings } from '$lib/stores/space-album-view-settings.store';
import { expandAllSpaceAlbumGroups, toggleSpaceAlbumGroupCollapsing } from '$lib/utils/space-album-grouping';
import { renderWithTooltips } from '$tests/helpers';
import { userAdminFactory } from '@test-data/factories/user-factory';

vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));
vi.mock('$app/stores', () => ({
  page: {
    subscribe: (run: (v: unknown) => void) => {
      run({ url: new URL('http://localhost/spaces/space-1/albums'), route: { id: '' } });
      return () => {};
    },
  },
}));

vi.mock('@immich/ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('@immich/ui')>();
  return {
    ...original,
    toastManager: { primary: vi.fn(), success: vi.fn(), warning: vi.fn() },
  };
});

function makeAlbum(overrides: Partial<SharedSpaceLinkedAlbumDto> = {}): SharedSpaceLinkedAlbumDto {
  return {
    id: 'album-1',
    ownerId: 'owner-1',
    albumName: 'Vacation',
    assetCount: 5,
    albumThumbnailAssetId: null,
    folderId: null,
    showInTimeline: true,
    addedById: null,
    linkedAt: '2026-01-01T00:00:00.000Z',
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    shared: false,
    hasSharedLink: false,
    isActivityEnabled: false,
    startDate: undefined,
    endDate: undefined,
    ...overrides,
  };
}

const idsInCoverOrder = () =>
  screen.getAllByTestId('space-album-card-link').map((a) => a.getAttribute('href')!.split('/').pop());

const idsInListOrder = () =>
  [...document.querySelectorAll('[data-testid^="space-album-row-"]')].map((el) =>
    (el as HTMLElement).dataset['testid']!.replace('space-album-row-', ''),
  );

describe('SpaceAlbumsList', () => {
  beforeAll(async () => {
    register('en-US', () => import('$i18n/en.json'));
    await init({ fallbackLocale: 'en-US', initialLocale: 'en-US' });
    await waitLocale('en-US');
  });

  beforeEach(() => {
    localStorage.clear();
    spaceAlbumViewSettings.reset();
    albumViewSettings.reset();
    authManager.setUser(userAdminFactory.build({ id: 'me' }));
  });

  it('renders cover cards by default and switches to the table on view=List', async () => {
    const albums = [makeAlbum({ id: 'a-1' }), makeAlbum({ id: 'a-2' })];
    render(SpaceAlbumsList, { spaceId: 's-1', albums, canManage: false });
    expect(screen.getAllByTestId('space-album-card')).toHaveLength(2);
    spaceAlbumViewSettings.update((s) => ({ ...s, view: AlbumViewMode.List }));
    expect(await screen.findByTestId('space-album-row-a-1')).toBeInTheDocument();
  });

  it('never writes the global albumViewSettings (isolation)', () => {
    const before = get(albumViewSettings);
    render(SpaceAlbumsList, { spaceId: 's-1', albums: [makeAlbum({ id: 'a-1' })], canManage: false });
    spaceAlbumViewSettings.update((s) => ({ ...s, view: AlbumViewMode.List }));
    expect(get(albumViewSettings)).toEqual(before);
  });

  it('sorts by Title ascending in cover mode', () => {
    const albums = [makeAlbum({ id: 'b', albumName: 'Bravo' }), makeAlbum({ id: 'a', albumName: 'Alpha' })];
    spaceAlbumViewSettings.update((s) => ({ ...s, sortBy: AlbumSortBy.Title, sortOrder: SortOrder.Asc }));
    render(SpaceAlbumsList, { spaceId: 's-1', albums, canManage: false });
    expect(idsInCoverOrder()).toEqual(['a', 'b']);
  });

  it('sorts by item count descending in cover mode', () => {
    const albums = [makeAlbum({ id: 'lo', assetCount: 2 }), makeAlbum({ id: 'hi', assetCount: 9 })];
    spaceAlbumViewSettings.update((s) => ({ ...s, sortBy: AlbumSortBy.ItemCount, sortOrder: SortOrder.Desc }));
    render(SpaceAlbumsList, { spaceId: 's-1', albums, canManage: false });
    expect(idsInCoverOrder()).toEqual(['hi', 'lo']);
  });

  it('sorts by MostRecentPhoto on endDate, pushing null-date albums last', () => {
    const albums = [
      makeAlbum({ id: 'none' }), // no startDate/endDate
      makeAlbum({ id: 'old', endDate: '2020-01-01T00:00:00.000Z' }),
      makeAlbum({ id: 'new', endDate: '2024-01-01T00:00:00.000Z' }),
    ];
    spaceAlbumViewSettings.update((s) => ({ ...s, sortBy: AlbumSortBy.MostRecentPhoto, sortOrder: SortOrder.Desc }));
    render(SpaceAlbumsList, { spaceId: 's-1', albums, canManage: false });
    const order = idsInCoverOrder();
    expect(order.slice(0, 2)).toEqual(['new', 'old']);
    expect(order[2]).toBe('none'); // null-date last
  });

  it('sorts by OldestPhoto on startDate in cover mode', () => {
    const albums = [
      makeAlbum({ id: 'y2024', startDate: '2024-01-01T00:00:00.000Z' }),
      makeAlbum({ id: 'y2020', startDate: '2020-01-01T00:00:00.000Z' }),
    ];
    spaceAlbumViewSettings.update((s) => ({ ...s, sortBy: AlbumSortBy.OldestPhoto, sortOrder: SortOrder.Asc }));
    render(SpaceAlbumsList, { spaceId: 's-1', albums, canManage: false });
    expect(idsInCoverOrder()).toEqual(['y2020', 'y2024']);
  });

  it('sorts by Title ascending in list mode', () => {
    const albums = [makeAlbum({ id: 'b', albumName: 'Bravo' }), makeAlbum({ id: 'a', albumName: 'Alpha' })];
    spaceAlbumViewSettings.update((s) => ({
      ...s,
      view: AlbumViewMode.List,
      sortBy: AlbumSortBy.Title,
      sortOrder: SortOrder.Asc,
    }));
    render(SpaceAlbumsList, { spaceId: 's-1', albums, canManage: false });
    expect(idsInListOrder()).toEqual(['a', 'b']);
  });

  describe('search filtering', () => {
    it('filters by album name (case-insensitive)', () => {
      const albums = [makeAlbum({ id: 'v', albumName: 'Vacation' }), makeAlbum({ id: 'w', albumName: 'Work' })];
      render(SpaceAlbumsList, { spaceId: 's-1', albums, canManage: false, searchQuery: 'vac' });
      expect(screen.getAllByTestId('space-album-card-link')).toHaveLength(1);
      expect(screen.getByText('Vacation')).toBeInTheDocument();
    });
    it('filters by description and does not throw on null description', () => {
      const albums = [
        makeAlbum({ id: 'a', albumName: 'A', description: 'beach trip' }),
        makeAlbum({ id: 'b', albumName: 'B', description: null as unknown as string }),
      ];
      expect(() =>
        render(SpaceAlbumsList, { spaceId: 's-1', albums, canManage: false, searchQuery: 'beach' }),
      ).not.toThrow();
      expect(screen.getAllByTestId('space-album-card-link')).toHaveLength(1);
    });
    it('shows a no-matching message when the query matches nothing', () => {
      render(SpaceAlbumsList, {
        spaceId: 's-1',
        albums: [makeAlbum({ id: 'a', albumName: 'Alpha' })],
        canManage: false,
        searchQuery: 'zzz',
      });
      expect(screen.getByTestId('space-albums-no-results')).toBeInTheDocument();
      expect(screen.queryAllByTestId('space-album-card-link')).toHaveLength(0);
    });
    it('an empty query shows everything', () => {
      render(SpaceAlbumsList, {
        spaceId: 's-1',
        albums: [makeAlbum({ id: 'a' }), makeAlbum({ id: 'b' })],
        canManage: false,
        searchQuery: '',
      });
      expect(screen.getAllByTestId('space-album-card-link')).toHaveLength(2);
    });
  });

  describe('grouping (cover mode)', () => {
    it('renders no group headers when groupBy is None', () => {
      const albums = [makeAlbum({ id: 'a-1' }), makeAlbum({ id: 'a-2' })];
      render(SpaceAlbumsList, { spaceId: 's-1', albums, canManage: false });
      expect(screen.queryByTestId(/^space-album-group-/)).not.toBeInTheDocument();
      expect(screen.getAllByTestId('space-album-card')).toHaveLength(2);
    });

    it('renders a header per year with names and counts when groupBy is Year', () => {
      const albums = [
        makeAlbum({ id: 'y2020', endDate: '2020-06-01T00:00:00.000Z' }),
        makeAlbum({ id: 'y2024a', endDate: '2024-06-01T00:00:00.000Z' }),
        makeAlbum({ id: 'y2024b', endDate: '2024-07-01T00:00:00.000Z' }),
      ];
      spaceAlbumViewSettings.update((s) => ({
        ...s,
        groupBy: SpaceAlbumGroupBy.Year,
        sortBy: AlbumSortBy.MostRecentPhoto,
        sortOrder: SortOrder.Desc,
      }));
      render(SpaceAlbumsList, { spaceId: 's-1', albums, canManage: false });
      const header2024 = screen.getByTestId('space-album-group-2024');
      const header2020 = screen.getByTestId('space-album-group-2020');
      expect(header2024).toHaveTextContent('2024');
      expect(header2024).toHaveTextContent('2');
      expect(header2020).toHaveTextContent('2020');
      expect(header2020).toHaveTextContent('1');
    });

    it('collapsing a group marks its header collapsed (aria-expanded=false)', async () => {
      const albums = [
        makeAlbum({ id: 'y2020', endDate: '2020-06-01T00:00:00.000Z' }),
        makeAlbum({ id: 'y2024', endDate: '2024-06-01T00:00:00.000Z' }),
      ];
      spaceAlbumViewSettings.update((s) => ({ ...s, groupBy: SpaceAlbumGroupBy.Year }));
      render(SpaceAlbumsList, { spaceId: 's-1', albums, canManage: false });
      expect(screen.getByTestId('space-album-group-2020')).toHaveAttribute('aria-expanded', 'true');
      toggleSpaceAlbumGroupCollapsing('2020');
      await waitFor(() =>
        expect(screen.getByTestId('space-album-group-2020')).toHaveAttribute('aria-expanded', 'false'),
      );
    });

    it('renders member-name headers plus an Unassigned group when groupBy is LinkedBy', () => {
      const members = [{ userId: 'u1', name: 'Alice' }] as unknown as SharedSpaceMemberResponseDto[];
      const albums = [makeAlbum({ id: 'a', addedById: 'u1' }), makeAlbum({ id: 'b', addedById: null })];
      spaceAlbumViewSettings.update((s) => ({ ...s, groupBy: SpaceAlbumGroupBy.LinkedBy }));
      render(SpaceAlbumsList, { spaceId: 's-1', albums, canManage: false, members });
      expect(screen.getByTestId('space-album-group-u1')).toHaveTextContent('Alice');
      expect(screen.getByTestId('space-album-group-Unassigned')).toHaveTextContent('Unassigned');
    });
  });

  describe('folders', () => {
    function makeFolder(id: string, name: string, parentId: string | null = null): SharedSpaceAlbumFolderDto {
      return {
        id,
        spaceId: 's-1',
        parentId,
        name,
        createdById: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
    }

    // Web vitest has no clearMocks — mock AND store state leak across tests in a file — so both
    // need resetting even though the outer beforeEach already resets spaceAlbumViewSettings.
    beforeEach(() => {
      vi.clearAllMocks();
      spaceAlbumViewSettings.reset();
    });

    // W-01: folders are the primary organisational layer, so they always come first.
    it('W-01: renders folders before albums', () => {
      const folders = [makeFolder('trips', 'Trips'), makeFolder('family', 'Family')];
      const albums = [makeAlbum({ id: 'a1', albumName: 'Rome' }), makeAlbum({ id: 'a2', albumName: 'Venice' })];
      const { container } = render(SpaceAlbumsList, { spaceId: 's-1', albums, folders, canManage: false });

      const rendered = [
        ...container.querySelectorAll('[data-testid="space-album-folder-card"],[data-testid="space-album-card"]'),
      ];
      expect(rendered[0]).toHaveAttribute('data-testid', 'space-album-folder-card');
      expect(rendered.at(-1)).toHaveAttribute('data-testid', 'space-album-card');
    });

    it('W-01: shows only this level — the album inside Trips is not at the root', () => {
      const folders = [makeFolder('trips', 'Trips'), makeFolder('family', 'Family')];
      const albums = [
        makeAlbum({ id: 'a1', albumName: 'Rome' }),
        makeAlbum({ id: 'a2', albumName: 'Venice', folderId: 'trips' }),
      ];
      render(SpaceAlbumsList, { spaceId: 's-1', albums, folders, canManage: false });

      expect(screen.getByText('Rome')).toBeInTheDocument();
      expect(screen.queryByText('Venice')).not.toBeInTheDocument();
    });

    // W-08: reusing the space-level empty state here would wrongly claim the space has no
    // albums at all, when it only means THIS folder is empty.
    it('W-08: renders the folder-specific empty state for an empty folder', () => {
      const folders = [makeFolder('trips', 'Trips'), makeFolder('family', 'Family')];
      render(SpaceAlbumsList, { spaceId: 's-1', albums: [], folders, canManage: false, currentFolderId: 'family' });

      // Unlike space-albums-page.spec.ts, this file's beforeAll registers the real en-US locale
      // (see above), so $t() resolves actual copy here rather than raw i18n keys.
      expect(screen.getByTestId('space-album-folder-empty')).toHaveTextContent('No albums in this folder yet');
      expect(screen.queryByTestId('empty-state-message')).not.toBeInTheDocument();
    });

    // W-07: group-by regroups the ALBUMS at this level; folders are never grouped, and their grid
    // sits above every group. `.closest('[data-testid^="space-album-group-"]')` cannot prove
    // this: the group testid lives on the header BUTTON, which never wraps any card (grouped
    // album cards included) under any implementation, so that check is vacuous — assert real DOM
    // order instead.
    it('W-07: leaves folders ungrouped, rendered above the grouped album list', () => {
      spaceAlbumViewSettings.update((settings) => ({ ...settings, groupBy: SpaceAlbumGroupBy.Year }));
      const folders = [makeFolder('trips', 'Trips'), makeFolder('family', 'Family')];
      const albums = [
        makeAlbum({ id: 'a1', endDate: '2020-06-01T00:00:00.000Z' }),
        makeAlbum({ id: 'a2', endDate: '2024-06-01T00:00:00.000Z' }),
      ];

      render(SpaceAlbumsList, { spaceId: 's-1', albums, folders, canManage: false });

      expect(screen.getAllByTestId('space-album-folder-card')).toHaveLength(2);
      const foldersGrid = screen.getByTestId('space-album-folders-grid');
      const firstGroupHeader = screen.getAllByTestId(/^space-album-group-/)[0];
      expect(foldersGrid.compareDocumentPosition(firstGroupHeader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    // W-18: while searching, the path subtitle is already the organising signal — grouping the
    // space-wide hits on top of it would bury it.
    it('W-18: renders flattened hits ungrouped even when group-by is active', () => {
      spaceAlbumViewSettings.update((settings) => ({ ...settings, groupBy: SpaceAlbumGroupBy.Year }));
      const folders = [makeFolder('trips', 'Trips')];
      const albums = [makeAlbum({ id: 'a2', albumName: 'Venice', folderId: 'trips' })];

      const { container } = render(SpaceAlbumsList, {
        spaceId: 's-1',
        albums,
        folders,
        canManage: false,
        searchQuery: 'ven',
      });

      expect(container.querySelectorAll('[data-testid^="space-album-group-"]')).toHaveLength(0);
      expect(screen.getByText('Venice')).toBeInTheDocument();
    });

    // W-09: search escapes the current folder entirely and labels each hit with its path. (The
    // breadcrumb itself lives on the page, not this component — see
    // "W-09: hides the breadcrumb while searching" in space-albums-page.spec.ts.)
    it('W-09: hides folders while searching, and labels each hit with its path', () => {
      const folders = [makeFolder('trips', 'Trips')];
      const albums = [makeAlbum({ id: 'a2', albumName: 'Venice', folderId: 'trips' })];

      const { container } = render(SpaceAlbumsList, {
        spaceId: 's-1',
        albums,
        folders,
        canManage: false,
        searchQuery: 'ven',
      });

      expect(container.querySelectorAll('[data-testid="space-album-folder-card"]')).toHaveLength(0);
      expect(screen.getByTestId('space-album-search-path-a2')).toHaveTextContent('Trips');
    });

    // Finding: flattenForSearch returns raw server order; a search must not silently discard the
    // active sort (grouping is the only thing search is allowed to drop, per W-18).
    it('sorts search hits using the active sort order rather than raw server order', () => {
      spaceAlbumViewSettings.update((s) => ({ ...s, sortBy: AlbumSortBy.Title, sortOrder: SortOrder.Asc }));
      // Deliberately inserted out of alpha order, so a passing test proves re-sorting happened.
      const albums = [makeAlbum({ id: 'b', albumName: 'Bravo Trip' }), makeAlbum({ id: 'a', albumName: 'Alpha Trip' })];

      render(SpaceAlbumsList, { spaceId: 's-1', albums, folders: [], canManage: false, searchQuery: 'trip' });

      expect(idsInCoverOrder()).toEqual(['a', 'b']);
    });

    // Finding: a List-view user's explicit preference must survive a search — it was previously
    // discarded in favour of cover cards for the duration of the query.
    it('respects List view while searching, rendering the table instead of cover cards', () => {
      spaceAlbumViewSettings.update((s) => ({ ...s, view: AlbumViewMode.List }));
      const folders = [makeFolder('trips', 'Trips')];
      const albums = [makeAlbum({ id: 'a2', albumName: 'Venice', folderId: 'trips' })];

      render(SpaceAlbumsList, { spaceId: 's-1', albums, folders, canManage: false, searchQuery: 'ven' });

      expect(screen.getByTestId('space-album-row-a2')).toBeInTheDocument();
      expect(screen.queryByTestId('space-album-card')).not.toBeInTheDocument();
    });

    // Finding: with no terminal {:else}, a level with zero folders and zero albums (root, before
    // the caller's on-mount folder fetch resolves) rendered nothing at all instead of some kind
    // of feedback.
    it('renders a fallback instead of leaving the pane blank when nothing exists at the root level', () => {
      render(SpaceAlbumsList, { spaceId: 's-1', albums: [], folders: [], canManage: false });

      expect(screen.getByTestId('space-albums-loading')).toBeInTheDocument();
    });

    // T-08 (mirrored from mobile, see space-album-folders.ts): an album whose folderId names a
    // folder we have not synced/fetched yet is shown at the root instead of hidden — this used to
    // be indistinguishable from "nothing exists at this level" (the case above), which made the
    // album vanish behind the loading fallback for as long as its folder stayed unknown.
    it('shows an album at the root instead of the loading fallback when its folder is not loaded', () => {
      const albums = [makeAlbum({ id: 'a1', albumName: 'Rome', folderId: 'unknown-folder' })];
      render(SpaceAlbumsList, { spaceId: 's-1', albums, folders: [], canManage: false });

      expect(screen.getByText('Rome')).toBeInTheDocument();
      expect(screen.queryByTestId('space-albums-loading')).not.toBeInTheDocument();
    });

    // Finding: when the folders fetch has failed, we can't trust `contents.albums`' level-scoping
    // (we don't know which folder any given folderId belongs under), so degrade to showing every
    // album in the space flat rather than hiding anything with a non-null folderId.
    it('foldersUnavailable: falls back to a flat, unscoped album list', () => {
      const albums = [
        makeAlbum({ id: 'a1', albumName: 'Rome' }),
        makeAlbum({ id: 'a2', albumName: 'Venice', folderId: 'trips' }),
      ];
      render(SpaceAlbumsList, { spaceId: 's-1', albums, folders: [], canManage: false, foldersUnavailable: true });

      expect(screen.getByText('Rome')).toBeInTheDocument();
      expect(screen.getByText('Venice')).toBeInTheDocument();
      expect(screen.queryByTestId('space-albums-loading')).not.toBeInTheDocument();
    });
  });

  describe('multi-select', () => {
    // Alphabetic names keyed to id so Title/Asc sort yields a, b, c, d, e, f in order —
    // deterministic without depending on the store's default sort.
    const NAMES: Record<string, string> = { a: 'Alpha', b: 'Bravo', c: 'Charlie', d: 'Delta', e: 'Echo', f: 'Foxtrot' };
    function linkedAlbum(id: string, overrides: Partial<SharedSpaceLinkedAlbumDto> = {}): SharedSpaceLinkedAlbumDto {
      return makeAlbum({ id, albumName: NAMES[id] ?? id, ...overrides });
    }
    function folderDto(id: string): SharedSpaceAlbumFolderDto {
      return {
        id,
        spaceId: 's-1',
        parentId: null,
        name: NAMES[id] ?? id,
        createdById: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
    }

    const props = {
      spaceId: 's-1',
      albums: [linkedAlbum('a'), linkedAlbum('b')],
      folders: [folderDto('f')],
      canManage: true,
      currentFolderId: null as string | null,
      searchQuery: '',
    };

    // canManage: true renders the per-item kebab menu (ButtonContextMenu → Tooltip), which needs a
    // TooltipProvider ancestor — plain `render` throws "Context Tooltip.Provider not found" the
    // moment a folder or album with canManage renders. renderWithTooltips wraps in one.
    const renderList = (componentProps: typeof props & Record<string, unknown>) =>
      renderWithTooltips(SpaceAlbumsList, componentProps);

    beforeEach(() => {
      vi.clearAllMocks();
      spaceAlbumViewSettings.reset();
      spaceAlbumViewSettings.update((s) => ({ ...s, sortBy: AlbumSortBy.Title, sortOrder: SortOrder.Asc }));
    });

    // `fireEvent` types its targets as Window (not `typeof globalThis`), even though they're the
    // same object in happy-dom — cast once and reuse rather than repeating `as unknown as Window`.
    const win = globalThis as unknown as Window;

    // keyboardManager is a module-level singleton (addEventListener('keydown'/'keyup') — reset it
    // after every test so a shift left "held" by one test can't leak into the next.
    afterEach(async () => {
      await fireEvent.blur(win);
    });

    // S-1
    it('clicking the check circle enters selection without navigating', async () => {
      const onOpen = vi.fn();
      renderList({ ...props, onOpenAlbum: onOpen });
      await fireEvent.click(screen.getByTestId('space-album-select-a'));
      expect(screen.getByTestId('space-album-select-bar')).toBeInTheDocument();
      expect(onOpen).not.toHaveBeenCalled();
    });

    // S-2
    it('clicking a card while a selection is active toggles instead of navigating', async () => {
      const onOpen = vi.fn();
      renderList({ ...props, onOpenAlbum: onOpen });
      await fireEvent.click(screen.getByTestId('space-album-select-a'));
      await fireEvent.click(screen.getByTestId('space-album-card-b'));
      expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('2');
      expect(onOpen).not.toHaveBeenCalled();
    });

    // S-3
    it('clicking a card with no selection opens the album', async () => {
      const onOpen = vi.fn();
      renderList({ ...props, onOpenAlbum: onOpen });
      await fireEvent.click(screen.getByTestId('space-album-card-b'));
      expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
      expect(screen.queryByTestId('space-album-select-bar')).not.toBeInTheDocument();
    });

    // S-9 — the trigger AppNavigate does NOT cover.
    it('clears the selection when currentFolderId changes', async () => {
      const { rerender } = renderList({ ...props, currentFolderId: null });
      await fireEvent.click(screen.getByTestId('space-album-select-a'));
      await fireEvent.click(screen.getByTestId('space-album-select-b'));
      expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('2');

      await rerender({
        component: SpaceAlbumsList,
        componentProps: { ...props, currentFolderId: 'folder-1' },
      });
      expect(screen.queryByTestId('space-album-select-bar')).not.toBeInTheDocument();
    });

    // S-9b — searchQuery is local $state, so no navigation fires at all.
    it('clears the selection when searchQuery changes', async () => {
      // 'bra' matches only 'Bravo' (album b) — 'Alpha' does not contain that substring.
      const { rerender } = renderList({ ...props, searchQuery: 'bra' });
      await fireEvent.click(screen.getByTestId('space-album-select-b'));
      expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('1');

      await rerender({
        component: SpaceAlbumsList,
        componentProps: { ...props, searchQuery: 'brav' },
      });
      expect(screen.queryByTestId('space-album-select-bar')).not.toBeInTheDocument();
    });

    // S-9c — the trigger currentFolderId/searchQuery do NOT cover: navigating between two DIFFERENT
    // spaces hits the same route id (`/spaces/[spaceId]/albums`), so SpaceAlbumsList is not
    // remounted, and neither currentFolderId nor searchQuery necessarily change either. Only
    // AppNavigate catches this.
    it('clears the selection on AppNavigate', async () => {
      renderList(props);
      await fireEvent.click(screen.getByTestId('space-album-select-a'));
      expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('1');

      eventManager.emit('AppNavigate');

      await waitFor(() => expect(screen.queryByTestId('space-album-select-bar')).not.toBeInTheDocument());
    });

    it('clears the selection when Escape is pressed', async () => {
      renderList(props);
      await fireEvent.click(screen.getByTestId('space-album-select-a'));
      expect(screen.getByTestId('space-album-select-bar')).toBeInTheDocument();

      await fireEvent.keyDown(win, { key: 'Escape' });

      expect(screen.queryByTestId('space-album-select-bar')).not.toBeInTheDocument();
    });

    // S-10
    it('renders no check circle when canManage is false', () => {
      renderList({ ...props, canManage: false });
      // Positive control: the cards themselves ARE rendered, so this is not vacuous.
      expect(screen.getByTestId('space-album-card-a')).toBeInTheDocument();
      expect(screen.queryByTestId('space-album-select-a')).not.toBeInTheDocument();
    });

    // S-13. NOTE: unlike most web unit tests in this codebase, this file's beforeAll registers the
    // REAL en-US locale (see the "folders" describe block's own comment above), so $t() resolves
    // actual copy here rather than the raw i18n key — assert on the rendered English text.
    it('offers move and delete but not unlink for a folder selection', async () => {
      renderList(props);
      await fireEvent.click(screen.getByTestId('space-album-folder-select-f'));
      const bar = screen.getByTestId('space-album-select-bar');
      expect(within(bar).getByRole('button', { name: 'Move to folder…' })).toBeInTheDocument();
      expect(within(bar).getByRole('button', { name: 'Delete folder' })).toBeInTheDocument();
      expect(within(bar).queryByRole('button', { name: 'Unlink from space' })).not.toBeInTheDocument();
    });

    // S-11 at the component level: selecting a folder replaces an album selection.
    it('replaces an album selection when a folder is selected', async () => {
      renderList(props);
      await fireEvent.click(screen.getByTestId('space-album-select-a'));
      expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('1'); // positive control
      await fireEvent.click(screen.getByTestId('space-album-folder-select-f'));
      expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('1');
      expect(screen.getByTestId('space-album-card-a')).not.toHaveAttribute('data-selected', 'true');
    });

    // The bar offers only the kind's actions — album side of S-13.
    it('offers unlink and timeline actions but not delete for an album selection', async () => {
      renderList(props);
      await fireEvent.click(screen.getByTestId('space-album-select-a'));
      const bar = screen.getByTestId('space-album-select-bar');
      expect(within(bar).getByRole('button', { name: 'Unlink from space' })).toBeInTheDocument();
      expect(within(bar).getByRole('button', { name: 'Move to folder…' })).toBeInTheDocument();
      expect(within(bar).queryByRole('button', { name: 'Delete folder' })).not.toBeInTheDocument();
    });

    // S-4-equivalent at the UI level: a Shift-click while a selection is active commits the
    // contiguous range from the anchor.
    it('shift-clicking a card selects the contiguous range from the anchor', async () => {
      renderList({
        ...props,
        albums: [linkedAlbum('a'), linkedAlbum('b'), linkedAlbum('c')],
        folders: [],
      });
      await fireEvent.click(screen.getByTestId('space-album-select-a'));
      await fireEvent.click(screen.getByTestId('space-album-card-c'), { shiftKey: true });

      expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('3');
      expect(screen.getByTestId('space-album-card-b')).toHaveAttribute('data-selected', 'true');
    });

    // §4.3 / forward-note 2: folders always sort before albums in `orderedIds`, so the two kinds
    // stay CONTIGUOUS blocks. If they were interleaved, this album-only range could pull the
    // folder's id into the (kind: 'album') selection, inflating the count past 3.
    it('keeps folder and album ids contiguous so an album-only range never pulls in the folder', async () => {
      renderList({
        ...props,
        albums: [linkedAlbum('a'), linkedAlbum('b'), linkedAlbum('c')],
        folders: [folderDto('f')],
      });
      await fireEvent.click(screen.getByTestId('space-album-select-a'));
      await fireEvent.click(screen.getByTestId('space-album-card-c'), { shiftKey: true });

      expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('3');
      expect(screen.getByTestId('space-album-folder-card')).not.toHaveAttribute('data-selected', 'true');
    });

    // Forward-note 5: `selectRange` keeps the anchor via `??=` so repeated Shift interactions stay
    // anchored to the FIRST click, not the most recent one. A regression to an unconditional `=`
    // passes all 19 manager unit tests (they never exercise a third interaction), so this has to be
    // proven through rendered output: `previewRange` EXCLUDES already-selected ids, so hovering
    // beyond the anchor reveals exactly which id the manager thinks the anchor is.
    //
    // Sequence: click a (anchor=a) → shift-click d (selects a,b,c,d; anchor stays a) → toggle c OFF
    // (selected={a,b,d}, anchor untouched) → Shift+hover e.
    //   Correct (anchor=a): range(a,e) minus {a,b,d} = {c,e} — c is highlighted.
    //   Buggy (anchor drifted to d): range(d,e) minus {a,b,d} = {e} only — c is NOT highlighted.
    it('keeps the original Shift anchor across repeated Shift interactions', async () => {
      renderList({
        ...props,
        albums: [linkedAlbum('a'), linkedAlbum('b'), linkedAlbum('c'), linkedAlbum('d'), linkedAlbum('e')],
        folders: [],
      });

      await fireEvent.click(screen.getByTestId('space-album-select-a'));
      await fireEvent.click(screen.getByTestId('space-album-card-d'), { shiftKey: true });
      expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('4'); // a,b,c,d

      await fireEvent.click(screen.getByTestId('space-album-select-c')); // toggle c off
      expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('3'); // a,b,d

      await fireEvent.keyDown(win, { key: 'Shift', shiftKey: true });
      await fireEvent.mouseEnter(screen.getByTestId('space-album-card-e'));

      expect(screen.getByTestId('space-album-card-c')).toHaveAttribute('data-candidate', 'true');
    });

    // reconcile (E-5): an item that disappears from the incoming props while selected must drop out
    // of the selection silently, updating the count — without wiping an unrelated in-progress
    // interaction test (covered separately by the anchor test above using the SAME candidate path).
    it('drops a selected album from the selection when it disappears from props', async () => {
      const { rerender } = renderList({
        ...props,
        albums: [linkedAlbum('a'), linkedAlbum('b')],
      });
      await fireEvent.click(screen.getByTestId('space-album-select-a'));
      await fireEvent.click(screen.getByTestId('space-album-select-b'));
      expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('2');

      await rerender({
        component: SpaceAlbumsList,
        componentProps: { ...props, albums: [linkedAlbum('b')] }, // 'a' unlinked elsewhere
      });

      await waitFor(() => expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('1'));
    });

    // I-2: switching spaces is a same-route transition (`/spaces/A/albums` → `/spaces/B/albums`
    // share the route id `/(user)/spaces/[spaceId]/albums`), so AppNavigate does NOT fire — and an
    // album present in BOTH spaces would survive reconcile too (it's genuinely still present in
    // the new space's data), so reconcile is not a reliable backstop either. spaceId itself has to
    // be an explicit clearing trigger.
    it('clears the selection when spaceId changes', async () => {
      const { rerender } = renderList({ ...props, spaceId: 'space-a' });
      await fireEvent.click(screen.getByTestId('space-album-select-a'));
      expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('1');

      // Same album id present in the "new" space's data too — reconcile alone would keep it.
      await rerender({
        component: SpaceAlbumsList,
        componentProps: { ...props, spaceId: 'space-b' },
      });

      expect(screen.queryByTestId('space-album-select-bar')).not.toBeInTheDocument();
    });

    // M-3 / E-15: canManage can flip to false mid-selection (a role downgrade plus some unrelated
    // invalidateAll() refreshing `members`). The bar is already gated on canManage and disappears,
    // but without also clearing the selection itself, every subsequent card click would silently
    // toggle an invisible selection instead of opening the album.
    it('clears the selection when canManage goes false, so cards remain openable', async () => {
      const onOpen = vi.fn();
      const { rerender } = renderList({ ...props, canManage: true, onOpenAlbum: onOpen });
      await fireEvent.click(screen.getByTestId('space-album-select-a'));
      expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('1');

      await rerender({
        component: SpaceAlbumsList,
        componentProps: { ...props, canManage: false, onOpenAlbum: onOpen },
      });

      expect(screen.queryByTestId('space-album-select-bar')).not.toBeInTheDocument();

      await fireEvent.click(screen.getByTestId('space-album-card-b'));
      expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
    });

    // M-2: the hover handlers only run on `mouseenter`, so releasing Shift mid-hover (without a
    // new mouseenter elsewhere) must not leave the candidate outline stuck on whatever was last
    // previewed.
    it('clears the Shift-hover preview when Shift is released', async () => {
      renderList({
        ...props,
        albums: [linkedAlbum('a'), linkedAlbum('b'), linkedAlbum('c')],
        folders: [],
      });
      await fireEvent.click(screen.getByTestId('space-album-select-a'));

      await fireEvent.keyDown(win, { key: 'Shift', shiftKey: true });
      await fireEvent.mouseEnter(screen.getByTestId('space-album-card-c'));
      expect(screen.getByTestId('space-album-card-b')).toHaveAttribute('data-candidate', 'true'); // positive control

      await fireEvent.keyUp(win, { key: 'Shift', shiftKey: false });

      expect(screen.getByTestId('space-album-card-b')).not.toHaveAttribute('data-candidate', 'true');
    });

    // I-1: §4.3 says a range cannot pass THROUGH collapsed items; E-14 says collapsing must not
    // deselect what's already selected inside a group. Neither rule is exercised by any other
    // test in this file, and both directions are cheap to break independently (see the guard at
    // `orderedAlbumIds`'s isGrouped branch, and the `presentIds` reconcile source).
    describe('collapsed groups', () => {
      beforeEach(() => {
        // `spaceAlbumViewSettings.reset()` (outer beforeEach) resets the store back to the SAME
        // default object `persisted()` was constructed with (svelte-persisted-store does not
        // clone it) — and `toggleSpaceAlbumGroupCollapsing` mutates `collapsedGroups` in place, so
        // a collapse from an EARLIER test can leak through `reset()` into this one.
        // `collapsedGroups` is keyed by groupBy, so set groupBy to Year FIRST — expanding while
        // still on the group-by the previous test left behind would clear the wrong bucket.
        spaceAlbumViewSettings.update((s) => ({ ...s, groupBy: SpaceAlbumGroupBy.Year }));
        expandAllSpaceAlbumGroups();
      });

      // Sorted by year, group order defaults to Desc: 2024, 2023, 2022.
      const groupedAlbums = [
        linkedAlbum('a', { endDate: '2024-01-01T00:00:00.000Z' }),
        linkedAlbum('b', { endDate: '2023-01-01T00:00:00.000Z' }),
        linkedAlbum('c', { endDate: '2022-01-01T00:00:00.000Z' }),
      ];

      it('a Shift-range does not pull in an album hidden inside a collapsed group', async () => {
        renderList({ ...props, albums: groupedAlbums, folders: [] });

        toggleSpaceAlbumGroupCollapsing('2023');
        await waitFor(() =>
          expect(screen.getByTestId('space-album-group-2023')).toHaveAttribute('aria-expanded', 'false'),
        );

        await fireEvent.click(screen.getByTestId('space-album-select-a'));
        await fireEvent.click(screen.getByTestId('space-album-card-c'), { shiftKey: true });

        // 'a' (2024) and 'c' (2022) were both visible and selected; 'b' lives inside the collapsed
        // 2023 group. Without the collapsed-group filter, the range would also pull in 'b',
        // producing a count of 3 instead of 2.
        expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('2');
      });

      it('collapsing a group does not deselect an album already selected inside it (E-14)', async () => {
        renderList({ ...props, albums: groupedAlbums, folders: [] });

        await fireEvent.click(screen.getByTestId('space-album-select-b'));
        expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('1'); // positive control

        toggleSpaceAlbumGroupCollapsing('2023');
        await waitFor(() =>
          expect(screen.getByTestId('space-album-group-2023')).toHaveAttribute('aria-expanded', 'false'),
        );

        // If reconcile were driven by the (now collapsed-filtered) orderedIds instead of the full
        // albums/folders props, 'b' would drop out of the selection the instant it collapsed.
        expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('1');
      });
    });

    // I-3: the five selection-related props threaded into SpaceAlbumsTable (onOpenAlbum,
    // onToggleSelectAlbum, onToggleSelectFolder, isAlbumSelected, isFolderSelected) have no
    // coverage anywhere else — space-albums-table.spec.ts only exercises the table in isolation
    // with hand-injected predicates, and every OTHER test in this file renders Cover mode.
    describe('List view wiring', () => {
      beforeEach(() => {
        spaceAlbumViewSettings.update((s) => ({ ...s, view: AlbumViewMode.List }));
      });

      it('check circle toggles an album row into the selection and marks it selected', async () => {
        renderList({ ...props, folders: [] });

        await fireEvent.click(screen.getByTestId('space-album-select-a'));

        expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('1');
        expect(screen.getByTestId('space-album-row-a').closest('tr')).toHaveAttribute('data-selected', 'true');
        // Positive control: an unselected row does not carry the attribute.
        expect(screen.getByTestId('space-album-row-b').closest('tr')).not.toHaveAttribute('data-selected', 'true');
      });

      it('clicking a row toggles instead of opening once a selection is active', async () => {
        const onOpen = vi.fn();
        renderList({ ...props, folders: [], onOpenAlbum: onOpen });

        await fireEvent.click(screen.getByTestId('space-album-select-a'));
        onOpen.mockClear();
        await fireEvent.click(screen.getByTestId('space-album-row-b'));

        expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('2');
        expect(onOpen).not.toHaveBeenCalled();
      });

      it('check circle toggles a folder row into the selection and marks it selected', async () => {
        renderList(props); // props already includes folderDto('f')

        await fireEvent.click(screen.getByTestId('space-album-folder-select-f'));

        expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('1');
        expect(screen.getByTestId('space-album-folder-row-f')).toHaveAttribute('data-selected', 'true');
      });

      it('search + List view: check circle toggles selection on a search hit', async () => {
        renderList({ ...props, searchQuery: 'bra', folders: [] });

        await fireEvent.click(screen.getByTestId('space-album-select-b'));

        expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('1');
        expect(screen.getByTestId('space-album-row-b').closest('tr')).toHaveAttribute('data-selected', 'true');
      });

      // Fix round 2: SpaceAlbumsTable is rendered at a THIRD site — the {#if isGrouped} branch —
      // which none of the tests above reach, since none of them set groupBy away from its default
      // None. Grouped List is an ordinary combination a user reaches from the existing view
      // controls, and the props threaded into that call site had zero coverage.
      describe('grouped', () => {
        beforeEach(() => {
          // Same ordering as the "collapsed groups" describe above, and for the same reason:
          // collapsedGroups is keyed by groupBy and reset() does not clone it, so a Year-grouping
          // collapse from an earlier test could otherwise leak in. Set groupBy first, then expand.
          spaceAlbumViewSettings.update((s) => ({ ...s, groupBy: SpaceAlbumGroupBy.Year }));
          expandAllSpaceAlbumGroups();
        });

        it('check circle toggles an album row into the selection inside a grouped List table', async () => {
          renderList({
            ...props,
            albums: [
              linkedAlbum('a', { endDate: '2024-01-01T00:00:00.000Z' }),
              linkedAlbum('b', { endDate: '2023-01-01T00:00:00.000Z' }),
            ],
            folders: [],
          });

          // Positive control: proves this render actually reached the grouped branch (which
          // renders a group-header row) rather than silently falling through to the ungrouped
          // table — a group header only exists in {#if isGrouped} branch's markup.
          expect(screen.getByTestId('space-album-group-header-2024')).toBeInTheDocument();

          await fireEvent.click(screen.getByTestId('space-album-select-a'));

          expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('1');
          expect(screen.getByTestId('space-album-row-a').closest('tr')).toHaveAttribute('data-selected', 'true');
          // Positive control: an unselected row does not carry the attribute.
          expect(screen.getByTestId('space-album-row-b').closest('tr')).not.toHaveAttribute('data-selected', 'true');
        });
      });
    });
  });
});
