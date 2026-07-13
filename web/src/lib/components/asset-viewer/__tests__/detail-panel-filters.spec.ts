import { AssetTypeEnum, AssetVisibility, type AssetResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildContextualFilterUrl } from '$lib/utils/filter-target';
import { renderWithTooltips } from '$tests/helpers';
import { assetFactory } from '@test-data/factories/asset-factory';
import { reactivePageMock as mockPage } from '@test-data/mocks/reactive-page.mock.svelte';
import DetailPanel from '../DetailPanel.svelte';

// Task 2 of Slice 7 (asset-viewer-contextual-filters). Per the plan's R5, this is a NEW, dedicated
// spec file — the existing detail-panel.spec.ts noop-mocks several children this branch's later
// tasks rewrite, so it is the wrong place to grow filter-grammar coverage. Camera and lens live
// INLINE in DetailPanel.svelte (not their own child components), so they need no such mock here.

const { gotoMock, getAllAlbumsMock, getAssetInfoMock } = vi.hoisted(() => ({
  gotoMock: vi.fn().mockResolvedValue(undefined),
  getAllAlbumsMock: vi.fn(),
  getAssetInfoMock: vi.fn(),
}));

vi.mock('@immich/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@immich/sdk')>();
  return {
    ...actual,
    getAllAlbums: getAllAlbumsMock,
    getAssetInfo: getAssetInfoMock,
  };
});

vi.mock('$app/navigation', () => ({ goto: gotoMock }));

// applyContextualFilter (via resolveFilterTarget) reads the reactive `page` from $app/state. A
// plain vi.hoisted literal registers no signal and — more importantly here — can't be reset to a
// different URL per test the way driving four different FilterTarget surfaces requires. See
// reactive-page.mock.svelte.ts's own docs for why this needs to be the shared $state stand-in.
vi.mock('$app/state', async () => {
  const { reactivePageMock } = await import('@test-data/mocks/reactive-page.mock.svelte');
  return { page: reactivePageMock };
});

const authManagerMock = vi.hoisted(() => ({
  authenticated: true,
  user: { id: 'owner-1' },
  isSharedLink: false,
  params: {},
  preferences: { tags: { enabled: false }, ratings: { enabled: false } },
}));

vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: authManagerMock,
}));

vi.mock('$lib/managers/asset-viewer-manager.svelte', () => ({
  assetViewerManager: {
    closeDetailPanel: vi.fn(),
    closeEditFacesPanel: vi.fn(),
    isEditFacesPanelOpen: false,
    isShowAssetPath: false,
    openEditFacesPanel: vi.fn(),
    toggleAssetPath: vi.fn(),
    toggleFaceEditMode: vi.fn(),
  },
}));

vi.mock('$lib/managers/feature-flags-manager.svelte', () => ({
  featureFlagsManager: { value: { map: false, smartSearch: false } },
}));

const buildAsset = (overrides: Partial<AssetResponseDto> = {}): AssetResponseDto =>
  assetFactory.build({
    id: 'asset-1',
    ownerId: 'owner-1',
    type: AssetTypeEnum.Image,
    visibility: AssetVisibility.Timeline,
    ...overrides,
  });

beforeEach(() => {
  vi.clearAllMocks();
  gotoMock.mockResolvedValue(undefined);
  getAllAlbumsMock.mockResolvedValue([]);
  getAssetInfoMock.mockResolvedValue(undefined);
  authManagerMock.isSharedLink = false;
});

