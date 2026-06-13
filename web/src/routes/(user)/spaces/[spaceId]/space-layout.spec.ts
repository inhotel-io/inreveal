import type { SharedSpaceMemberResponseDto, SharedSpaceResponseDto } from '@immich/sdk';
import { SharedSpaceRole } from '@immich/sdk';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SpaceLayout from './+layout.svelte';

const { mockPage, mockAuthManager, gotoMock } = vi.hoisted(() => ({
  mockPage: { url: new URL('https://gallery.test/spaces/s1'), route: { id: '/(user)/spaces/[spaceId]' } },
  mockAuthManager: { user: { id: 'u1', isAdmin: false } },
  gotoMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('$app/state', () => ({ page: mockPage }));
vi.mock('$app/navigation', () => ({ goto: gotoMock, invalidateAll: vi.fn().mockResolvedValue(undefined) }));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mockAuthManager }));

// The real UserPageLayout mounts the NavigationBar (which needs a Tooltip provider); the shared
// mock renders the leading/buttons/children snippets inside a TooltipProvider — matching the other
// space page specs — so the app-bar testids are reachable.
vi.mock('$lib/components/layouts/UserPageLayout.svelte', async () => {
  const { default: MockComponent } = await import('$lib/components/spaces/mock-user-page-layout.test-wrapper.svelte');
  return { default: MockComponent };
});

const space = (o: Partial<SharedSpaceResponseDto> = {}): SharedSpaceResponseDto =>
  ({ id: 's1', name: 'Trip', assetCount: 35, memberCount: 1, faceRecognitionEnabled: false, ...o }) as never;
const member = (o: Partial<SharedSpaceMemberResponseDto> = {}): SharedSpaceMemberResponseDto =>
  ({ userId: 'u1', role: SharedSpaceRole.Owner, name: 'Me', email: 'me@x.io', ...o }) as never;

function renderLayout(role: SharedSpaceRole, isAdmin = false) {
  mockAuthManager.user = { id: 'u1', isAdmin };
  // `children` is optional; the layout renders `{@render children?.()}`, so omitting it is fine.
  return render(SpaceLayout, {
    data: { space: space(), members: [member({ role })], linkedAlbums: [] } as never,
  });
}

describe('space [spaceId] +layout.svelte', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPage.url = new URL('https://gallery.test/spaces/s1');
  });

  it('shows ＋ Add photos and the overflow for an editor', () => {
    renderLayout(SharedSpaceRole.Editor);
    expect(screen.getByTestId('space-add-photos')).toBeInTheDocument();
    expect(screen.getByTestId('space-overflow')).toBeInTheDocument();
  });

  it('hides ＋ Add photos for a viewer', () => {
    renderLayout(SharedSpaceRole.Viewer);
    expect(screen.queryByTestId('space-add-photos')).not.toBeInTheDocument();
  });

  it('records an add-photos intent and navigates to the Photos route when ＋ is clicked', async () => {
    const { spaceUiManager } = await import('$lib/managers/space-ui-manager.svelte');
    spaceUiManager.reset();
    mockPage.url = new URL('https://gallery.test/spaces/s1/members');
    renderLayout(SharedSpaceRole.Editor);
    screen.getByTestId('space-add-photos').click();
    expect(spaceUiManager.intent).toBe('add-assets');
    expect(gotoMock).toHaveBeenCalledWith('/spaces/s1');
  });
});
