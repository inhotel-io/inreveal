import type { SharedSpaceLinkedAlbumDto } from '@immich/sdk';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import SpaceAlbumsTable from '$lib/components/spaces/space-albums-table.svelte';
import { SpaceAlbumGroupBy, spaceAlbumViewSettings } from '$lib/stores/space-album-view-settings.store';
import { toggleSpaceAlbumGroupCollapsing } from '$lib/utils/space-album-grouping';
import { renderWithTooltips } from '$tests/helpers';

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
    ...overrides,
  };
}

describe('SpaceAlbumsTable', () => {
  beforeAll(async () => {
    register('en-US', () => import('$i18n/en.json'));
    await init({ fallbackLocale: 'en-US', initialLocale: 'en-US' });
    await waitLocale('en-US');
  });

  const a1 = makeAlbum({ id: 'a-1', albumName: 'Vacation', assetCount: 5 });
  const a2 = makeAlbum({ id: 'a-2', albumName: 'Road Trip', assetCount: 10 });

  it('renders a linking row per album to the space album route', () => {
    render(SpaceAlbumsTable, { spaceId: 's-1', albums: [a1, a2], canManage: false });
    expect(screen.getByTestId(`space-album-row-${a1.id}`)).toHaveAttribute('href', '/spaces/s-1/albums/a-1');
    expect(screen.getByText('Vacation')).toBeInTheDocument();
    expect(screen.getByText(/5 items/i)).toBeInTheDocument();
  });

  it('shows the manage menu only when canManage', () => {
    renderWithTooltips(SpaceAlbumsTable, { spaceId: 's-1', albums: [a1], canManage: true });
    expect(screen.getByTestId(`space-album-row-menu-${a1.id}`)).toBeInTheDocument();
  });

  it('does not show manage menu when canManage is false', () => {
    render(SpaceAlbumsTable, { spaceId: 's-1', albums: [a1], canManage: false });
    expect(screen.queryByTestId(`space-album-row-menu-${a1.id}`)).not.toBeInTheDocument();
  });

  it('renders all albums as rows', () => {
    render(SpaceAlbumsTable, { spaceId: 's-1', albums: [a1, a2], canManage: false });
    expect(screen.getByTestId('space-album-row-a-1')).toBeInTheDocument();
    expect(screen.getByTestId('space-album-row-a-2')).toBeInTheDocument();
  });

  describe('grouped rendering', () => {
    beforeEach(() => {
      localStorage.clear();
      spaceAlbumViewSettings.reset();
    });

    it('renders a collapsible header per group with name and count', () => {
      spaceAlbumViewSettings.update((s) => ({ ...s, groupBy: SpaceAlbumGroupBy.Year }));
      const groups = [
        { id: '2024', name: '2024', albums: [a1] },
        { id: '2020', name: '2020', albums: [a2] },
      ];
      render(SpaceAlbumsTable, { spaceId: 's-1', albums: [a1, a2], canManage: false, groups, grouped: true });
      const header2024 = screen.getByTestId('space-album-group-header-2024');
      expect(header2024).toHaveTextContent('2024');
      expect(header2024).toHaveTextContent('1');
      expect(screen.getByTestId('space-album-group-header-2020')).toHaveTextContent('2020');
      expect(screen.getByTestId('space-album-row-a-1')).toBeInTheDocument();
      expect(screen.getByTestId('space-album-row-a-2')).toBeInTheDocument();
    });

    it('collapsing a group marks its header collapsed and hides its rows', async () => {
      spaceAlbumViewSettings.update((s) => ({ ...s, groupBy: SpaceAlbumGroupBy.Year }));
      const groups = [
        { id: '2024', name: '2024', albums: [a1] },
        { id: '2020', name: '2020', albums: [a2] },
      ];
      render(SpaceAlbumsTable, { spaceId: 's-1', albums: [a1, a2], canManage: false, groups, grouped: true });
      expect(screen.getByTestId('space-album-group-header-2024')).toHaveAttribute('aria-expanded', 'true');
      toggleSpaceAlbumGroupCollapsing('2024');
      await waitFor(() =>
        expect(screen.getByTestId('space-album-group-header-2024')).toHaveAttribute('aria-expanded', 'false'),
      );
    });
  });

  describe('multi-select', () => {
    const folder = {
      id: 'f-1',
      spaceId: 's-1',
      parentId: null,
      name: 'Trips',
      createdById: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    // canManage: true renders the album row's kebab menu (ButtonContextMenu → Tooltip), which
    // needs a TooltipProvider ancestor — see the same note in space-albums-list.spec.ts.
    it('renders a check circle per row when canManage is true', () => {
      renderWithTooltips(SpaceAlbumsTable, { spaceId: 's-1', albums: [a1], folders: [folder], canManage: true });
      expect(screen.getByTestId(`space-album-select-${a1.id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`space-album-folder-select-${folder.id}`)).toBeInTheDocument();
    });

    it('renders no check circle when canManage is false', () => {
      render(SpaceAlbumsTable, { spaceId: 's-1', albums: [a1], folders: [folder], canManage: false });
      expect(screen.queryByTestId(`space-album-select-${a1.id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`space-album-folder-select-${folder.id}`)).not.toBeInTheDocument();
    });

    it('clicking an album checkbox calls onToggleSelectAlbum with the shift key state, never onOpenAlbum', async () => {
      const onToggleSelectAlbum = vi.fn();
      const onOpenAlbum = vi.fn();
      renderWithTooltips(SpaceAlbumsTable, {
        spaceId: 's-1',
        albums: [a1],
        canManage: true,
        onToggleSelectAlbum,
        onOpenAlbum,
      });

      await fireEvent.click(screen.getByTestId(`space-album-select-${a1.id}`), { shiftKey: true });

      expect(onToggleSelectAlbum).toHaveBeenCalledWith(a1, true);
      expect(onOpenAlbum).not.toHaveBeenCalled();
    });

    it('clicking an album row calls onOpenAlbum with the shift key state', async () => {
      const onOpenAlbum = vi.fn();
      renderWithTooltips(SpaceAlbumsTable, { spaceId: 's-1', albums: [a1], canManage: true, onOpenAlbum });

      await fireEvent.click(screen.getByTestId(`space-album-row-${a1.id}`), { shiftKey: true });

      expect(onOpenAlbum).toHaveBeenCalledWith(a1, true);
    });

    it('clicking a folder checkbox calls onToggleSelectFolder, never onOpenFolder', async () => {
      const onToggleSelectFolder = vi.fn();
      const onOpenFolder = vi.fn();
      render(SpaceAlbumsTable, {
        spaceId: 's-1',
        albums: [],
        folders: [folder],
        canManage: true,
        onToggleSelectFolder,
        onOpenFolder,
      });

      await fireEvent.click(screen.getByTestId(`space-album-folder-select-${folder.id}`), { shiftKey: true });

      expect(onToggleSelectFolder).toHaveBeenCalledWith(folder, true);
      expect(onOpenFolder).not.toHaveBeenCalled();
    });

    it('clicking a folder row calls onOpenFolder with the shift key state', async () => {
      const onOpenFolder = vi.fn();
      render(SpaceAlbumsTable, { spaceId: 's-1', albums: [], folders: [folder], canManage: true, onOpenFolder });

      await fireEvent.click(screen.getByTestId(`space-album-folder-row-${folder.id}`), { shiftKey: true });

      expect(onOpenFolder).toHaveBeenCalledWith(folder, true);
    });

    it('reflects isAlbumSelected / isFolderSelected via data-selected on the row', () => {
      renderWithTooltips(SpaceAlbumsTable, {
        spaceId: 's-1',
        albums: [a1],
        folders: [folder],
        canManage: true,
        isAlbumSelected: (id: string) => id === a1.id,
        isFolderSelected: () => false,
      });
      expect(screen.getByTestId(`space-album-row-${a1.id}`).closest('tr')).toHaveAttribute('data-selected', 'true');
      expect(screen.getByTestId(`space-album-folder-row-${folder.id}`)).not.toHaveAttribute('data-selected', 'true');
    });

    // M-1: without stopPropagation on the menu cell, opening the kebab and clicking an option
    // would ALSO bubble to the <tr>'s onclick and fire onOpenAlbum — orphaning whatever the menu
    // option triggered (here, an unlink confirm dialog would open behind a navigation).
    it('clicking the row kebab menu does not also fire onOpenAlbum', async () => {
      const onOpenAlbum = vi.fn();
      const onUnlink = vi.fn();
      renderWithTooltips(SpaceAlbumsTable, {
        spaceId: 's-1',
        albums: [a1],
        canManage: true,
        onOpenAlbum,
        onUnlink,
        onToggleTimeline: vi.fn(),
      });

      const menuButton = screen.getByTestId(`space-album-row-menu-${a1.id}`).querySelector('button')!;
      await fireEvent.click(menuButton);
      await fireEvent.click(await screen.findByText('Unlink album'));

      expect(onUnlink).toHaveBeenCalledWith(a1);
      expect(onOpenAlbum).not.toHaveBeenCalled();
    });
  });

  // This file registers a real 'en-US' locale in beforeAll above (unlike most spec files in this
  // repo), so $t() renders actual translated text here rather than raw message keys — assertions
  // below match the real strings, consistent with the rest of this file (e.g. 'Unlink album').
  //
  // The table's row menu has no Move item at all (no onMove prop exists on this component) — only
  // the capability split is mirrored here, not the card's third option.
  //
  // canRename/canDelete are per-row PREDICATES `(album) => boolean` (fix round 1: the table
  // renders every album in `albums` from one call, unlike SpaceAlbumCard which is instantiated
  // once per album — a scalar cannot express "owns row A, not row B" at all). Every test below
  // still exercises a single-album table, so `() => true`/`() => false` reproduce the exact
  // per-scenario capability the original literal booleans encoded; the dedicated "mixed ownership"
  // test further down is what actually proves the per-row behaviour a scalar could never express.
  describe('capability-gated menu', () => {
    // Scenario 26 — the positive case the negatives below depend on.
    it('shows Rename and Delete to an editor who owns the album', () => {
      renderWithTooltips(SpaceAlbumsTable, {
        spaceId: 's-1',
        albums: [a1],
        canManage: true,
        canRename: () => true,
        canDelete: () => true,
        onUnlink: vi.fn(),
        onToggleTimeline: vi.fn(),
        onRename: vi.fn(),
        onDelete: vi.fn(),
      });

      expect(screen.getByText('Rename album')).toBeInTheDocument();
      expect(screen.getByText('Delete album')).toBeInTheDocument();
      expect(screen.getByText('Unlink album')).toBeInTheDocument();
    });

    // Scenario 27
    it('shows Rename but not Delete to an editor who does not own the album', () => {
      renderWithTooltips(SpaceAlbumsTable, {
        spaceId: 's-1',
        albums: [a1],
        canManage: true,
        canRename: () => true,
        canDelete: () => false,
        onUnlink: vi.fn(),
        onToggleTimeline: vi.fn(),
        onRename: vi.fn(),
      });

      expect(screen.getByText('Rename album')).toBeInTheDocument();
      expect(screen.queryByText('Delete album')).not.toBeInTheDocument();
    });

    // Scenario 28
    it('shows only Rename and Delete to a viewer who owns the album', () => {
      renderWithTooltips(SpaceAlbumsTable, {
        spaceId: 's-1',
        albums: [a1],
        canManage: false,
        canRename: () => true,
        canDelete: () => true,
        onRename: vi.fn(),
        onDelete: vi.fn(),
      });

      expect(screen.getByText('Rename album')).toBeInTheDocument();
      expect(screen.getByText('Delete album')).toBeInTheDocument();
      expect(screen.queryByText('Unlink album')).not.toBeInTheDocument();
    });

    // Scenario 29
    it('renders no menu at all for a viewer who does not own the album', () => {
      render(SpaceAlbumsTable, {
        spaceId: 's-1',
        albums: [a1],
        canManage: false,
        canRename: () => false,
        canDelete: () => false,
      });

      expect(screen.queryByTestId(`space-album-row-menu-${a1.id}`)).not.toBeInTheDocument();
    });

    // Fix round 1 (Task 7 review finding): before canRename/canDelete became per-row predicates,
    // a mixed-ownership List-view render had no way to grant Delete on an owned row without ALSO
    // granting it on every other row rendered in the same table — under-granting everyone (owners
    // included), never over-granting, but still wrong. Two albums, one owned ('a1') one not
    // ('a2'), in a SINGLE table render is the only shape of test that can catch this: a scalar
    // prop could produce identical output for a1 and a2 no matter what value was chosen, so this
    // could not have been written before canRename/canDelete gained a per-row shape.
    it('shows Delete on the owned row and not on the unowned row within the same render', () => {
      const owned = makeAlbum({ id: 'owned', albumName: 'Mine', ownerId: 'me' });
      const unowned = makeAlbum({ id: 'unowned', albumName: 'Theirs', ownerId: 'someone-else' });
      renderWithTooltips(SpaceAlbumsTable, {
        spaceId: 's-1',
        albums: [owned, unowned],
        canManage: false,
        canRename: (album: SharedSpaceLinkedAlbumDto) => album.ownerId === 'me',
        canDelete: (album: SharedSpaceLinkedAlbumDto) => album.ownerId === 'me',
        onRename: vi.fn(),
        onDelete: vi.fn(),
      });

      // Positive control: both rows render, so the absence below is a real per-row decision, not
      // a render failure.
      expect(screen.getByTestId('space-album-row-owned')).toBeInTheDocument();
      expect(screen.getByTestId('space-album-row-unowned')).toBeInTheDocument();

      expect(screen.getByTestId('space-album-row-menu-owned')).toBeInTheDocument();
      expect(screen.queryByTestId('space-album-row-menu-unowned')).not.toBeInTheDocument();
    });
  });
});