describe('DetailPanel camera filter', () => {
  // The four FilterTarget kinds resolveFilterTarget understands (filter-target.ts).
  const surfaces = [
    { label: '/photos', url: 'https://gallery.test/photos/asset-1', basePath: '/photos' },
    { label: 'a Space', url: 'https://gallery.test/spaces/space-1/photos/asset-1', basePath: '/spaces/space-1' },
    { label: 'an album', url: 'https://gallery.test/albums/album-1/photos/asset-1', basePath: '/albums/album-1' },
    { label: 'the map', url: 'https://gallery.test/map/photos/asset-1', basePath: '/map' },
  ];

  it.each(surfaces)(
    'clicking the value emits { make, model } TOGETHER and filters $label, closing the viewer',
    async ({ url, basePath }) => {
      mockPage.reset(url);
      const asset = buildAsset({ exifInfo: { make: 'Apple', model: 'iPhone 17 Pro Max' } });

      renderWithTooltips(DetailPanel, { asset, currentAlbum: null });

      await fireEvent.click(await screen.findByLabelText(/filter_by_camera/));

      // Computed via the REAL (unmocked) buildContextualFilterUrl against the same mocked page.url
      // applyContextualFilter reads — this is the wiring test, not a re-test of the pure builder.
      const expected = buildContextualFilterUrl(mockPage.url, { make: 'Apple', model: 'iPhone 17 Pro Max' });
      expect(gotoMock).toHaveBeenCalledWith(expected);
      expect(expected.startsWith(basePath)).toBe(true);
      expect(expected).not.toContain('asset-1'); // a single goto() closes the asset viewer
      expect(expected).toContain('make=Apple');
      expect(expected).toContain('model=');
    },
  );

  // R2 — the camera anchor is ONE control for make+model TOGETHER, never split. A model-only asset
  // must still expose exactly one clickable camera affordance (not a separate make-only control),
  // and its patch still carries both keys (make simply absent when there is none).
  it('R2: is a single affordance for make+model together, even when only one is present', async () => {
    mockPage.reset('https://gallery.test/photos/asset-1');
    const asset = buildAsset({ exifInfo: { model: 'iPhone 17 Pro Max', make: undefined } });

    renderWithTooltips(DetailPanel, { asset, currentAlbum: null });

    await waitFor(() => expect(screen.getByTestId('detail-panel-camera')).toBeInTheDocument());
    expect(screen.getAllByLabelText(/filter_by_camera/)).toHaveLength(1);

    await fireEvent.click(screen.getByLabelText(/filter_by_camera/));

    const [url] = gotoMock.mock.calls[0] as [string];
    expect(url).toContain('model=');
  });

  // P1 (soft check here; Task 6 generalises this into a full property test across every row and
  // surface). The patch emitted from clicking must be exactly the asset's own EXIF values, or the
  // resulting filter could exclude the very asset it was clicked on.
  it('P1: the emitted patch matches the asset’s own EXIF make/model', async () => {
    mockPage.reset('https://gallery.test/photos/asset-1');
    const asset = buildAsset({ exifInfo: { make: 'Canon', model: 'EOS R5' } });

    renderWithTooltips(DetailPanel, { asset, currentAlbum: null });

    await fireEvent.click(await screen.findByLabelText(/filter_by_camera/));

    const [url] = gotoMock.mock.calls[0] as [string];
    const decoded = new URLSearchParams(url.split('?')[1]);
    expect(decoded.get('make')).toBe(asset.exifInfo?.make);
    expect(decoded.get('model')).toBe(asset.exifInfo?.model);
  });

  it('the 🔍 icon applies the same patch with { global: true }, landing on /photos carrying nothing over', async () => {
    mockPage.reset(
      'https://gallery.test/spaces/space-1/photos/asset-1?q=beach&sort=asc&people=space-person:p1&city=Berlin',
    );
    const asset = buildAsset({ exifInfo: { make: 'Apple', model: 'iPhone 17 Pro Max' } });

    renderWithTooltips(DetailPanel, { asset, currentAlbum: null });

    await fireEvent.click(await screen.findByLabelText(/search_everywhere/));

    const [url] = gotoMock.mock.calls[0] as [string];
    expect(url.startsWith('/photos')).toBe(true);
    expect(url).toContain('make=Apple');
    expect(url).not.toContain('/spaces');
    expect(url).not.toContain('q=');
    expect(url).not.toContain('city=');
    expect(url).not.toContain('space-person');
  });

  // E5 — the global icon would be a no-op on /photos (the primary click already lands there).
  it('E5: hides the 🔍 icon when already on /photos', async () => {
    mockPage.reset('https://gallery.test/photos/asset-1');
    const asset = buildAsset({ exifInfo: { make: 'Apple', model: 'iPhone 17 Pro Max' } });

    renderWithTooltips(DetailPanel, { asset, currentAlbum: null });

    await screen.findByLabelText(/filter_by_camera/);
    expect(screen.queryByLabelText(/search_everywhere/)).not.toBeInTheDocument();
  });

  // Elsewhere the icon is shown.
  it('shows the 🔍 icon on non-/photos surfaces', async () => {
    mockPage.reset('https://gallery.test/spaces/space-1/photos/asset-1');
    const asset = buildAsset({ exifInfo: { make: 'Apple', model: 'iPhone 17 Pro Max' } });

    renderWithTooltips(DetailPanel, { asset, currentAlbum: null });

    await waitFor(() => expect(screen.getByLabelText(/search_everywhere/)).toBeInTheDocument());
  });

  // R9/E6/E7 — make is truthy as a whitespace-only string ('   '), so the OLD `{#if make || model}`
  // guard alone would render it as a clickable filter — but the patch trims to nothing, so the click
  // would close the viewer and apply no filter. Must not be rendered as clickable at all.
  it('R9: a whitespace-only value is not rendered as clickable', async () => {
    mockPage.reset('https://gallery.test/photos/asset-1');
    const asset = buildAsset({ exifInfo: { make: '   ', model: undefined } });

    renderWithTooltips(DetailPanel, { asset, currentAlbum: null });

    await waitFor(() => expect(screen.getByTestId('detail-panel-camera')).toBeInTheDocument());
    expect(screen.queryByLabelText(/filter_by_camera/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/search_everywhere/)).not.toBeInTheDocument();
  });

  // E2 — a shared link gets NO filter affordance at all, and the old Route.search(...) anchors
  // (which leak today, R4) must not exist regardless.
  it('E2: a shared link renders no filter affordance and no /search anchor', async () => {
    authManagerMock.isSharedLink = true;
    mockPage.reset('https://gallery.test/share/abc/photos/asset-1');
    const asset = buildAsset({ exifInfo: { make: 'Apple', model: 'iPhone 17 Pro Max' } });

    const { container } = renderWithTooltips(DetailPanel, { asset, currentAlbum: null });

    await waitFor(() => expect(screen.getByTestId('detail-panel-camera')).toBeInTheDocument());
    expect(screen.queryByLabelText(/filter_by_camera/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/search_everywhere/)).not.toBeInTheDocument();
    expect(container.querySelector('a[href*="/search"]')).toBeNull();
    expect(gotoMock).not.toHaveBeenCalled();
  });
});

