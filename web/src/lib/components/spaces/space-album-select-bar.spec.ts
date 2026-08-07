import { fireEvent, screen } from '@testing-library/svelte';
import { renderWithTooltips } from '$tests/helpers';
import SpaceAlbumSelectBar from './space-album-select-bar.svelte';

// $t() returns RAW KEYS in this file (no real i18n locale registered) — assert on keys.
describe('SpaceAlbumSelectBar', () => {
  it('renders the selected count', () => {
    renderWithTooltips(SpaceAlbumSelectBar, { kind: 'album', count: 3, onClear: vi.fn() });
    expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('space_album_selected_count');
  });

  it('calling onClear when the close button is clicked', async () => {
    const onClear = vi.fn();
    renderWithTooltips(SpaceAlbumSelectBar, { kind: 'album', count: 1, onClear });
    await fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('album kind: offers unlink, move and add-to-timeline when nothing is in the timeline yet', () => {
    renderWithTooltips(SpaceAlbumSelectBar, { kind: 'album', count: 2, allInTimeline: false, onClear: vi.fn() });
    expect(screen.getByRole('button', { name: 'space_album_unlink_from_space' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'space_album_folder_move' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'space_album_bulk_add_to_timeline' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'space_album_bulk_remove_from_timeline' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'space_album_folder_delete' })).not.toBeInTheDocument();
  });

  it('album kind: the timeline button reads remove-from-timeline once everything is already in it', () => {
    renderWithTooltips(SpaceAlbumSelectBar, { kind: 'album', count: 2, allInTimeline: true, onClear: vi.fn() });
    expect(screen.getByRole('button', { name: 'space_album_bulk_remove_from_timeline' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'space_album_bulk_add_to_timeline' })).not.toBeInTheDocument();
  });

  it('album kind: onToggleTimeline is called with the target (opposite of allInTimeline) value', async () => {
    const onToggleTimeline = vi.fn();
    renderWithTooltips(SpaceAlbumSelectBar, {
      kind: 'album',
      count: 2,
      allInTimeline: false,
      onClear: vi.fn(),
      onToggleTimeline,
    });
    await fireEvent.click(screen.getByRole('button', { name: 'space_album_bulk_add_to_timeline' }));
    expect(onToggleTimeline).toHaveBeenCalledWith(true);
  });

  it('folder kind: offers move and delete only', () => {
    renderWithTooltips(SpaceAlbumSelectBar, { kind: 'folder', count: 1, onClear: vi.fn() });
    expect(screen.getByRole('button', { name: 'space_album_folder_move' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'space_album_folder_delete' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'space_album_unlink_from_space' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /timeline/ })).not.toBeInTheDocument();
  });

  it('folder kind: clicking delete calls onDelete', async () => {
    const onDelete = vi.fn();
    renderWithTooltips(SpaceAlbumSelectBar, { kind: 'folder', count: 1, onClear: vi.fn(), onDelete });
    await fireEvent.click(screen.getByRole('button', { name: 'space_album_folder_delete' }));
    expect(onDelete).toHaveBeenCalled();
  });

  it('clicking move calls onMove for both kinds', async () => {
    const onMove = vi.fn();
    renderWithTooltips(SpaceAlbumSelectBar, { kind: 'folder', count: 1, onClear: vi.fn(), onMove });
    await fireEvent.click(screen.getByRole('button', { name: 'space_album_folder_move' }));
    expect(onMove).toHaveBeenCalled();
  });

  it('clicking unlink calls onUnlink', async () => {
    const onUnlink = vi.fn();
    renderWithTooltips(SpaceAlbumSelectBar, { kind: 'album', count: 1, onClear: vi.fn(), onUnlink });
    await fireEvent.click(screen.getByRole('button', { name: 'space_album_unlink_from_space' }));
    expect(onUnlink).toHaveBeenCalled();
  });

  // Scenario 31
  it('shows Delete for an album selection when canDelete', () => {
    renderWithTooltips(SpaceAlbumSelectBar, { kind: 'album', count: 2, canDelete: true, onClear: vi.fn() });
    expect(screen.getByRole('button', { name: 'space_album_delete' })).toBeInTheDocument();
  });

  it('hides Delete for an album selection when not canDelete', () => {
    renderWithTooltips(SpaceAlbumSelectBar, { kind: 'album', count: 2, canDelete: false, onClear: vi.fn() });
    expect(screen.queryByRole('button', { name: 'space_album_delete' })).not.toBeInTheDocument();
  });

  // Scenario 32 — the viewer's bar.
  it('shows Delete alone when canManage is false', () => {
    renderWithTooltips(SpaceAlbumSelectBar, {
      kind: 'album',
      count: 1,
      canManage: false,
      canDelete: true,
      onClear: vi.fn(),
    });
    expect(screen.getByRole('button', { name: 'space_album_delete' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'space_album_unlink_from_space' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'space_album_folder_move' })).not.toBeInTheDocument();
  });

  // Scenario 33
  it('does not render the album Delete for a folder selection', () => {
    renderWithTooltips(SpaceAlbumSelectBar, { kind: 'folder', count: 1, canDelete: true, onClear: vi.fn() });
    expect(screen.queryByRole('button', { name: 'space_album_delete' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'space_album_folder_delete' })).toBeInTheDocument();
  });

  // Scenario 34. NOTE: deliberately asserts on `onDeleteAlbums`, not `onDelete` — the album
  // branch's Delete button must never share a prop with the folder branch's `onDelete` (see the
  // "separate prop" rationale in the implementation section below), so this exercises the actual
  // wiring rather than an inert prop of the same name that happens to also be undefined.
  it('fires onDeleteAlbums exactly once', async () => {
    const onDeleteAlbums = vi.fn();
    renderWithTooltips(SpaceAlbumSelectBar, {
      kind: 'album',
      count: 2,
      canDelete: true,
      onDeleteAlbums,
      onClear: vi.fn(),
    });
    await fireEvent.click(screen.getByRole('button', { name: 'space_album_delete' }));
    expect(onDeleteAlbums).toHaveBeenCalledTimes(1);
  });

  // Scenario 35 — pins the canManage = true default, which the pre-existing specs in this file rely on.
  it('keeps the editor buttons when no capability props are passed at all', () => {
    renderWithTooltips(SpaceAlbumSelectBar, { kind: 'album', count: 3, onClear: vi.fn() });
    expect(screen.getByRole('button', { name: 'space_album_unlink_from_space' })).toBeInTheDocument();
  });
});
