import {
  AgentOperationPlanStatus,
  AgentOperationRiskLevel,
  AgentOperationStatus,
  AgentOperationTargetKind,
  AgentOperationType,
  type AgentOperationPlanResponseDto,
  type AgentOperationResponseDto,
} from '@immich/sdk';
import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import { readable } from 'svelte/store';
import {
  buildOperationReviewModel,
  type OperationEnabledState,
  type OperationItemSelectionState,
} from './agent-operation-plan-ui';
import AgentPlanOperationRow from './agent-plan-operation-row.svelte';

vi.mock('$lib/utils', () => ({
  getAssetMediaUrl: ({ id, size }: { id: string; size: string }) => `/api/assets/${id}/thumbnail?size=${size}`,
}));

vi.mock('svelte-i18n', () => {
  const messages: Record<string, string> = {
    assistant_operation_asset_count: '{count} assets',
    assistant_operation_asset_selection_summary: '{selected} of {total} photos selected',
    assistant_operation_blocked_by: 'Blocked by {dependencies}',
    assistant_operation_detail_id: 'Operation ID',
    assistant_operation_detail_risk: 'Risk',
    assistant_operation_detail_status: 'Status',
    assistant_operation_detail_hide: 'Hide technical details',
    assistant_operation_detail_show: 'Show technical details',
    assistant_operation_detail_type: 'Type',
    assistant_operation_field_cover_option: 'Use photo {index} as cover',
    assistant_operation_field_cover_thumbnail_alt: 'Cover photo option {index}',
    assistant_operation_field_reset: 'Reset {field}',
    assistant_operation_field_thumbnail_unavailable: 'Preview unavailable',
    assistant_operation_partial_asset_summary: '{applied} applied · {failed} failed',
    assistant_operation_risk_low: 'Low risk',
    assistant_operation_skipped_reason: 'Skipped: {reason}',
    assistant_operation_status_applied: 'Applied',
    assistant_operation_status_failed: 'Failed',
    assistant_operation_status_partial: 'Partially applied',
    assistant_operation_status_proposed: 'Proposed',
    assistant_operation_status_skipped: 'Skipped',
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
    assistant_operation_item_thumbnail_alt: 'Photo {index} of {count}',
    assistant_operation_item_thumbnail_unavailable: 'Preview unavailable',
    assistant_operation_item_toggle: 'Include photo {index}',
    assistant_operation_item_deselect_all_filtered: 'Deselect all filtered',
    assistant_operation_item_virtual_summary: 'Showing {visible} of {total} photos',
    assistant_operation_type_album_add_assets: 'Add assets',
    assistant_operation_type_album_create: 'Create album',
    assistant_operation_type_album_set_cover: 'Set cover',
    assistant_operation_type_album_update_details: 'Update details',
  };

  return {
    t: readable((key: string, options?: { values?: Record<string, string | number> }) =>
      (messages[key] ?? key)
        .replace('{count}', String(options?.values?.count ?? ''))
        .replace('{index}', String(options?.values?.index ?? ''))
        .replace('{selected}', String(options?.values?.selected ?? ''))
        .replace('{summary}', String(options?.values?.summary ?? ''))
        .replace('{total}', String(options?.values?.total ?? ''))
        .replace('{visible}', String(options?.values?.visible ?? ''))
        .replace('{dependencies}', String(options?.values?.dependencies ?? ''))
        .replace('{applied}', String(options?.values?.applied ?? ''))
        .replace('{failed}', String(options?.values?.failed ?? ''))
        .replace('{reason}', String(options?.values?.reason ?? ''))
        .replace('{field}', String(options?.values?.field ?? '')),
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

const model = (
  enabledByOperationId?: OperationEnabledState,
  itemSelectionByOperationId?: OperationItemSelectionState,
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
  );

const stubMeasuredGridWidth = () => {
  let resize: ResizeObserverCallback | undefined;

  vi.stubGlobal(
    'ResizeObserver',
    vi.fn(function (callback: ResizeObserverCallback) {
      resize = callback;

      return {
        disconnect: vi.fn(),
        observe: vi.fn(),
        unobserve: vi.fn(),
      };
    }),
  );

  return async (width: number) => {
    if (!resize) {
      throw new Error('ResizeObserver was not attached');
    }

    resize(
      [
        {
          contentRect: { width },
        } as ResizeObserverEntry,
      ],
      {} as ResizeObserver,
    );
    await tick();
  };
};

describe('AgentPlanOperationRow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a human operation summary and dispatches operation toggle changes', async () => {
    const onToggleOperation = vi.fn();
    render(AgentPlanOperationRow, {
      props: {
        item: model().operationsById.get(addId)!,
        canChangeSelection: true,
        onToggleOperation,
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
        onSetFieldOverride: vi.fn(),
        onResetFieldOverride: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByRole('checkbox', { name: 'Add 2 photos' }));

    expect(screen.getByText('Add 2 photos')).toBeInTheDocument();
    expect(screen.getByText('2 of 2 photos selected')).toBeInTheDocument();
    expect(screen.queryByText('Add two assets')).not.toBeInTheDocument();
    expect(screen.queryByText(addId)).not.toBeInTheDocument();
    expect(onToggleOperation).toHaveBeenCalledWith(addId, false);
  });

  it('supports keyboard toggling for operation selection and details disclosure', async () => {
    const user = userEvent.setup();
    const onToggleOperation = vi.fn();
    render(AgentPlanOperationRow, {
      props: {
        item: model().operationsById.get(addId)!,
        canChangeSelection: true,
        onToggleOperation,
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
        onSetFieldOverride: vi.fn(),
        onResetFieldOverride: vi.fn(),
      },
    });

    const checkbox = screen.getByRole('checkbox', { name: 'Add 2 photos' });
    checkbox.focus();
    await user.keyboard('[Space]');

    expect(onToggleOperation).toHaveBeenCalledWith(addId, false);

    const detailsButton = screen.getByRole('button', { name: 'Show technical details' });
    detailsButton.focus();
    await user.keyboard('[Enter]');

    expect(screen.getByRole('button', { name: 'Hide technical details' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Operation ID')).toBeInTheDocument();
  });

  it('disables blocked operations and explains the dependency in user language', () => {
    render(AgentPlanOperationRow, {
      props: {
        item: model({ [createId]: false, [addId]: true }).operationsById.get(addId)!,
        canChangeSelection: true,
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
        onSetFieldOverride: vi.fn(),
        onResetFieldOverride: vi.fn(),
      },
    });

    const checkbox = screen.getByRole('checkbox', { name: 'Add 2 photos' });
    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toHaveAttribute('aria-disabled');
    expect(screen.getByText('Blocked by Create Portugal album')).toBeInTheDocument();
  });

  it('renders proposed status for proposed operations', () => {
    render(AgentPlanOperationRow, {
      props: {
        item: model().operationsById.get(addId)!,
        canChangeSelection: true,
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
        onSetFieldOverride: vi.fn(),
        onResetFieldOverride: vi.fn(),
      },
    });

    expect(screen.getByText('Proposed')).toBeInTheDocument();
  });

  it('keeps technical operation details hidden until the user expands details', async () => {
    render(AgentPlanOperationRow, {
      props: {
        item: model().operationsById.get(addId)!,
        canChangeSelection: true,
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
        onSetFieldOverride: vi.fn(),
        onResetFieldOverride: vi.fn(),
      },
    });

    expect(screen.queryByText(addId)).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Show technical details' }));

    expect(screen.getByText('Operation ID')).toBeInTheDocument();
    expect(screen.getByText(addId)).toBeInTheDocument();
    expect(screen.getByText('Add assets')).toBeInTheDocument();
    expect(screen.getByText('Low risk')).toBeInTheDocument();
  });

  it('exposes mixed operation selection and selected photo counts for partial item selection', () => {
    render(AgentPlanOperationRow, {
      props: {
        item: model(
          { [createId]: true, [addId]: true },
          { [addId]: { itemKind: 'asset', mode: 'allExcept', itemIds: [assetB] } },
        ).operationsById.get(addId)!,
        canChangeSelection: true,
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
        onSetFieldOverride: vi.fn(),
        onResetFieldOverride: vi.fn(),
      },
    });

    const checkbox = screen.getByRole('checkbox', { name: 'Add 2 photos' }) as HTMLInputElement;
    expect(checkbox).toBeChecked();
    expect(checkbox.indeterminate).toBe(true);
    expect(checkbox).toHaveAttribute('aria-checked', 'mixed');
    expect(screen.getByText('1 of 2 photos selected')).toBeInTheDocument();
  });

  it('renders item review before technical details and threads item selection callbacks', async () => {
    const onToggleItem = vi.fn();
    const onResetItemSelection = vi.fn();
    render(AgentPlanOperationRow, {
      props: {
        item: model(
          { [createId]: true, [addId]: true },
          { [addId]: { itemKind: 'asset', mode: 'allExcept', itemIds: [assetB] } },
        ).operationsById.get(addId)!,
        canChangeSelection: true,
        onToggleOperation: vi.fn(),
        onToggleItem,
        onResetItemSelection,
        onSetFieldOverride: vi.fn(),
        onResetFieldOverride: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Show technical details' }));

    const itemReview = screen.getByRole('group', { name: 'Review photos for Add 2 photos' });
    const technicalDetail = screen.getByText('Operation ID');
    expect(itemReview.compareDocumentPosition(technicalDetail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await fireEvent.click(screen.getByRole('checkbox', { name: 'Include photo 2' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Reset selection' }));

    expect(onToggleItem).toHaveBeenCalledWith(addId, assetB, true);
    expect(onResetItemSelection).toHaveBeenCalledWith(addId);
  });

  it('threads bulk item callbacks from the item review controls', async () => {
    const onBulkSetItems = vi.fn();
    const onSetOnlyItems = vi.fn();
    render(AgentPlanOperationRow, {
      props: {
        item: model().operationsById.get(addId)!,
        canChangeSelection: true,
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onBulkSetItems,
        onSetOnlyItems,
        onResetItemSelection: vi.fn(),
        onSetFieldOverride: vi.fn(),
        onResetFieldOverride: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Show technical details' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Exclude visible' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Select all filtered' }));

    expect(onBulkSetItems).toHaveBeenCalledWith(addId, [assetA, assetB], false);
    expect(onSetOnlyItems).toHaveBeenCalledWith(addId, [assetA, assetB]);
  });

  it('uses the responsive item review column contract from the operation row path', async () => {
    const setMeasuredWidth = stubMeasuredGridWidth();
    const assetIds = Array.from(
      { length: 100 },
      (_, index) => `00000000-0000-4000-8000-${(300 + index).toString().padStart(12, '0')}`,
    );
    const item = buildOperationReviewModel(
      plan([
        operation({
          id: addId,
          type: AgentOperationType.AlbumAddAssets,
          summary: 'Add many assets',
          targetKind: AgentOperationTargetKind.NewAlbum,
          temporaryTargetId: 'album-portugal',
          assetIds,
          payload: {},
        }),
      ]),
      { [addId]: true },
      {},
    ).operationsById.get(addId)!;

    render(AgentPlanOperationRow, {
      props: {
        item,
        canChangeSelection: true,
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onBulkSetItems: vi.fn(),
        onSetOnlyItems: vi.fn(),
        onResetItemSelection: vi.fn(),
        onSetFieldOverride: vi.fn(),
        onResetFieldOverride: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Show technical details' }));
    await setMeasuredWidth(220);

    expect(screen.getByTestId('agent-plan-item-review-tile-grid')).toHaveStyle({
      'grid-template-columns': 'repeat(2, minmax(0, 1fr))',
    });
    expect(screen.getAllByTestId('agent-plan-item-review-image')).toHaveLength(14);
    expect(screen.getByText('Showing 14 of 100 photos')).toBeInTheDocument();
  });

  it('renders inline field editors above technical details and threads field callbacks', async () => {
    const onSetFieldOverride = vi.fn();
    const onResetFieldOverride = vi.fn();

    render(AgentPlanOperationRow, {
      props: {
        item: model().operationsById.get(createId)!,
        canChangeSelection: true,
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
        onSetFieldOverride,
        onResetFieldOverride,
      },
    });

    await fireEvent.input(screen.getByLabelText('Album name'), { target: { value: 'Madeira' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Show technical details' }));

    const field = screen.getByLabelText('Album name');
    const technicalDetail = screen.getByText('Operation ID');
    expect(field.compareDocumentPosition(technicalDetail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(onSetFieldOverride).toHaveBeenCalledWith(createId, 'albumName', 'Madeira');
  });

  it('renders partially applied for failed operations with successful per-asset results', () => {
    render(AgentPlanOperationRow, {
      props: {
        item: buildOperationReviewModel(
          plan([
            operation({
              id: addId,
              type: AgentOperationType.AlbumAddAssets,
              summary: 'Add two assets',
              targetKind: AgentOperationTargetKind.NewAlbum,
              temporaryTargetId: 'album-portugal',
              assetIds: [assetA, assetB],
              status: AgentOperationStatus.Failed,
              result: {
                assetResults: [
                  { id: assetA, success: true },
                  { id: assetB, success: false, errorMessage: 'Asset is missing' },
                ],
              },
              error: 'Some assets could not be added',
              payload: {},
            }),
          ]),
          { [addId]: true },
          {},
        ).operationsById.get(addId)!,
        canChangeSelection: false,
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
        onSetFieldOverride: vi.fn(),
        onResetFieldOverride: vi.fn(),
      },
    });

    expect(screen.getByText('Partially applied')).toBeInTheDocument();
    expect(screen.getByText('1 applied · 1 failed')).toBeInTheDocument();
    expect(screen.queryByText('Some assets could not be added')).not.toBeInTheDocument();
  });

  it('announces failed operation errors as alerts', () => {
    render(AgentPlanOperationRow, {
      props: {
        item: buildOperationReviewModel(
          plan([
            operation({
              id: addId,
              type: AgentOperationType.AlbumAddAssets,
              summary: 'Add two assets',
              targetKind: AgentOperationTargetKind.NewAlbum,
              temporaryTargetId: 'album-portugal',
              assetIds: [assetA, assetB],
              status: AgentOperationStatus.Failed,
              error: 'Album no longer exists',
              payload: {},
            }),
          ]),
          { [addId]: true },
          {},
        ).operationsById.get(addId)!,
        canChangeSelection: false,
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
        onSetFieldOverride: vi.fn(),
        onResetFieldOverride: vi.fn(),
      },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Album no longer exists');
  });

  it('renders skipped reason from the operation result', () => {
    render(AgentPlanOperationRow, {
      props: {
        item: buildOperationReviewModel(
          plan([
            operation({
              id: addId,
              type: AgentOperationType.AlbumAddAssets,
              summary: 'Add two assets',
              targetKind: AgentOperationTargetKind.NewAlbum,
              temporaryTargetId: 'album-portugal',
              assetIds: [assetA, assetB],
              status: AgentOperationStatus.Skipped,
              result: { skippedReason: 'Dependency was not applied' },
              payload: {},
            }),
          ]),
          { [addId]: true },
          {},
        ).operationsById.get(addId)!,
        canChangeSelection: false,
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
        onSetFieldOverride: vi.fn(),
        onResetFieldOverride: vi.fn(),
      },
    });

    expect(screen.getByText('Skipped')).toBeInTheDocument();
    expect(screen.getByText('Skipped: Dependency was not applied')).toBeInTheDocument();
  });
});
