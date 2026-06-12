import { screen } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import { renderWithTooltips } from '$tests/helpers';
import SpaceAlbumCard from './space-album-card.svelte';

describe('SpaceAlbumCard', () => {
  beforeAll(async () => {
    register('en-US', () => import('$i18n/en.json'));
    await init({ fallbackLocale: 'en-US', initialLocale: 'en-US' });
    await waitLocale('en-US');
  });

  const album = {
    albumId: 'a-1',
    albumName: 'Trip',
    assetCount: 12,
    albumThumbnailAssetId: null,
    showInTimeline: true,
    addedById: null,
    createdAt: '2026-01-01T00:00:00Z',
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
});
