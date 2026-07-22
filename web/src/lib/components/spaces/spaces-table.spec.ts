import { SharedSpaceRole, UserAvatarColor, type SharedSpaceResponseDto } from '@immich/sdk';
import userEvent from '@testing-library/user-event';
import SpacesTable from '$lib/components/spaces/spaces-table.svelte';
import { renderWithTooltips } from '$tests/helpers';

const renderTable = (props: Record<string, unknown>) => renderWithTooltips(SpacesTable as never, props);

vi.mock('$lib/route', () => ({
  Route: {
    viewSpace: ({ id }: { id: string }) => `/spaces/${id}`,
  },
}));

const makeSpace = (overrides: Partial<SharedSpaceResponseDto> = {}): SharedSpaceResponseDto => ({
  id: 'space-1',
  name: 'Alpha',
  description: null,
  createdById: 'user-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  thumbnailAssetId: null,
  lastActivityAt: null,
  assetCount: 0,
  memberCount: 1,
  recentAssetIds: [],
  recentAssetThumbhashes: [],
  members: [],
  ...overrides,
});

const currentUserId = 'user-1';

describe('SpacesTable', () => {
  it('renders space name', () => {
    const spaces = [makeSpace({ name: 'My Space' })];
    const { getByText } = renderTable({ spaces, currentUserId: 'user-1' });
    expect(getByText('My Space')).toBeDefined();
  });

  it('renders asset count as a number', () => {
    const spaces = [makeSpace({ assetCount: 42 })];
    const { getByText } = renderTable({ spaces, currentUserId: 'user-1' });
    expect(getByText('42')).toBeDefined();
  });

  it('renders member count as a number', () => {
    const spaces = [makeSpace({ memberCount: 5 })];
    const { getByText } = renderTable({ spaces, currentUserId: 'user-1' });
    expect(getByText('5')).toBeDefined();
  });

  it('renders new-badge when newAssetCount > 0', () => {
    const spaces = [makeSpace({ id: 'sp1', newAssetCount: 3 })];
    const { getByTestId } = renderTable({ spaces, currentUserId: 'user-1' });
    expect(getByTestId('new-badge-sp1')).toBeDefined();
  });

  it('renders em-dash in new-cell when newAssetCount === 0', () => {
    const spaces = [makeSpace({ id: 'sp2', newAssetCount: 0 })];
    const { getByTestId } = renderTable({ spaces, currentUserId: 'user-1' });
    const cell = getByTestId('new-cell-sp2');
    expect(cell.textContent).toContain('—');
  });

  it('renders em-dash in new-cell when newAssetCount is undefined', () => {
    const spaces = [makeSpace({ id: 'sp3', newAssetCount: undefined })];
    const { getByTestId } = renderTable({ spaces, currentUserId: 'user-1' });
    const cell = getByTestId('new-cell-sp3');
    expect(cell.textContent).toContain('—');
  });

  it('renders role badge for the current user (owner)', () => {
    const spaces = [
      makeSpace({
        id: 'sp4',
        members: [
          {
            userId: 'user-1',
            name: 'Alice',
            email: 'alice@example.com',
            role: SharedSpaceRole.Owner,
            showInTimeline: true,
            sharePersonMetadata: true,
            joinedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    ];
    const { getByTestId } = renderTable({ spaces, currentUserId: 'user-1' });
    expect(getByTestId('role-badge-owner')).toBeDefined();
  });

  it('renders color-bar for each space', () => {
    const spaces = [makeSpace({ id: 'sp5' })];
    const { getByTestId } = renderTable({ spaces, currentUserId: 'user-1' });
    expect(getByTestId('color-bar-sp5')).toBeDefined();
  });

  it('paints color-bar, new-badge and collage gradient from the space color', () => {
    const spaces = [makeSpace({ id: 'sp-pink', color: UserAvatarColor.Pink, newAssetCount: 4 })];
    const { getByTestId } = renderTable({ spaces, currentUserId: 'user-1' });
    expect(getByTestId('color-bar-sp-pink').className).toContain('bg-pink-400');
    expect(getByTestId('new-badge-sp-pink').className).toContain('bg-pink-400 text-white');
    expect(getByTestId('collage-empty').className).toContain('from-pink-300 to-pink-500');
  });

  it('falls back to the primary color when the space has no color', () => {
    const spaces = [makeSpace({ id: 'sp-none', color: undefined, newAssetCount: 1 })];
    const { getByTestId } = renderTable({ spaces, currentUserId: 'user-1' });
    expect(getByTestId('color-bar-sp-none').className).toContain('bg-immich-primary');
    expect(getByTestId('new-badge-sp-none').className).toContain('bg-immich-primary text-white');
    expect(getByTestId('collage-empty').className).toContain('from-immich-primary/60 to-immich-primary');
  });

  it('renders correct number of rows for multiple spaces', () => {
    const spaces = [
      makeSpace({ id: 's1', name: 'A' }),
      makeSpace({ id: 's2', name: 'B' }),
      makeSpace({ id: 's3', name: 'C' }),
    ];
    const { getAllByTestId } = renderTable({ spaces, currentUserId: 'user-1' });
    expect(getAllByTestId('space-row')).toHaveLength(3);
  });

  it('should show pin icon in name cell when pinned', () => {
    const space = makeSpace({ id: 'pinned-1' });
    const { getByTestId } = renderTable({
      spaces: [space],
      currentUserId,
      pinnedIds: ['pinned-1'],
      onTogglePin: vi.fn(),
    });
    expect(getByTestId('pin-icon-pinned-1')).toBeDefined();
  });

  it('should not show pin icon when not pinned', () => {
    const space = makeSpace({ id: 'unpinned-1' });
    const { queryByTestId } = renderTable({ spaces: [space], currentUserId, pinnedIds: [], onTogglePin: vi.fn() });
    expect(queryByTestId('pin-icon-unpinned-1')).toBeNull();
  });

  it('should show three-dot menu button on row hover', async () => {
    const user = userEvent.setup();
    const space = makeSpace({ id: 'hover-1' });
    const { getByTestId, queryByTestId } = renderTable({
      spaces: [space],
      currentUserId,
      pinnedIds: [],
      onTogglePin: vi.fn(),
    });
    expect(queryByTestId('row-menu-button-hover-1')).toBeNull();
    await user.hover(getByTestId('space-row'));
    expect(getByTestId('row-menu-button-hover-1')).toBeDefined();
  });

  it('should call onTogglePin when Pin to top clicked in row menu', async () => {
    const user = userEvent.setup();
    const onTogglePin = vi.fn();
    const space = makeSpace({ id: 'pin-1' });
    const { getByTestId, getByRole, getByText } = renderTable({
      spaces: [space],
      currentUserId,
      pinnedIds: [],
      onTogglePin,
    });
    await user.hover(getByTestId('space-row'));
    await user.click(getByRole('button', { name: 'more' }));
    await user.click(getByText('spaces_pin_to_top'));
    expect(onTogglePin).toHaveBeenCalledWith('pin-1');
  });
});
