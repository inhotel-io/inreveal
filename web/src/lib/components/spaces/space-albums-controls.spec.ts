import { get } from 'svelte/store';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { init, register, waitLocale } from 'svelte-i18n';
import { AlbumSortBy, SortOrder, albumViewSettings } from '$lib/stores/preferences.store';
import { spaceAlbumViewSettings } from '$lib/stores/space-album-view-settings.store';
import SpaceAlbumsControls from '$lib/components/spaces/space-albums-controls.svelte';

vi.mock('@immich/ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('@immich/ui')>();
  return {
    ...original,
    toastManager: { primary: vi.fn(), success: vi.fn(), warning: vi.fn() },
  };
});

beforeAll(async () => {
  register('en-US', () => import('$i18n/en.json'));
  await init({ fallbackLocale: 'en-US', initialLocale: 'en-US' });
  await waitLocale('en-US');
});

beforeEach(() => {
  localStorage.clear();
  spaceAlbumViewSettings.reset();
  albumViewSettings.reset();
});

describe('SpaceAlbumsControls sort dropdown', () => {
  it('renders a sort dropdown trigger button', () => {
    render(SpaceAlbumsControls);
    expect(screen.getByTestId('space-albums-sort-btn')).toBeInTheDocument();
  });

  it('renders all six sort option labels when dropdown is opened', async () => {
    render(SpaceAlbumsControls);
    await userEvent.click(screen.getByTestId('space-albums-sort-btn'));
    const menu = screen.getByTestId('space-albums-sort-menu');
    expect(within(menu).getByText('Title')).toBeInTheDocument();
    expect(within(menu).getByText('Number of items')).toBeInTheDocument();
    expect(within(menu).getByText('Date modified')).toBeInTheDocument();
    expect(within(menu).getByText('Date created')).toBeInTheDocument();
    expect(within(menu).getByText('Most recent photo')).toBeInTheDocument();
    expect(within(menu).getByText('Oldest photo')).toBeInTheDocument();
  });

  it('writes AlbumSortBy.Title to the space store when "Title" is selected', async () => {
    render(SpaceAlbumsControls);
    await userEvent.click(screen.getByTestId('space-albums-sort-btn'));
    await userEvent.click(screen.getByTestId('space-albums-sort-option-Title'));
    expect(get(spaceAlbumViewSettings).sortBy).toBe(AlbumSortBy.Title);
  });

  it('never writes to the global albumViewSettings (isolation)', async () => {
    const before = get(albumViewSettings);
    render(SpaceAlbumsControls);
    await userEvent.click(screen.getByTestId('space-albums-sort-btn'));
    await userEvent.click(screen.getByTestId('space-albums-sort-option-Title'));
    expect(get(albumViewSettings)).toEqual(before);
  });

  it('toggles sort order when the same sort option is re-selected', async () => {
    // Pre-set sortBy to Title; defaultOrder for Title is Asc
    spaceAlbumViewSettings.update((s) => ({ ...s, sortBy: AlbumSortBy.Title, sortOrder: SortOrder.Asc }));
    render(SpaceAlbumsControls);
    await userEvent.click(screen.getByTestId('space-albums-sort-btn'));
    await userEvent.click(screen.getByTestId('space-albums-sort-option-Title'));
    expect(get(spaceAlbumViewSettings).sortOrder).toBe(SortOrder.Desc);
  });
});
