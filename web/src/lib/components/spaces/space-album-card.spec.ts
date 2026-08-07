import { fireEvent, screen } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import { getActiveDragPayload, readDragPayload, setActiveDragPayload } from '$lib/utils/space-album-folder-dnd';
import { renderWithTooltips } from '$tests/helpers';
import SpaceAlbumCard from './space-album-card.svelte';

describe('SpaceAlbumCard', () => {
  beforeAll(async () => {
    register('en-US', () => import('$i18n/en.json'));
    await init({ fallbackLocale: 'en-US', initialLocale: 'en-US' });
    await waitLocale('en-US');
  });

  beforeEach(() => {
    // getActiveDragPayload is bare module state — reset so a payload set by one test can't leak
    // into a later one.
    setActiveDragPayload(null);
  });

  const album = {
    id: 'a-1',
    albumName: 'Trip',
    assetCount: 12,
    albumThumbnailAssetId: null,
    showInTimeline: true,
    addedById: null,
    linkedAt: '2026-01-01T00:00:00Z',
    albumUsers: [],
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    shared: false,
    hasSharedLink: false,
    isActivityEnabled: false,
  };

  it('links to the in-space album route', () => {
    renderWithTooltips(SpaceAlbumCard, { spaceId: 's-1', album, canManage: false });
    expect(screen.getByTestId('space-album-card-link')).toHaveAttribute('href', '/spaces/s-1/albums/a-1');
  });

  it('renders album name and count', () => {
    renderWithTooltips(SpaceAlbumCard, { spaceId: 's-1', album, canManage: false });
    expect(screen.getByText('Trip')).toBeInTheDocument();
    expect(screen.getByText(/12 items/i)).toBeInTheDocument();
  });

  it('editor sees the manage menu; viewer does not', () => {
    renderWithTooltips(SpaceAlbumCard, {
      spaceId: 's-1',
      album,
      canManage: true,
      onUnlink: vi.fn(),
      onToggleTimeline: vi.fn(),
    });
    expect(screen.getByTestId('space-album-card-menu')).toBeInTheDocument();
  });

  it('viewer has no manage menu', () => {
    renderWithTooltips(SpaceAlbumCard, { spaceId: 's-1', album, canManage: false });
    expect(screen.queryByTestId('space-album-card-menu')).not.toBeInTheDocument();
  });

  it('shows hidden-from-timeline sublabel when showInTimeline is false', () => {
    renderWithTooltips(SpaceAlbumCard, {
      spaceId: 's-1',
      album: { ...album, showInTimeline: false },
      canManage: false,
    });
    expect(screen.getByText(/hidden from timeline/i)).toBeInTheDocument();
  });

  it('when canManage=true, both the unlink and the toggle menu options are present', () => {
    renderWithTooltips(SpaceAlbumCard, {
      spaceId: 's-1',
      album,
      canManage: true,
      onUnlink: vi.fn(),
      onToggleTimeline: vi.fn(),
    });
    // album.showInTimeline=true → toggle option reads "Hide from timeline"
    expect(screen.getByText('Hide from timeline')).toBeInTheDocument();
    expect(screen.getByText('Unlink album')).toBeInTheDocument();
  });

  it('when canManage=false, neither the unlink nor the toggle menu option is present', () => {
    renderWithTooltips(SpaceAlbumCard, { spaceId: 's-1', album, canManage: false });
    expect(screen.queryByText('Hide from timeline')).not.toBeInTheDocument();
    expect(screen.queryByText('Show in timeline')).not.toBeInTheDocument();
    expect(screen.queryByText('Unlink album')).not.toBeInTheDocument();
  });

  it('renders the album cover image when a thumbnail exists', () => {
    renderWithTooltips(SpaceAlbumCard, {
      spaceId: 's-1',
      album: { ...album, id: 'a-1', albumThumbnailAssetId: 'thumb-1', albumName: 'Trip' },
      canManage: false,
    });
    expect(screen.getByAltText('Trip')).toBeInTheDocument();
  });

  it('offers "Move to folder…" alongside unlink and toggle when canManage=true', () => {
    renderWithTooltips(SpaceAlbumCard, {
      spaceId: 's-1',
      album,
      canManage: true,
      onUnlink: vi.fn(),
      onToggleTimeline: vi.fn(),
      onMove: vi.fn(),
    });
    expect(screen.getByText('Move to folder…')).toBeInTheDocument();
  });

  it('clicking "Move to folder…" calls onMove with the album', async () => {
    const onMove = vi.fn();
    renderWithTooltips(SpaceAlbumCard, {
      spaceId: 's-1',
      album,
      canManage: true,
      onUnlink: vi.fn(),
      onToggleTimeline: vi.fn(),
      onMove,
    });

    await fireEvent.click(screen.getByText('Move to folder…'));

    expect(onMove).toHaveBeenCalledWith(album);
  });

  it('viewer sees no "Move to folder…" option either', () => {
    renderWithTooltips(SpaceAlbumCard, { spaceId: 's-1', album, canManage: false });
    expect(screen.queryByText('Move to folder…')).not.toBeInTheDocument();
  });

  // W-11's album-card equivalent: viewers get no drag affordance.
  it('is draggable for an editor and not for a viewer', () => {
    const { container: editorContainer } = renderWithTooltips(SpaceAlbumCard, {
      spaceId: 's-1',
      album,
      canManage: true,
    });
    expect(editorContainer.querySelector('[data-testid="space-album-card"]')).toHaveAttribute('draggable', 'true');

    const { container: viewerContainer } = renderWithTooltips(SpaceAlbumCard, {
      spaceId: 's-1',
      album,
      canManage: false,
    });
    expect(viewerContainer.querySelector('[data-testid="space-album-card"]')).toHaveAttribute('draggable', 'false');
  });

  it('dragstart writes the album payload onto the DataTransfer and the active-drag slot', async () => {
    const { container } = renderWithTooltips(SpaceAlbumCard, {
      spaceId: 's-1',
      album: { ...album, id: 'a-9' },
      canManage: true,
    });
    const card = container.querySelector('[data-testid="space-album-card"]')!;
    const store = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => store.set(type, value),
      getData: (type: string) => store.get(type) ?? '',
      types: [...store.keys()],
    } as unknown as DataTransfer;

    expect(getActiveDragPayload()).toBeNull();

    await fireEvent.dragStart(card, { dataTransfer });

    expect(readDragPayload(dataTransfer)).toEqual({ kind: 'album', ids: ['a-9'] });
    expect(getActiveDragPayload()).toEqual({ kind: 'album', ids: ['a-9'] });

    await fireEvent.dragEnd(card);

    expect(getActiveDragPayload()).toBeNull();
  });

  // S-22/S-23: buildDragPayload is unit-tested on its own in space-album-folder-dnd.spec.ts; this
  // proves the card actually WIRES its selectedIds/selectedKind props into that call, rather than
  // the pure function merely existing unused.
  it('dragging a card that is part of the current selection carries the whole selection', async () => {
    const { container } = renderWithTooltips(SpaceAlbumCard, {
      spaceId: 's-1',
      album: { ...album, id: 'b' },
      canManage: true,
      selectedIds: ['a', 'b', 'c'],
      selectedKind: 'album',
    });
    const card = container.querySelector('[data-testid="space-album-card"]')!;
    const store = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => store.set(type, value),
      getData: (type: string) => store.get(type) ?? '',
      types: [] as string[],
    } as unknown as DataTransfer;

    await fireEvent.dragStart(card, { dataTransfer });

    const payload = readDragPayload(dataTransfer);
    expect(payload?.kind).toBe('album');
    expect(payload?.ids.slice().sort()).toEqual(['a', 'b', 'c']);
  });

  it('dragging a card NOT part of the current selection carries only itself', async () => {
    const { container } = renderWithTooltips(SpaceAlbumCard, {
      spaceId: 's-1',
      album: { ...album, id: 'd' },
      canManage: true,
      selectedIds: ['a', 'b'],
      selectedKind: 'album',
    });
    const card = container.querySelector('[data-testid="space-album-card"]')!;
    const store = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => store.set(type, value),
      getData: (type: string) => store.get(type) ?? '',
      types: [] as string[],
    } as unknown as DataTransfer;

    await fireEvent.dragStart(card, { dataTransfer });

    expect(readDragPayload(dataTransfer)).toEqual({ kind: 'album', ids: ['d'] });
  });

  // draggable="false" on the outer div does not stop the inner <a>/cover image from being
  // natively draggable in a real browser (dragstart bubbles up regardless), so the handler
  // itself has to gate on canManage rather than relying solely on the draggable attribute.
  it('dragstart writes nothing when canManage is false, even if a dragstart is fired', async () => {
    const { container } = renderWithTooltips(SpaceAlbumCard, {
      spaceId: 's-1',
      album: { ...album, id: 'a-9' },
      canManage: false,
    });
    const card = container.querySelector('[data-testid="space-album-card"]')!;
    const dataTransfer = {
      setData: vi.fn(),
      getData: () => '',
      types: [] as string[],
    } as unknown as DataTransfer;

    await fireEvent.dragStart(card, { dataTransfer });

    expect(dataTransfer.setData).not.toHaveBeenCalled();
    expect(getActiveDragPayload()).toBeNull();
  });

  describe('multi-select', () => {
    it('renders a check circle when canManage is true', () => {
      renderWithTooltips(SpaceAlbumCard, { spaceId: 's-1', album, canManage: true });
      expect(screen.getByTestId(`space-album-select-${album.id}`)).toBeInTheDocument();
    });

    it('renders no check circle when canManage is false', () => {
      renderWithTooltips(SpaceAlbumCard, { spaceId: 's-1', album, canManage: false });
      expect(screen.queryByTestId(`space-album-select-${album.id}`)).not.toBeInTheDocument();
    });

    it('clicking the check circle calls onToggleSelect with the shift key state and never onOpen', async () => {
      const onToggleSelect = vi.fn();
      const onOpen = vi.fn();
      renderWithTooltips(SpaceAlbumCard, { spaceId: 's-1', album, canManage: true, onToggleSelect, onOpen });

      await fireEvent.click(screen.getByTestId(`space-album-select-${album.id}`), { shiftKey: true });

      expect(onToggleSelect).toHaveBeenCalledWith(true);
      expect(onOpen).not.toHaveBeenCalled();
    });

    it('clicking the card body calls onOpen with the album and the shift key state', async () => {
      const onOpen = vi.fn();
      const onToggleSelect = vi.fn();
      renderWithTooltips(SpaceAlbumCard, { spaceId: 's-1', album, canManage: true, onOpen, onToggleSelect });

      await fireEvent.click(screen.getByTestId(`space-album-card-${album.id}`), { shiftKey: true });

      expect(onOpen).toHaveBeenCalledWith(album, true);
      expect(onToggleSelect).not.toHaveBeenCalled();
    });

    // Regression guard for the stopPropagation fix on the kebab menu wrapper: without it, a click
    // on a menu option would ALSO bubble into the card-body click handler and fire onOpen.
    it('clicking a kebab menu option does not also fire onOpen', async () => {
      const onOpen = vi.fn();
      renderWithTooltips(SpaceAlbumCard, {
        spaceId: 's-1',
        album,
        canManage: true,
        onOpen,
        onUnlink: vi.fn(),
        onToggleTimeline: vi.fn(),
        onMove: vi.fn(),
      });

      await fireEvent.click(screen.getByText('Move to folder…'));

      expect(onOpen).not.toHaveBeenCalled();
    });
  });

  // This file registers a real 'en-US' locale in beforeAll above (unlike most spec files in this
  // repo), so $t() renders actual translated text here rather than raw message keys — assertions
  // below match the real strings, consistent with the rest of this file (e.g. 'Move to folder…').
  describe('capability-gated menu', () => {
    // Scenario 26 — the positive case the negatives below depend on.
    it('shows Rename and Delete to an editor who owns the album', () => {
      renderWithTooltips(SpaceAlbumCard, {
        spaceId: 's-1',
        album,
        canManage: true,
        canRename: true,
        canDelete: true,
        onUnlink: vi.fn(),
        onToggleTimeline: vi.fn(),
        onMove: vi.fn(),
        onRename: vi.fn(),
        onDelete: vi.fn(),
      });

      expect(screen.getByText('Rename album')).toBeInTheDocument();
      expect(screen.getByText('Delete album')).toBeInTheDocument();
      expect(screen.getByText('Unlink album')).toBeInTheDocument();
    });

    // Scenario 27
    it('shows Rename but not Delete to an editor who does not own the album', () => {
      renderWithTooltips(SpaceAlbumCard, {
        spaceId: 's-1',
        album,
        canManage: true,
        canRename: true,
        canDelete: false,
        onUnlink: vi.fn(),
        onToggleTimeline: vi.fn(),
        onMove: vi.fn(),
        onRename: vi.fn(),
      });

      expect(screen.getByText('Rename album')).toBeInTheDocument();
      expect(screen.queryByText('Delete album')).not.toBeInTheDocument();
    });

    // Scenario 28
    it('shows only Rename and Delete to a viewer who owns the album', () => {
      renderWithTooltips(SpaceAlbumCard, {
        spaceId: 's-1',
        album,
        canManage: false,
        canRename: true,
        canDelete: true,
        onRename: vi.fn(),
        onDelete: vi.fn(),
      });

      expect(screen.getByText('Rename album')).toBeInTheDocument();
      expect(screen.getByText('Delete album')).toBeInTheDocument();
      expect(screen.queryByText('Unlink album')).not.toBeInTheDocument();
      expect(screen.queryByText('Move to folder…')).not.toBeInTheDocument();
    });

    // Scenario 29
    it('renders no menu at all for a viewer who does not own the album', () => {
      renderWithTooltips(SpaceAlbumCard, {
        spaceId: 's-1',
        album,
        canManage: false,
        canRename: false,
        canDelete: false,
      });

      expect(screen.queryByTestId('space-album-card-menu')).not.toBeInTheDocument();
    });

    // Scenario 30 — ownership grants rename and delete, never re-organisation.
    it('does not make the card draggable for a viewer who owns the album', () => {
      renderWithTooltips(SpaceAlbumCard, {
        spaceId: 's-1',
        album,
        canManage: false,
        canRename: true,
        canDelete: true,
      });

      expect(screen.getByTestId('space-album-card')).toHaveAttribute('draggable', 'false');
    });
  });
});
