import { fireEvent, render, screen, within } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { readable } from 'svelte/store';
import type { OperationReviewItem } from './agent-operation-plan-ui';
import AgentPlanItemReview from './agent-plan-item-review.svelte';

vi.mock('$lib/utils', () => ({
  getAssetMediaUrl: ({ id, size }: { id: string; size: string }) => `/api/assets/${id}/thumbnail?size=${size}`,
}));

vi.mock('svelte-i18n', () => {
  const messages: Record<string, string> = {
    assistant_operation_item_review_label: 'Review photos for {summary}',
    assistant_operation_item_selected_count: '{selected} of {total} selected',
    assistant_operation_item_excluded_count: '{count} excluded',
    assistant_operation_item_reset: 'Reset selection',
    assistant_operation_item_thumbnail_alt: 'Photo {index} of {count}',
    assistant_operation_item_toggle: 'Include photo {index}',
    assistant_operation_item_overflow: '+{count} not shown',
    assistant_operation_item_overflow_label: '{count} more affected photos are not shown',
    assistant_operation_item_thumbnail_unavailable: 'Preview unavailable',
    assistant_operation_item_filter_label: 'Filter photos',
    assistant_operation_item_filter_placeholder: 'Filter photos',
    assistant_operation_item_media_all: 'All',
    assistant_operation_item_media_photos: 'Photos',
    assistant_operation_item_media_videos: 'Videos',
    assistant_operation_item_quick_screenshots: 'Screenshots',
    assistant_operation_item_quick_duplicates: 'Duplicates',
    assistant_operation_item_exclude_videos: 'Exclude videos',
    assistant_operation_item_include_only_videos: 'Include only videos',
    assistant_operation_item_exclude_visible: 'Exclude visible',
    assistant_operation_item_include_visible: 'Include visible',
    assistant_operation_item_select_all_filtered: 'Select all filtered',
    assistant_operation_item_deselect_all_filtered: 'Deselect all filtered',
    assistant_operation_item_virtual_summary: 'Showing {visible} of {total} photos',
  };

  const formatValue = (value: string | number | undefined) =>
    typeof value === 'number' ? new Intl.NumberFormat('en-US').format(value) : String(value ?? '');

  return {
    t: readable((key: string, options?: { values?: Record<string, string | number> }) =>
      (messages[key] ?? key)
        .replace('{summary}', String(options?.values?.summary ?? ''))
        .replace('{selected}', formatValue(options?.values?.selected))
        .replace('{visible}', formatValue(options?.values?.visible))
        .replace('{total}', formatValue(options?.values?.total))
        .replace('{count}', formatValue(options?.values?.count))
        .replace('{index}', formatValue(options?.values?.index)),
    ),
  };
});

const item = (assetIds: string[]): OperationReviewItem =>
  ({
    id: 'operation-1',
    enabled: true,
    operation: { assetIds },
    review: {
      summary: 'Add photos',
      selection: {
        itemKind: 'asset',
        totalCount: assetIds.length,
        selectedCount: assetIds.length,
        mode: 'all',
        supportsItemSelection: true,
      },
    },
    excludedAssetCount: 0,
  }) as OperationReviewItem;

const defaultProps = (
  props: Partial<ComponentProps<typeof AgentPlanItemReview>> & { item: OperationReviewItem },
): ComponentProps<typeof AgentPlanItemReview> => ({
  canChangeSelection: true,
  onToggleItem: vi.fn(),
  onBulkSetItems: vi.fn(),
  onSetOnlyItems: vi.fn(),
  onResetSelection: vi.fn(),
  ...props,
});

