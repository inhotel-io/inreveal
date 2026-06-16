// CollectionPickerModal.spec.ts — follows the house pattern (sdk.mock + Modal global stubs)
import '$lib/__mocks__/sdk.mock';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { getAnimateMock } from '$lib/__mocks__/animate.mock';
import { getIntersectionObserverMock } from '$lib/__mocks__/intersection-observer.mock';
import { getVisualViewportMock } from '$lib/__mocks__/visual-viewport.mock';
import { type AlbumResponseDto, type SharedSpaceResponseDto } from '@immich/sdk';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';

const { mockUser, mockHandleError } = vi.hoisted(() => ({
  mockUser: { current: { id: 'me', isAdmin: false } },
  mockHandleError: vi.fn(),
}));
vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: {
    get authenticated() {
      return mockUser.current !== null;
    },
    get user() {
      return mockUser.current;
    },
  },
}));
vi.mock('$lib/utils/handle-error', () => ({ handleError: mockHandleError }));

import CollectionPickerModal from './CollectionPickerModal.svelte';

const album = (id: string, name: string): AlbumResponseDto =>
  ({
    id,
    albumName: name,
    assetCount: 1,
    albumThumbnailAssetId: null,
    shared: false,
    updatedAt: '2024-01-01T00:00:00Z',
  }) as unknown as AlbumResponseDto;
const space = (id: string, name: string): SharedSpaceResponseDto =>
  ({
    id,
    name,
    createdById: 'me',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    members: [],
    memberCount: 1,
    assetCount: 1,
    recentAssetIds: [],
  }) as unknown as SharedSpaceResponseDto;
const withAlbum = () =>
  sdkMock.getAllAlbums.mockImplementation(({ shared }: { shared?: boolean }) =>
    Promise.resolve(shared ? [] : [album('a1', 'Trip')]),
  );

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', getIntersectionObserverMock());
  vi.stubGlobal('visualViewport', getVisualViewportMock());
  Element.prototype.animate = getAnimateMock();
  vi.resetAllMocks();
  mockUser.current = { id: 'me', isAdmin: false };
  sdkMock.getAllAlbums.mockResolvedValue([]); // both shared:false and shared:true resolve to []
  sdkMock.getAllSpaces.mockResolvedValue([]);
});

afterAll(async () => {
  await waitFor(() => expect(document.body.style.pointerEvents).not.toBe('none'));
});

describe('CollectionPickerModal', () => {
  it('renders album rows (with badge) and space rows after load', async () => {
    withAlbum();
    sdkMock.getAllSpaces.mockResolvedValue([space('s1', 'Family')]);
    render(CollectionPickerModal, { assetCount: 3, onClose: vi.fn() });
    await waitFor(() => expect(screen.getByTestId('row-album-a1')).toBeTruthy());
    expect(screen.getByTestId('row-space-s1')).toBeTruthy();
    expect(screen.queryByTestId('collection-row-badge')).not.toBeNull();
    expect(screen.queryByTestId('space-row-badge')).not.toBeNull();
  });

  it('clicking an album row confirms with that single collection', async () => {
    const onClose = vi.fn();
    withAlbum();
    render(CollectionPickerModal, { assetCount: 3, onClose });
    await fireEvent.click(await screen.findByRole('button', { name: /Trip/ }));
    expect(onClose).toHaveBeenCalledWith([expect.objectContaining({ kind: 'album', id: 'a1' })]);
  });

  it('Ctrl/checkbox multi-select mixes album + space and submits all at once', async () => {
    const onClose = vi.fn();
    withAlbum();
    sdkMock.getAllSpaces.mockResolvedValue([space('s1', 'Family')]);
    render(CollectionPickerModal, { assetCount: 3, onClose });
    // hover reveals each row's multi-select checkbox, then toggle both.
    // Re-query each row right before use — selecting one re-derives the list.
    const albumRow = await screen.findByTestId('row-album-a1');
    await fireEvent.mouseEnter(within(albumRow).getByRole('group'));
    await fireEvent.click(within(albumRow).getByRole('checkbox'));
    const spaceRow = screen.getByTestId('row-space-s1');
    await fireEvent.mouseEnter(within(spaceRow).getByRole('group'));
    await fireEvent.click(within(spaceRow).getByRole('checkbox'));
    await fireEvent.click(await screen.findByTestId('add-collections-button'));
    expect(onClose).toHaveBeenCalledTimes(1);
    const selected = onClose.mock.calls[0][0] as Array<{ kind: string }>;
    expect(selected).toHaveLength(2);
    expect(selected.map((c) => c.kind).sort()).toEqual(['album', 'space']);
  });

  it('hides spaces and shows a notice when over the cap', async () => {
    sdkMock.getAllSpaces.mockResolvedValue([space('s1', 'Family')]);
    render(CollectionPickerModal, { assetCount: 10_001, onClose: vi.fn() });
    await waitFor(() => expect(screen.getByTestId('spaces-hidden-notice')).toBeTruthy());
    expect(screen.queryByTestId('row-space-s1')).toBeNull();
    expect(screen.queryByTestId('new-space-row')).toBeNull();
  });

  it('reports an error and still renders albums when spaces fail to load', async () => {
    withAlbum();
    sdkMock.getAllSpaces.mockRejectedValue(new Error('boom'));
    render(CollectionPickerModal, { assetCount: 3, onClose: vi.fn() });
    await waitFor(() => expect(screen.getByTestId('row-album-a1')).toBeTruthy());
    expect(mockHandleError).toHaveBeenCalledOnce();
  });

  it('reports both errors and still shows the create rows when both loads fail', async () => {
    sdkMock.getAllAlbums.mockRejectedValue(new Error('albums down'));
    sdkMock.getAllSpaces.mockRejectedValue(new Error('spaces down'));
    render(CollectionPickerModal, { assetCount: 3, onClose: vi.fn() });
    await waitFor(() => expect(screen.getByTestId('new-space-row')).toBeTruthy());
    expect(mockHandleError).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('row-album-a1')).toBeNull();
  });
});
