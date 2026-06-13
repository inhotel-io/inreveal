import type { SharedSpaceMemberResponseDto, SharedSpaceResponseDto } from '@immich/sdk';
import { SharedSpaceRole } from '@immich/sdk';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import TestWrapper from '$lib/components/TestWrapper.svelte';
import MembersPage from './+page.svelte';

const { mockAuthManager } = vi.hoisted(() => ({ mockAuthManager: { user: { id: 'u1', isAdmin: false } } }));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mockAuthManager }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn().mockResolvedValue(undefined) }));

const space = (o: Partial<SharedSpaceResponseDto> = {}): SharedSpaceResponseDto =>
  ({ id: 's1', name: 'Trip', color: 'primary', ...o }) as never;
const member = (o: Partial<SharedSpaceMemberResponseDto> = {}): SharedSpaceMemberResponseDto =>
  ({ userId: 'u1', role: SharedSpaceRole.Owner, name: 'Me', email: 'me@x.io', contributionCount: 0, ...o }) as never;

function renderPage(role: SharedSpaceRole, members = [member({ role })]) {
  mockAuthManager.user = { id: 'u1', isAdmin: false };
  const props = { data: { space: space(), members, linkedAlbums: [], activities: [], hasMoreActivities: false } };
  return render(TestWrapper as Component<{ component: typeof MembersPage; componentProps: typeof props }>, {
    component: MembersPage,
    componentProps: props,
  });
}

describe('Members tab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists members', () => {
    renderPage(SharedSpaceRole.Owner, [member(), member({ userId: 'u2', role: SharedSpaceRole.Editor, name: 'Ann' })]);
    expect(screen.getByText('Me')).toBeInTheDocument();
    expect(screen.getByText('Ann')).toBeInTheDocument();
  });

  it('shows the invite button to an owner', () => {
    renderPage(SharedSpaceRole.Owner);
    expect(screen.getByTestId('members-invite')).toBeInTheDocument();
  });

  it('hides the invite button from a non-owner', () => {
    renderPage(SharedSpaceRole.Viewer);
    expect(screen.queryByTestId('members-invite')).not.toBeInTheDocument();
  });

  it('renders the activity section', () => {
    renderPage(SharedSpaceRole.Owner);
    expect(screen.getByTestId('members-activity')).toBeInTheDocument();
  });
});
