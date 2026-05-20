import TestWrapper from '$lib/components/TestWrapper.svelte';
import type { AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import { AssetTypeEnum, AssetVisibility, type AssetResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';

import GalleryViewer from './gallery-viewer.svelte';

const { mockAssetInteraction, mockAssetViewerManager } = vi.hoisted(() => ({
  mockAssetInteraction: {
    selectionActive: false,
    assets: [],
    candidates: [],
    startAsset: null,
    clear: vi.fn(),
    clearCandidates: vi.fn(),
    hasSelectedAsset: vi.fn(() => false),
    hasSelectionCandidate: vi.fn(() => false),
    removeAssetFromMultiselectGroup: vi.fn(),
    selectAsset: vi.fn(),
    selectAssets: vi.fn(),
    setAssetSelectionCandidates: vi.fn(),
    setAssetSelectionStart: vi.fn(),
  },
  mockAssetViewerManager: {
    asset: undefined,
    isViewing: false,
    showAssetViewer: vi.fn(),
  },
}));

vi.mock('$lib/components/assets/thumbnail/thumbnail.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/thumbnail-with-label.stub.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/elements/Portal.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/managers/asset-viewer-manager.svelte', () => ({
  assetViewerManager: mockAssetViewerManager,
}));

vi.mock('$lib/managers/feature-flags-manager.svelte', () => ({
  featureFlagsManager: { value: { trash: true } },
}));

vi.mock('$lib/utils/navigation', () => ({
  isSharedLinkRoute: vi.fn(() => false),
  navigate: vi.fn(),
}));

function asset(id: string, localDateTime: string, overrides: Partial<AssetResponseDto> = {}): AssetResponseDto {
  return {
    id,
    ownerId: 'user-1',
    type: AssetTypeEnum.Image,
    originalFileName: `${id}.jpg`,
    visibility: AssetVisibility.Timeline,
    isFavorite: false,
    isTrashed: false,
    fileCreatedAt: localDateTime,
    localDateTime,
    thumbhash: `${id}-thumbhash`,
    width: 1600,
    height: 900,
    ...overrides,
  } as AssetResponseDto;
}

function renderViewer({
  assets = defaultAssets(),
  enableGrouping = true,
  assetInteraction = mockAssetInteraction,
  onIntersected,
}: {
  assets?: AssetResponseDto[];
  enableGrouping?: boolean;
  assetInteraction?: AssetMultiSelectManager;
  onIntersected?: () => void;
} = {}) {
  const componentProps = {
    assets,
    assetInteraction,
    viewport: { width: 900, height: 700 },
    enableGrouping,
    onIntersected,
  };

  return render(
    TestWrapper as Component<{ component: typeof GalleryViewer; componentProps: Record<string, unknown> }>,
    {
      component: GalleryViewer,
      componentProps,
    },
  );
}

function defaultAssets() {
  return [
    asset('asset-2016', '2016-01-02T00:00:00.000Z'),
    asset('asset-2015-aug', '2015-08-03T00:00:00.000Z'),
    asset('asset-2015-jan', '2015-01-01T00:00:00.000Z'),
  ];
}

describe('GalleryViewer grouping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssetInteraction.selectionActive = false;
    mockAssetInteraction.assets = [];
    mockAssetInteraction.candidates = [];
    mockAssetInteraction.startAsset = null;
    mockAssetViewerManager.asset = undefined;
    mockAssetViewerManager.isViewing = false;
  });

  it('renders the grouping control when grouping is enabled and assets exist', () => {
    renderViewer();

    expect(screen.getByTestId('timeline-desktop-grouping-control')).toBeInTheDocument();
  });

  it('does not render an orphaned grouping control for an empty asset list', () => {
    renderViewer({ assets: [], enableGrouping: true });

    expect(screen.queryByTestId('timeline-desktop-grouping-control')).not.toBeInTheDocument();
  });

  it('does not render the grouping control when grouping is disabled', () => {
    renderViewer({ enableGrouping: false });

    expect(screen.queryByTestId('timeline-desktop-grouping-control')).not.toBeInTheDocument();
  });

  it('manual grouping changes render representative year cards without temporal chips', async () => {
    renderViewer();

    await fireEvent.click(screen.getByTestId('timeline-grouping-year'));

    await waitFor(() => {
      expect(screen.getAllByTestId('timeline-bucket-card')).toHaveLength(2);
      expect(screen.queryByTestId('active-filters-bar')).not.toBeInTheDocument();
      expect(screen.queryByTestId('thumbnail-asset-2015-aug')).not.toBeInTheDocument();
    });
  });

  it('clicking a year then month card narrows loaded assets and exposes a clearable temporal chip', async () => {
    const assets = defaultAssets();
    renderViewer({ assets });

    await fireEvent.click(screen.getByTestId('timeline-grouping-year'));
    await fireEvent.click(screen.getByRole('button', { name: /2015, 2 photos/i }));

    await waitFor(() => {
      expect(screen.getByTestId('active-filters-bar')).toHaveTextContent('2015');
      expect(screen.getByTestId('timeline-grouping-month')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getAllByTestId('timeline-bucket-card')).toHaveLength(2);
    });

    await fireEvent.click(screen.getByRole('button', { name: /Aug 2015, 1 photo/i }));

    await waitFor(() => {
      expect(screen.getByTestId('active-filters-bar')).toHaveTextContent('Aug 2015');
      expect(screen.getByTestId('timeline-grouping-day')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('thumbnail-asset-2015-aug')).toBeInTheDocument();
      expect(screen.queryByTestId('thumbnail-asset-2015-jan')).not.toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Remove Aug 2015 filter' }));

    await waitFor(() => {
      expect(screen.queryByTestId('active-filters-bar')).not.toBeInTheDocument();
      expect(screen.getByTestId('thumbnail-asset-2016')).toBeInTheDocument();
      expect(screen.getByTestId('thumbnail-asset-2015-aug')).toBeInTheDocument();
      expect(screen.getByTestId('thumbnail-asset-2015-jan')).toBeInTheDocument();
      expect(screen.getByTestId('timeline-grouping-day')).toHaveAttribute('aria-pressed', 'true');
    });
    expect(assets.map((asset) => asset.id)).toEqual(['asset-2016', 'asset-2015-aug', 'asset-2015-jan']);
  });

  it('keeps single-asset GalleryViewer grids in normal day mode', () => {
    renderViewer({ assets: [asset('single-asset', '2015-08-03T00:00:00.000Z')] });

    expect(screen.getByTestId('timeline-desktop-grouping-control')).toBeInTheDocument();
    expect(screen.getByTestId('thumbnail-single-asset')).toBeInTheDocument();
    expect(screen.queryByTestId('gallery-viewer-representative-buckets')).not.toBeInTheDocument();
  });

  it('does not request more assets while representative buckets are displayed', async () => {
    const onIntersected = vi.fn();
    renderViewer({ onIntersected });

    await fireEvent.click(screen.getByTestId('timeline-grouping-year'));
    onIntersected.mockClear();
    await fireEvent.click(screen.getByRole('button', { name: /2015, 2 photos/i }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onIntersected).not.toHaveBeenCalled();
  });

  it('hides controls and disables representative card activation during selection mode', async () => {
    const assets = defaultAssets();
    const view = renderViewer({ assets });
    await fireEvent.click(screen.getByTestId('timeline-grouping-year'));

    const selectionInteraction = { ...mockAssetInteraction, selectionActive: true } as AssetMultiSelectManager;
    await view.rerender({
      component: GalleryViewer,
      componentProps: {
        assets,
        assetInteraction: selectionInteraction,
        viewport: { width: 900, height: 700 },
        enableGrouping: true,
      },
    });

    expect(screen.queryByTestId('timeline-desktop-grouping-control')).not.toBeInTheDocument();
    const yearCard = screen.getByRole('button', { name: /2015, 2 photos/i });
    expect(yearCard).toBeDisabled();
    await fireEvent.click(yearCard);
    expect(screen.queryByTestId('active-filters-bar')).not.toBeInTheDocument();
  });

  it('preserves ungrouped day-mode GalleryViewer behavior when grouping is disabled', () => {
    renderViewer({ enableGrouping: false });

    expect(screen.queryByTestId('timeline-desktop-grouping-control')).not.toBeInTheDocument();
    expect(screen.getByTestId('thumbnail-asset-2016')).toBeInTheDocument();
    expect(screen.getByTestId('thumbnail-asset-2015-aug')).toBeInTheDocument();
  });
});
