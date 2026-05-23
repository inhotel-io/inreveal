import {
  AgentOperationPlanStatus,
  AgentOperationRiskLevel,
  AgentOperationStatus,
  AgentOperationTargetKind,
  AgentOperationType,
  type AgentOperationPlanResponseDto,
  type AgentOperationResponseDto,
} from '@immich/sdk';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import {
  buildOperationReviewModel,
  setOperationFieldOverride,
  type OperationEnabledState,
  type OperationFieldOverrideState,
  type OperationItemSelectionState,
} from './agent-operation-plan-ui';
import AgentPlanDestinationCard from './agent-plan-destination-card.svelte';

vi.mock('$lib/utils', () => ({
  getAssetMediaUrl: ({ id, size }: { id: string; size: string }) => `/api/assets/${id}/thumbnail?size=${size}`,
}));

vi.mock('svelte-i18n', () => {
  const messages: Record<string, string> = {
    assistant_operation_asset_count: '{count} assets',
    assistant_operation_asset_selection_summary: '{selected} of {total} photos selected',
    assistant_operation_blocked_by: 'Blocked by {dependencies}',
    assistant_operation_destination_selected_summary: '{selected} of {total} changes selected',
    assistant_operation_destination_toggle: 'Select destination {name}',
    assistant_operation_detail_id: 'Operation ID',
    assistant_operation_detail_risk: 'Risk',
    assistant_operation_detail_status: 'Status',
    assistant_operation_detail_hide: 'Details',
    assistant_operation_detail_show: 'Details',
    assistant_operation_detail_toggle: 'Details',
    assistant_operation_detail_type: 'Type',
    assistant_operation_field_cover_option: 'Use photo {index} as cover',
    assistant_operation_field_cover_thumbnail_alt: 'Cover photo option {index}',
    assistant_operation_field_reset: 'Reset {field}',
    assistant_operation_field_thumbnail_unavailable: 'Preview unavailable',
    assistant_operation_photo_stage_title: 'Photos in this plan',
    assistant_operation_photo_stage_review: 'Review photos',
    assistant_operation_photo_stage_summary: '{count} selected trip photos',
    assistant_operation_thumbnail_alt: 'Photo preview {index} of {count}',
    assistant_operation_thumbnail_empty: '{count} photos without previews',
    assistant_operation_thumbnail_overflow: '+{count}',
    assistant_operation_thumbnail_overflow_label: '{count} more photos',
    assistant_operation_thumbnail_strip_label: '{count} photo previews',
    assistant_operation_thumbnail_unavailable: 'Preview unavailable',
    assistant_operation_item_excluded_count: '{count} excluded',
    assistant_operation_item_exclude_videos: 'Exclude videos',
    assistant_operation_item_exclude_visible: 'Exclude visible',
    assistant_operation_item_filter_label: 'Filter photos',
    assistant_operation_item_filter_placeholder: 'Filter photos',
    assistant_operation_item_include_only_videos: 'Include only videos',
    assistant_operation_item_include_visible: 'Include visible',
    assistant_operation_item_media_all: 'All',
    assistant_operation_item_media_photos: 'Photos',
    assistant_operation_item_media_videos: 'Videos',
    assistant_operation_item_overflow: '+{count} not shown',
    assistant_operation_item_overflow_label: '{count} more affected photos are not shown',
    assistant_operation_item_quick_duplicates: 'Duplicates',
    assistant_operation_item_quick_screenshots: 'Screenshots',
    assistant_operation_item_reset: 'Reset selection',
    assistant_operation_item_review_label: 'Review photos for {summary}',
    assistant_operation_item_select_all_filtered: 'Select all filtered',
    assistant_operation_item_selected_count: '{selected} of {total} selected',
    assistant_operation_item_deselect_all_filtered: 'Deselect all filtered',
    assistant_operation_item_empty_filter: 'No matching photos',
    assistant_operation_item_thumbnail_alt: 'Photo {index} of {count}',
    assistant_operation_item_thumbnail_unavailable: 'Preview unavailable',
    assistant_operation_item_toolbar_label: 'Photo review controls',
    assistant_operation_item_toggle: 'Include photo {index}',
    assistant_operation_item_virtual_summary: 'Showing {visible} of {total} photos',
    assistant_operation_risk_low: 'Low risk',
    assistant_operation_type_album_add_assets: 'Add assets',
    assistant_operation_type_album_create: 'Create album',
  };

  return {
    t: readable((key: string, options?: { values?: Record<string, string | number> }) =>
      (messages[key] ?? key)
        .replace('{count}', String(options?.values?.count ?? ''))
        .replace('{index}', String(options?.values?.index ?? ''))
        .replace('{field}', String(options?.values?.field ?? ''))
        .replace('{selected}', String(options?.values?.selected ?? ''))
        .replace('{total}', String(options?.values?.total ?? ''))
        .replace('{visible}', String(options?.values?.visible ?? ''))
        .replace('{name}', String(options?.values?.name ?? ''))
        .replace('{dependencies}', String(options?.values?.dependencies ?? '')),
    ),
  };
});