describe('AgentPlanItemReview', () => {
  it('renders selectable thumbnails and dispatches item toggles', async () => {
    const onToggleItem = vi.fn();
    render(AgentPlanItemReview, {
      props: defaultProps({
        item: item(['asset-1', 'asset-2']),
        onToggleItem,
      }),
    });

    const review = screen.getByRole('group', { name: 'Review photos for Add photos' });
    expect(within(review).getByText('2 of 2 selected')).toBeInTheDocument();
    expect(within(review).getAllByTestId('agent-plan-item-review-image')).toHaveLength(2);
    expect(within(review).queryByText('asset-1')).not.toBeInTheDocument();

    await fireEvent.click(within(review).getByRole('checkbox', { name: 'Include photo 2' }));

    expect(onToggleItem).toHaveBeenCalledWith('operation-1', 'asset-2', false);
  });

  it('shows excluded counts and reset action for partial selection', async () => {
    const onResetSelection = vi.fn();
    const baseItem = item(['asset-1', 'asset-2']);

    render(AgentPlanItemReview, {
      props: defaultProps({
        item: {
          ...baseItem,
          review: {
            ...baseItem.review,
            selection: {
              itemKind: 'asset',
              totalCount: 2,
              selectedCount: 1,
              mode: 'allExcept',
              itemIds: ['asset-2'],
              supportsItemSelection: true,
            },
          },
          excludedAssetCount: 1,
        },
        onResetSelection,
      }),
    });

    expect(screen.getByText('1 excluded')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Include photo 2' })).not.toBeChecked();

    await fireEvent.click(screen.getByRole('button', { name: 'Reset selection' }));

    expect(onResetSelection).toHaveBeenCalledWith('operation-1');
  });

  it('renders only the virtualized visible window plus overscan for large operations', () => {
    const assetIds = Array.from({ length: 1000 }, (_, index) => `asset-${index.toString().padStart(4, '0')}`);
    render(AgentPlanItemReview, {
      props: defaultProps({
        item: item(assetIds),
        viewportHeight: 360,
        itemSize: 96,
        columnCount: 6,
        overscanRows: 1,
      }),
    });

    expect(screen.getAllByTestId('agent-plan-item-review-image')).toHaveLength(30);
    expect(screen.queryByAltText('asset-0999')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 30 of 1,000 photos')).toBeInTheDocument();
  });

  it('updates mounted thumbnails when the virtual grid scrolls', async () => {
    const assetIds = Array.from({ length: 1000 }, (_, index) => `asset-${index.toString().padStart(4, '0')}`);
    render(AgentPlanItemReview, {
      props: defaultProps({
        item: item(assetIds),
        viewportHeight: 360,
        itemSize: 96,
        columnCount: 6,
        overscanRows: 1,
      }),
    });

    const grid = screen.getByTestId('agent-plan-item-review-grid');
    grid.scrollTop = 960;
    await fireEvent.scroll(grid);

    expect(screen.getByAltText('asset-0054')).toBeInTheDocument();
    expect(screen.queryByAltText('asset-0000')).not.toBeInTheDocument();
  });

  it('filters mounted assets by metadata-backed search text', async () => {
    render(AgentPlanItemReview, {
      props: defaultProps({
        item: item(['asset-1', 'asset-2']),
        metadataByAssetId: {
          'asset-1': { id: 'asset-1', filename: 'family-beach.jpg', personNames: ['Maya'] },
          'asset-2': { id: 'asset-2', filename: 'city.jpg' },
        },
      }),
    });

    await fireEvent.input(screen.getByRole('searchbox', { name: 'Filter photos' }), { target: { value: 'maya' } });

    expect(screen.getByAltText('family-beach.jpg')).toBeInTheDocument();
    expect(screen.queryByAltText('city.jpg')).not.toBeInTheDocument();
  });

  it('shows a Videos media filter when media metadata is available', () => {
    render(AgentPlanItemReview, {
      props: defaultProps({
        item: item(['asset-1', 'asset-2']),
        metadataByAssetId: {
          'asset-1': { id: 'asset-1', kind: 'image' },
          'asset-2': { id: 'asset-2', kind: 'video' },
        },
      }),
    });

    expect(screen.getByRole('button', { name: 'Videos' })).toBeInTheDocument();
  });

  it('shows screenshot and duplicate quick filters when metadata supports them', () => {
    render(AgentPlanItemReview, {
      props: defaultProps({
        item: item(['asset-1', 'asset-2', 'asset-3']),
        metadataByAssetId: {
          'asset-1': { id: 'asset-1', isScreenshot: true },
          'asset-2': { id: 'asset-2', duplicateKey: 'same-shot' },
          'asset-3': { id: 'asset-3', duplicateKey: 'same-shot' },
        },
      }),
    });

    expect(screen.getByRole('button', { name: 'Screenshots' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicates' })).toBeInTheDocument();
  });

  it('can include only videos from media metadata', async () => {
    const onSetOnlyItems = vi.fn();
    render(AgentPlanItemReview, {
      props: defaultProps({
        item: item(['asset-1', 'asset-2', 'asset-3']),
        metadataByAssetId: {
          'asset-1': { id: 'asset-1', kind: 'image' },
          'asset-2': { id: 'asset-2', kind: 'video' },
          'asset-3': { id: 'asset-3', kind: 'video' },
        },
        onSetOnlyItems,
      }),
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Include only videos' }));

    expect(onSetOnlyItems).toHaveBeenCalledWith('operation-1', ['asset-2', 'asset-3']);
  });

  it('keeps search but hides metadata-only controls for ID-only plans', () => {
    render(AgentPlanItemReview, {
      props: defaultProps({
        item: item(['asset-1', 'asset-2']),
      }),
    });

    expect(screen.getByRole('searchbox', { name: 'Filter photos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Videos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Screenshots' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Include only videos' })).not.toBeInTheDocument();
  });

  it('disables bulk controls when item selection cannot be changed', () => {
    render(AgentPlanItemReview, {
      props: defaultProps({
        item: item(['asset-1', 'asset-2']),
        canChangeSelection: false,
      }),
    });

    expect(screen.getByRole('button', { name: 'Exclude visible' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Include visible' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Select all filtered' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deselect all filtered' })).toBeDisabled();
  });

  it('shows a per-thumbnail fallback when an image fails', async () => {
    render(AgentPlanItemReview, {
      props: defaultProps({
        item: item(['asset-1']),
      }),
    });

    await fireEvent.error(screen.getByTestId('agent-plan-item-review-image'));

    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
  });
});
