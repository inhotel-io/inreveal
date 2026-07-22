import { screen, fireEvent } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { init, register, waitLocale } from 'svelte-i18n';
import { get } from 'svelte/store';
import SpaceAlbumsControls from '$lib/components/spaces/space-albums-controls.svelte';
import SpaceAlbumsControlsWrapper from '$lib/components/spaces/space-albums-controls.test-wrapper.svelte';
import { AlbumSortBy, AlbumViewMode, SortOrder, albumViewSettings } from '$lib/stores/preferences.store';
import { SpaceAlbumGroupBy, spaceAlbumViewSettings } from '$lib/stores/space-album-view-settings.store';
import { renderWithTooltips } from '$tests/helpers';

// The persisted store's reset() re-uses its initial object by reference, and in-place field
// writes (groupBy/collapsedGroups) can leak across tests. Set a fresh object each time.
const freshSpaceSettings = () => ({
  view: AlbumViewMode.Cover,
  sortBy: AlbumSortBy.MostRecentPhoto,
  sortOrder: SortOrder.Desc,
  groupBy: SpaceAlbumGroupBy.None,
  groupOrder: SortOrder.Desc,
  collapsedGroups: {},
});

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
  spaceAlbumViewSettings.set(freshSpaceSettings());
  albumViewSettings.reset();
});

describe('SpaceAlbumsControls search input', () => {
  it('renders a search input with data-testid="space-albums-search"', () => {
    renderWithTooltips(SpaceAlbumsControls, {});
    expect(screen.getByTestId('space-albums-search')).toBeInTheDocument();
  });

  it('reflects the passed searchQuery prop value', () => {
    renderWithTooltips(SpaceAlbumsControls, { searchQuery: 'hello' });
    const input = screen.getByTestId('space-albums-search') as HTMLInputElement;
    expect(input.value).toBe('hello');
  });

  it('propagates typed text upward through bind:searchQuery to the parent state', async () => {
    // Render via a wrapper that holds its own $state and passes bind:searchQuery.
    // The wrapper renders a <span data-testid="wrapper-search-query"> with the current state value.
    // If bind:value={searchQuery} were removed from the input, the span would stay empty
    // while the input shows the typed text — proving this test catches missing binding.
    renderWithTooltips(SpaceAlbumsControlsWrapper, {});
    const input = screen.getByTestId('space-albums-search') as HTMLInputElement;
    const wrapperState = screen.getByTestId('wrapper-search-query');

    await userEvent.type(input, 'beach');

    expect(wrapperState).toHaveTextContent('beach');
  });
});

// The sort/group menus are `$lib/elements/Dropdown.svelte`: the trigger is a button labelled with
// the current selection, and the options are buttons labelled with their own name.
const openMenu = (currentLabel: string) => userEvent.click(screen.getAllByRole('button', { name: currentLabel })[0]);
const pickOption = (label: string) => userEvent.click(screen.getAllByRole('button', { name: label }).at(-1)!);