const planId = '00000000-0000-4000-8000-000000000100';
const createId = '00000000-0000-4000-8000-000000000101';
const addId = '00000000-0000-4000-8000-000000000102';
const assetA = '00000000-0000-4000-8000-000000000201';
const assetB = '00000000-0000-4000-8000-000000000202';

const baseOperation = {
  planId,
  targetId: null,
  temporaryTargetId: null,
  assetIds: [],
  dependencyIds: [],
  riskLevel: AgentOperationRiskLevel.Low,
  enabled: true,
  status: AgentOperationStatus.Proposed,
  result: null,
  error: null,
  createdAt: '2026-05-15T00:00:00.000Z',
  updatedAt: '2026-05-15T00:00:00.000Z',
} satisfies Omit<AgentOperationResponseDto, 'id' | 'type' | 'summary' | 'targetKind' | 'payload'>;

const operation = (
  operation: Partial<AgentOperationResponseDto> &
    Pick<AgentOperationResponseDto, 'id' | 'type' | 'summary' | 'targetKind' | 'payload'>,
): AgentOperationResponseDto => ({ ...baseOperation, ...operation });

const plan = (operations: AgentOperationResponseDto[]): AgentOperationPlanResponseDto => ({
  id: planId,
  sessionId: '00000000-0000-4000-8000-000000000001',
  revision: 1,
  status: AgentOperationPlanStatus.Proposed,
  summary: 'Organize Portugal holiday',
  operations,
  createdAt: '2026-05-15T00:00:00.000Z',
  updatedAt: '2026-05-15T00:00:00.000Z',
});

const group = (
  enabledByOperationId?: OperationEnabledState,
  itemSelectionByOperationId?: OperationItemSelectionState,
  fieldOverrideByOperationId?: OperationFieldOverrideState,
) =>
  buildOperationReviewModel(
    plan([
      operation({
        id: createId,
        type: AgentOperationType.AlbumCreate,
        summary: 'Create Portugal album',
        targetKind: AgentOperationTargetKind.NewAlbum,
        temporaryTargetId: 'album-portugal',
        payload: { albumName: 'Portugal' },
      }),
      operation({
        id: addId,
        type: AgentOperationType.AlbumAddAssets,
        summary: 'Add two assets',
        targetKind: AgentOperationTargetKind.NewAlbum,
        temporaryTargetId: 'album-portugal',
        assetIds: [assetA, assetB],
        dependencyIds: [createId],
        payload: {},
      }),
    ]),
    enabledByOperationId ?? { [createId]: true, [addId]: true },
    itemSelectionByOperationId ?? {},
    fieldOverrideByOperationId ?? {},
  ).groups[0];

