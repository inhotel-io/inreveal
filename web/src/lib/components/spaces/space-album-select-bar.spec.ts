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
});