describe('SpaceAlbumsControls sort dropdown', () => {
  it('renders a sort dropdown trigger button labelled with the current sort', () => {
    renderWithTooltips(SpaceAlbumsControls, {});
    expect(screen.getByRole('button', { name: 'Most recent photo' })).toBeInTheDocument();
  });

  it('renders all six sort option labels when dropdown is opened', async () => {
    renderWithTooltips(SpaceAlbumsControls, {});
    await openMenu('Most recent photo');
    expect(screen.getByRole('button', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Number of items' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Date modified' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Date created' })).toBeInTheDocument();
    // Trigger + option both carry the selected label.
    expect(screen.getAllByRole('button', { name: 'Most recent photo' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Oldest photo' })).toBeInTheDocument();
  });

  it('writes AlbumSortBy.Title to the space store when "Title" is selected', async () => {
    renderWithTooltips(SpaceAlbumsControls, {});
    await openMenu('Most recent photo');
    await pickOption('Title');
    expect(get(spaceAlbumViewSettings).sortBy).toBe(AlbumSortBy.Title);
  });

  it('never writes to the global albumViewSettings (isolation)', async () => {
    const before = get(albumViewSettings);
    renderWithTooltips(SpaceAlbumsControls, {});
    await openMenu('Most recent photo');
    await pickOption('Title');
    expect(get(albumViewSettings)).toEqual(before);
  });

  it('toggles sort order when the same sort option is re-selected', async () => {
    // Pre-set sortBy to Title; defaultOrder for Title is Asc
    spaceAlbumViewSettings.update((s) => ({ ...s, sortBy: AlbumSortBy.Title, sortOrder: SortOrder.Asc }));
    renderWithTooltips(SpaceAlbumsControls, {});
    await openMenu('Title');
    await pickOption('Title');
    expect(get(spaceAlbumViewSettings).sortOrder).toBe(SortOrder.Desc);
  });
});

describe('SpaceAlbumsControls group dropdown', () => {
  it('renders a group dropdown trigger button labelled with the current grouping', () => {
    renderWithTooltips(SpaceAlbumsControls, {});
    expect(screen.getByRole('button', { name: 'No grouping' })).toBeInTheDocument();
  });

  it('lists None / Year / Linked by / Owner when the dropdown is opened', async () => {
    renderWithTooltips(SpaceAlbumsControls, {});
    await openMenu('No grouping');
    // Trigger + option both carry the selected label.
    expect(screen.getAllByRole('button', { name: 'No grouping' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Group by year' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Group by who linked' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Group by owner' })).toBeInTheDocument();
  });

  it('writes the selected groupBy to the space store', async () => {
    renderWithTooltips(SpaceAlbumsControls, {});
    await openMenu('No grouping');
    await pickOption('Group by year');
    expect(get(spaceAlbumViewSettings).groupBy).toBe(SpaceAlbumGroupBy.Year);
  });

  it('never writes to the global albumViewSettings (isolation)', async () => {
    const before = get(albumViewSettings);
    renderWithTooltips(SpaceAlbumsControls, {});
    await openMenu('No grouping');
    await pickOption('Group by owner');
    expect(get(albumViewSettings)).toEqual(before);
  });

  it('disables the Year option when sortBy is DateCreated', async () => {
    spaceAlbumViewSettings.update((s) => ({ ...s, sortBy: AlbumSortBy.DateCreated }));
    renderWithTooltips(SpaceAlbumsControls, {});
    await openMenu('No grouping');
    expect(screen.getByRole('button', { name: 'Group by year' })).toBeDisabled();
  });

  it('hides expand/collapse-all buttons when groupBy is None', () => {
    renderWithTooltips(SpaceAlbumsControls, {});
    expect(screen.queryByTestId('space-albums-expand-all')).not.toBeInTheDocument();
    expect(screen.queryByTestId('space-albums-collapse-all')).not.toBeInTheDocument();
  });

  it('shows expand/collapse-all buttons when a group is selected', () => {
    spaceAlbumViewSettings.update((s) => ({ ...s, groupBy: SpaceAlbumGroupBy.Year }));
    renderWithTooltips(SpaceAlbumsControls, { groupIds: ['2024', '2020'] });
    expect(screen.getByTestId('space-albums-expand-all')).toBeInTheDocument();
    expect(screen.getByTestId('space-albums-collapse-all')).toBeInTheDocument();
  });

  it('collapse-all collapses the provided group ids in the space store', async () => {
    spaceAlbumViewSettings.update((s) => ({ ...s, groupBy: SpaceAlbumGroupBy.Year }));
    renderWithTooltips(SpaceAlbumsControls, { groupIds: ['2024', '2020'] });
    await userEvent.click(screen.getByTestId('space-albums-collapse-all'));
    expect(get(spaceAlbumViewSettings).collapsedGroups.Year.sort()).toEqual(['2020', '2024']);
  });

  it('expand-all clears the collapsed groups in the space store', async () => {
    spaceAlbumViewSettings.update((s) => ({
      ...s,
      groupBy: SpaceAlbumGroupBy.Year,
      collapsedGroups: { Year: ['2024', '2020'] },
    }));
    renderWithTooltips(SpaceAlbumsControls, { groupIds: ['2024', '2020'] });
    await userEvent.click(screen.getByTestId('space-albums-expand-all'));
    expect(get(spaceAlbumViewSettings).collapsedGroups.Year).toEqual([]);
  });
});

describe('SpaceAlbumsControls create + link buttons', () => {
  it('shows Create + Link for editors and invokes the callbacks', async () => {
    const onCreate = vi.fn();
    const onLink = vi.fn();
    renderWithTooltips(SpaceAlbumsControls, { canManage: true, onCreate, onLink });
    await fireEvent.click(screen.getByTestId('create-album-button'));
    await fireEvent.click(screen.getByTestId('link-album-button'));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onLink).toHaveBeenCalledOnce();
  });

  it('hides Create + Link for viewers but keeps search/sort/group/view', () => {
    renderWithTooltips(SpaceAlbumsControls, { canManage: false });
    expect(screen.queryByTestId('create-album-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('link-album-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('space-albums-search')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Most recent photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No grouping' })).toBeInTheDocument();
    expect(screen.getByTestId('space-albums-view-toggle')).toBeInTheDocument();
  });
});