describe('AgentPlanDestinationCard', () => {
  it('renders destination evidence with compact operation and asset counts', () => {
    render(AgentPlanDestinationCard, {
      props: {
        group: group(),
        canChangeSelection: true,
        onToggleGroup: vi.fn(),
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
      },
    });

    const destinationRegion = screen.getByRole('region', { name: 'Portugal' });
    expect(destinationRegion).toBeInTheDocument();
    expect(destinationRegion).toHaveAttribute('role', 'region');
    expect(screen.getByText('Portugal')).toBeInTheDocument();
    expect(screen.getByText('New album')).toBeInTheDocument();
    const compactCounts = screen.getByText('2 of 2 changes selected').parentElement!;
    expect(within(compactCounts).getByText('2 of 2 photos selected')).toBeInTheDocument();
    const thumbnailStrip = screen.getByTestId('agent-plan-thumbnail-strip');
    expect(thumbnailStrip).toHaveAttribute('aria-label', '2 photo previews');
    expect(within(thumbnailStrip).getAllByTestId('agent-plan-thumbnail-image')).toHaveLength(2);
    expect(within(thumbnailStrip).queryByText(/\+\d+/)).not.toBeInTheDocument();
    expect(screen.getByText('Create album "Portugal"')).toBeInTheDocument();
    expect(screen.getByText('Add 2 photos')).toBeInTheDocument();
  });

  it('puts photo evidence before change rows for photo-affecting plans', async () => {
    const onOpenItemReview = vi.fn();
    render(AgentPlanDestinationCard, {
      props: {
        group: group(),
        canChangeSelection: true,
        onToggleGroup: vi.fn(),
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onBulkSetItems: vi.fn(),
        onSetOnlyItems: vi.fn(),
        onResetItemSelection: vi.fn(),
        onSetFieldOverride: vi.fn(),
        onResetFieldOverride: vi.fn(),
        onOpenItemReview,
      },
    });

    const stage = screen.getByTestId('agent-plan-photo-stage');
    const addRow = screen.getByText('Add 2 photos');
    expect(stage).toHaveTextContent('Photos in this plan');
    expect(stage).toHaveTextContent('2 selected trip photos');
    expect(stage.compareDocumentPosition(addRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await fireEvent.click(within(stage).getByRole('button', { name: 'Review photos' }));

    expect(onOpenItemReview).toHaveBeenCalledWith(addId);
  });

  it('renders bounded thumbnails for a destination with 1,000 affected photos', () => {
    const largeAssetIds = Array.from({ length: 1000 }, (_, index) => `large-asset-${index + 1}`);
    const largeGroup = buildOperationReviewModel(
      plan([
        operation({
          id: addId,
          type: AgentOperationType.AlbumAddAssets,
          summary: 'Add one thousand assets',
          targetKind: AgentOperationTargetKind.NewAlbum,
          temporaryTargetId: 'album-portugal',
          assetIds: largeAssetIds,
          payload: {},
        }),
      ]),
      { [addId]: true },
    ).groups[0];

    render(AgentPlanDestinationCard, {
      props: {
        group: largeGroup,
        canChangeSelection: true,
        onToggleGroup: vi.fn(),
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
      },
    });

    const thumbnailStrip = screen.getByTestId('agent-plan-thumbnail-strip');
    expect(within(thumbnailStrip).getAllByTestId('agent-plan-thumbnail-image')).toHaveLength(7);
    expect(within(thumbnailStrip).getByText('+993')).toBeInTheDocument();
    expect(screen.queryByText('large-asset-8')).not.toBeInTheDocument();
    expect(screen.queryByText('large-asset-13')).not.toBeInTheDocument();
  });

  it('sets mixed state when only some operations are selected', () => {
    render(AgentPlanDestinationCard, {
      props: {
        group: group({ [createId]: true, [addId]: false }),
        canChangeSelection: true,
        onToggleGroup: vi.fn(),
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
      },
    });

    const checkbox = screen.getByRole('checkbox', { name: 'Select destination Portugal' }) as HTMLInputElement;
    expect(checkbox).not.toBeChecked();
    expect(checkbox.indeterminate).toBe(true);
    expect(checkbox).toHaveAttribute('aria-checked', 'mixed');
  });

  it('dispatches group toggle changes with the whole group', async () => {
    const currentGroup = group();
    const onToggleGroup = vi.fn();
    render(AgentPlanDestinationCard, {
      props: {
        group: currentGroup,
        canChangeSelection: true,
        onToggleGroup,
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByRole('checkbox', { name: 'Select destination Portugal' }));

    expect(onToggleGroup).toHaveBeenCalledWith(currentGroup, false);
  });

  it('uses selected asset counts when item selection excludes photos', () => {
    render(AgentPlanDestinationCard, {
      props: {
        group: group(
          { [createId]: true, [addId]: true },
          { [addId]: { itemKind: 'asset', mode: 'allExcept', itemIds: [assetB] } },
        ),
        canChangeSelection: true,
        onToggleGroup: vi.fn(),
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
      },
    });

    const compactCounts = screen.getByText('2 of 2 changes selected').parentElement!;
    expect(within(compactCounts).getByText('1 of 2 photos selected')).toBeInTheDocument();
  });

  it('threads item selection callbacks through operation rows', async () => {
    const onToggleItem = vi.fn();
    const onResetItemSelection = vi.fn();
    render(AgentPlanDestinationCard, {
      props: {
        group: group(
          { [createId]: true, [addId]: true },
          { [addId]: { itemKind: 'asset', mode: 'allExcept', itemIds: [assetB] } },
        ),
        canChangeSelection: true,
        onToggleGroup: vi.fn(),
        onToggleOperation: vi.fn(),
        onToggleItem,
        onResetItemSelection,
      },
    });

    await fireEvent.click(screen.getAllByText('Details')[1]);
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Include photo 2' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Reset selection' }));

    expect(onToggleItem).toHaveBeenCalledWith(addId, assetB, true);
    expect(onResetItemSelection).toHaveBeenCalledWith(addId);
  });

  it('threads bulk item callbacks through operation rows', async () => {
    const onBulkSetItems = vi.fn();
    const onSetOnlyItems = vi.fn();
    render(AgentPlanDestinationCard, {
      props: {
        group: group(),
        canChangeSelection: true,
        onToggleGroup: vi.fn(),
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onBulkSetItems,
        onSetOnlyItems,
        onResetItemSelection: vi.fn(),
      },
    });

    await fireEvent.click(screen.getAllByText('Details')[1]);
    await fireEvent.click(screen.getByRole('button', { name: 'Exclude visible' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Select all filtered' }));

    expect(onBulkSetItems).toHaveBeenCalledWith(addId, [assetA, assetB], false);
    expect(onSetOnlyItems).toHaveBeenCalledWith(addId, [assetA, assetB]);
  });

  it('updates the destination title from album-name overrides and threads field callbacks through rows', async () => {
    const onSetFieldOverride = vi.fn();
    const onResetFieldOverride = vi.fn();
    render(AgentPlanDestinationCard, {
      props: {
        group: group(undefined, undefined, setOperationFieldOverride({}, createId, 'albumName', 'Madeira')),
        canChangeSelection: true,
        onToggleGroup: vi.fn(),
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
        onSetFieldOverride,
        onResetFieldOverride,
      },
    });

    expect(screen.getByRole('region', { name: 'Madeira' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select destination Madeira' })).toBeInTheDocument();
    expect(screen.getByText('Create album "Madeira"')).toBeInTheDocument();

    await fireEvent.input(screen.getByLabelText('Album name'), { target: { value: 'Azores' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Reset Album name' }));

    expect(onSetFieldOverride).toHaveBeenCalledWith(createId, 'albumName', 'Azores');
    expect(onResetFieldOverride).toHaveBeenCalledWith(createId, 'albumName');
  });

  it('wraps long destination names without truncating them into controls', () => {
    const longName =
      'Shared space and tag collection with a very long human-readable destination name for mobile review';

    render(AgentPlanDestinationCard, {
      props: {
        group: group(undefined, undefined, setOperationFieldOverride({}, createId, 'albumName', longName)),
        canChangeSelection: true,
        onToggleGroup: vi.fn(),
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
        onSetFieldOverride: vi.fn(),
        onResetFieldOverride: vi.fn(),
      },
    });

    const destinationRegion = screen.getByRole('region', { name: longName });
    const title = within(destinationRegion).getByRole('heading', { name: longName });
    const checkbox = within(destinationRegion).getByRole('checkbox', { name: `Select destination ${longName}` });

    expect(title).toHaveClass('break-words', 'whitespace-normal');
    expect(title).not.toHaveClass('truncate');
    expect(checkbox).toHaveClass('shrink-0');
  });
});
