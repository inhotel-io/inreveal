import { fireEvent, render, screen, within } from '@testing-library/svelte';
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
  };

  return {
    t: readable((key: string, options?: { values?: Record<string, string | number> }) =>
      (messages[key] ?? key)
        .replace('{summary}', String(options?.values?.summary ?? ''))
        .replace('{selected}', String(options?.values?.selected ?? ''))
        .replace('{total}', String(options?.values?.total ?? ''))
        .replace('{count}', String(options?.values?.count ?? ''))
        .replace('{index}', String(options?.values?.index ?? '')),
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

describe('AgentPlanItemReview', () => {
  it('renders selectable thumbnails and dispatches item toggles', async () => {
    const onToggleItem = vi.fn();
    render(AgentPlanItemReview, {
      props: {
        item: item(['asset-1', 'asset-2']),
        canChangeSelection: true,
        onToggleItem,
        onResetSelection: vi.fn(),
      },
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
      props: {
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
        canChangeSelection: true,
        onToggleItem: vi.fn(),
        onResetSelection,
      },
    });

    expect(screen.getByText('1 excluded')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Include photo 2' })).not.toBeChecked();

    await fireEvent.click(screen.getByRole('button', { name: 'Reset selection' }));

    expect(onResetSelection).toHaveBeenCalledWith('operation-1');
  });

  it('renders only a bounded number of thumbnails for large operations', () => {
    const assetIds = Array.from({ length: 1_000 }, (_, index) => `asset-${index + 1}`);
    render(AgentPlanItemReview, {
      props: {
        item: item(assetIds),
        canChangeSelection: true,
        onToggleItem: vi.fn(),
        onResetSelection: vi.fn(),
      },
    });

    expect(screen.getAllByTestId('agent-plan-item-review-image')).toHaveLength(48);
    expect(screen.getByText('+952 not shown')).toBeInTheDocument();
    expect(screen.queryByText('asset-49')).not.toBeInTheDocument();
  });

  it('shows a per-thumbnail fallback when an image fails', async () => {
    render(AgentPlanItemReview, {
      props: {
        item: item(['asset-1']),
        canChangeSelection: true,
        onToggleItem: vi.fn(),
        onResetSelection: vi.fn(),
      },
    });

    await fireEvent.error(screen.getByTestId('agent-plan-item-review-image'));

    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
  });
});
