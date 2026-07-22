import type { SharedSpaceMemberResponseDto, SharedSpaceResponseDto } from '@immich/sdk';
import { SharedSpaceRole, UserAvatarColor } from '@immich/sdk';
import { screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { init, register, waitLocale } from 'svelte-i18n';
import SpaceCard from '$lib/components/spaces/space-card.svelte';
import { renderWithTooltips } from '$tests/helpers';

const makeMember = (overrides: Partial<SharedSpaceMemberResponseDto> = {}): SharedSpaceMemberResponseDto => ({
  userId: 'user-1',
  name: 'Alice',
  email: 'alice@test.com',
  role: SharedSpaceRole.Editor,
  joinedAt: '2026-01-01T00:00:00.000Z',
  showInTimeline: false,
  sharePersonMetadata: true,
  ...overrides,
});

const makeSpace = (overrides: Partial<SharedSpaceResponseDto> = {}): SharedSpaceResponseDto => ({
  id: 'space-1',
  name: 'Family Photos',
  description: 'Our family memories',
  createdById: 'user-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  memberCount: 3,
  assetCount: 42,
  thumbnailAssetId: null,
  recentAssetIds: [],
  recentAssetThumbhashes: [],
  lastActivityAt: null,
  newAssetCount: 0,
  members: [],
  ...overrides,
});

describe('SpaceCard component', () => {
  beforeAll(async () => {
    register('en-US', () => import('$i18n/en.json'));
    await init({ fallbackLocale: 'en-US' });
    await waitLocale('en-US');
  });

  it('should render space name', () => {
    renderWithTooltips(SpaceCard, { space: makeSpace() });
    expect(screen.getByTestId('space-name')).toHaveTextContent('Family Photos');
  });

  it('should render asset and member counts', () => {
    renderWithTooltips(SpaceCard, { space: makeSpace({ assetCount: 42, memberCount: 3 }) });
    const details = screen.getByTestId('space-details');
    expect(details).toHaveTextContent('42');
    expect(details).toHaveTextContent('3');
  });

  it('should paint the empty collage with the space color gradient', () => {
    renderWithTooltips(SpaceCard, { space: makeSpace({ color: UserAvatarColor.Green }) });
    expect(screen.getByTestId('collage-empty').className).toContain('from-green-400 to-green-700');
  });

  it('should fall back to the primary gradient when the space has no color', () => {
    renderWithTooltips(SpaceCard, { space: makeSpace({ color: undefined }) });
    expect(screen.getByTestId('collage-empty').className).toContain('from-immich-primary/60 to-immich-primary');
  });

  it('should render collage when recentAssetIds are provided', () => {
    renderWithTooltips(SpaceCard, {
      space: makeSpace({ recentAssetIds: ['a1', 'a2'], recentAssetThumbhashes: ['', ''] }),
    });
    expect(screen.getByTestId('collage-asymmetric')).toBeInTheDocument();
  });

  it('should render empty collage when no recentAssetIds', () => {
    renderWithTooltips(SpaceCard, { space: makeSpace({ recentAssetIds: [] }) });
    expect(screen.getByTestId('collage-empty')).toBeInTheDocument();
  });

  it('should render member avatars when members are provided', () => {
    const members = [makeMember({ userId: 'u1', name: 'Alice' }), makeMember({ userId: 'u2', name: 'Bob' })];
    renderWithTooltips(SpaceCard, { space: makeSpace({ members }) });
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('should show overflow badge when more than 4 members', () => {
    const members = [
      makeMember({ userId: 'u1', name: 'Alice' }),
      makeMember({ userId: 'u2', name: 'Bob' }),
      makeMember({ userId: 'u3', name: 'Carol' }),
      makeMember({ userId: 'u4', name: 'Dan' }),
      makeMember({ userId: 'u5', name: 'Eve' }),
      makeMember({ userId: 'u6', name: 'Frank' }),
    ];
    renderWithTooltips(SpaceCard, { space: makeSpace({ members }) });
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('should have link to space detail page', () => {
    renderWithTooltips(SpaceCard, { space: makeSpace({ id: 'space-42' }) });
    const link = screen.getByRole('link');
    expect(link).toBeInTheDocument();
    expect(link.getAttribute('href')).toContain('space-42');
  });

  it('should not render activity dot when newAssetCount is 0', () => {
    renderWithTooltips(SpaceCard, { space: makeSpace({ newAssetCount: 0 }) });
    expect(screen.queryByTestId('activity-dot')).not.toBeInTheDocument();
  });

  it('should render activity dot when newAssetCount > 0', () => {
    renderWithTooltips(SpaceCard, { space: makeSpace({ newAssetCount: 3 }) });
    expect(screen.getByTestId('activity-dot')).toBeInTheDocument();
  });

  it('should show contributor name with count', () => {
    renderWithTooltips(SpaceCard, {
      space: makeSpace({
        newAssetCount: 3,
        lastContributor: { id: 'user-1', name: 'Pierre' },
      }),
    });
    expect(screen.getByTestId('activity-line')).toHaveTextContent('Pierre added 3 new');
  });

  it('should show count only without contributor', () => {
    renderWithTooltips(SpaceCard, { space: makeSpace({ newAssetCount: 5 }) });
    expect(screen.getByTestId('activity-line')).toHaveTextContent('5 new photos');
  });

  it('should cap display at 99+', () => {
    renderWithTooltips(SpaceCard, { space: makeSpace({ newAssetCount: 150 }) });
    expect(screen.getByTestId('activity-line')).toHaveTextContent('99+ new photos');
  });

  describe('pin/unpin context menu', () => {
    it('should not show menu button initially', () => {
      renderWithTooltips(SpaceCard, { space: makeSpace() });
      expect(screen.queryByTestId('space-menu-button')).not.toBeInTheDocument();
    });

    it('should show menu button on hover', async () => {
      const user = userEvent.setup();
      renderWithTooltips(SpaceCard, { space: makeSpace() });
      const card = screen.getByTestId('space-card');
      await user.hover(card);
      expect(screen.getByTestId('space-menu-button')).toBeInTheDocument();
    });

    it('should show "Pin to top" when not pinned after hovering and clicking menu', async () => {
      const user = userEvent.setup();
      renderWithTooltips(SpaceCard, { space: makeSpace(), isPinned: false });
      const card = screen.getByTestId('space-card');
      await user.hover(card);
      await user.click(screen.getByRole('button', { name: 'More' }));
      expect(screen.getByText('Pin to top')).toBeInTheDocument();
    });

    it('should show "Unpin" when pinned after hovering and clicking menu', async () => {
      const user = userEvent.setup();
      renderWithTooltips(SpaceCard, { space: makeSpace(), isPinned: true });
      const card = screen.getByTestId('space-card');
      await user.hover(card);
      await user.click(screen.getByRole('button', { name: 'More' }));
      expect(screen.getByText('Unpin')).toBeInTheDocument();
    });

    it('should call onTogglePin with space id when clicking "Pin to top"', async () => {
      const onTogglePin = vi.fn();
      const user = userEvent.setup();
      renderWithTooltips(SpaceCard, { space: makeSpace({ id: 'space-42' }), isPinned: false, onTogglePin });
      const card = screen.getByTestId('space-card');
      await user.hover(card);
      await user.click(screen.getByRole('button', { name: 'More' }));
      await user.click(screen.getByText('Pin to top'));
      expect(onTogglePin).toHaveBeenCalledWith('space-42');
    });

    it('should show pin overlay when isPinned is true', () => {
      renderWithTooltips(SpaceCard, { space: makeSpace(), isPinned: true });
      expect(screen.getByTestId('pin-overlay')).toBeInTheDocument();
    });

    it('should not show pin overlay when isPinned is false', () => {
      renderWithTooltips(SpaceCard, { space: makeSpace(), isPinned: false });
      expect(screen.queryByTestId('pin-overlay')).not.toBeInTheDocument();
    });
  });
});