describe('DetailPanel lens filter', () => {
  it('clicking the value emits { lensModel } and filters the current surface', async () => {
    mockPage.reset('https://gallery.test/spaces/space-1/photos/asset-1');
    const asset = buildAsset({ exifInfo: { lensModel: 'RF 24-70mm f/2.8L' } });

    renderWithTooltips(DetailPanel, { asset, currentAlbum: null });

    await fireEvent.click(await screen.findByLabelText(/filter_by_lens/));

    const expected = buildContextualFilterUrl(mockPage.url, { lensModel: 'RF 24-70mm f/2.8L' });
    expect(gotoMock).toHaveBeenCalledWith(expected);
    expect(expected.startsWith('/spaces/space-1')).toBe(true);
    expect(expected).toContain('lens=');
  });

  it('the 🔍 icon applies { lensModel } with { global: true }, landing on /photos', async () => {
    mockPage.reset('https://gallery.test/spaces/space-1/photos/asset-1?city=Berlin');
    const asset = buildAsset({ exifInfo: { lensModel: 'RF 24-70mm f/2.8L' } });

    renderWithTooltips(DetailPanel, { asset, currentAlbum: null });

    await fireEvent.click(await screen.findByLabelText(/search_everywhere/));

    const [url] = gotoMock.mock.calls[0] as [string];
    expect(url.startsWith('/photos')).toBe(true);
    expect(url).toContain('lens=');
    expect(url).not.toContain('city=');
  });

  // E5 for the lens row too.
  it('E5: hides the 🔍 icon when already on /photos', async () => {
    mockPage.reset('https://gallery.test/photos/asset-1');
    const asset = buildAsset({ exifInfo: { lensModel: 'RF 24-70mm f/2.8L' } });

    renderWithTooltips(DetailPanel, { asset, currentAlbum: null });

    await screen.findByLabelText(/filter_by_lens/);
    expect(screen.queryByLabelText(/search_everywhere/)).not.toBeInTheDocument();
  });

  it('R9: a whitespace-only lensModel is not rendered as clickable', async () => {
    mockPage.reset('https://gallery.test/photos/asset-1');
    const asset = buildAsset({ exifInfo: { lensModel: '   ' } });

    renderWithTooltips(DetailPanel, { asset, currentAlbum: null });

    await waitFor(() => expect(screen.getByTestId('detail-panel-lens')).toBeInTheDocument());
    expect(screen.queryByLabelText(/filter_by_lens/)).not.toBeInTheDocument();
  });

  it('E2: a shared link renders no filter affordance and no /search anchor', async () => {
    authManagerMock.isSharedLink = true;
    mockPage.reset('https://gallery.test/share/abc/photos/asset-1');
    const asset = buildAsset({ exifInfo: { lensModel: 'RF 24-70mm f/2.8L' } });

    const { container } = renderWithTooltips(DetailPanel, { asset, currentAlbum: null });

    await waitFor(() => expect(screen.getByTestId('detail-panel-lens')).toBeInTheDocument());
    expect(screen.queryByLabelText(/filter_by_lens/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/search_everywhere/)).not.toBeInTheDocument();
    expect(container.querySelector('a[href*="/search"]')).toBeNull();
    expect(gotoMock).not.toHaveBeenCalled();
  });
});
