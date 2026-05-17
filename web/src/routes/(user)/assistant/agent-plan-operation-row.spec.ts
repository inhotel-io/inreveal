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
import { readable } from 'svelte/store';
import { buildOperationReviewModel } from './agent-operation-plan-ui';
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
    assistant_operation_detail_toggle: 'Details',
    assistant_operation_detail_type: 'Type',
    assistant_operation_risk_low: 'Low risk',
    assistant_operation_status_applied: 'Applied',
    assistant_operation_status_failed: 'Failed',
    assistant_operation_status_skipped: 'Skipped',
    assistant_operation_item_excluded_count: '{count} excluded',
    assistant_operation_item_overflow: '+{count} not shown',
    assistant_operation_item_overflow_label: '{count} more affected photos are not shown',
    assistant_operation_item_reset: 'Reset selection',
    assistant_operation_item_review_label: 'Review photos for {summary}',
    assistant_operation_item_selected_count: '{selected} of {total} selected',
    assistant_operation_item_thumbnail_alt: 'Photo {index} of {count}',
    assistant_operation_item_thumbnail_unavailable: 'Preview unavailable',
    assistant_operation_item_toggle: 'Include photo {index}',
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

const model = (enabledByOperationId = { [createId]: true, [addId]: true }, itemSelectionByOperationId = {}) =>
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
    enabledByOperationId,
    itemSelectionByOperationId,
  );

describe('AgentPlanOperationRow', () => {
  it('renders a human operation summary and dispatches operation toggle changes', async () => {
    const onToggleOperation = vi.fn();
    render(AgentPlanOperationRow, {
      props: {
        item: model().operationsById.get(addId)!,
        canChangeSelection: true,
        onToggleOperation,
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByRole('checkbox', { name: 'Add 2 photos' }));

    expect(screen.getByText('Add 2 photos')).toBeInTheDocument();
    expect(screen.getByText('2 of 2 photos selected')).toBeInTheDocument();
    expect(screen.queryByText('Add two assets')).not.toBeInTheDocument();
    expect(screen.queryByText(addId)).not.toBeInTheDocument();
    expect(onToggleOperation).toHaveBeenCalledWith(addId, false);
  });

  it('disables blocked operations and explains the dependency in user language', () => {
    render(AgentPlanOperationRow, {
      props: {
        item: model({ [createId]: false, [addId]: true }).operationsById.get(addId)!,
        canChangeSelection: true,
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
      },
    });

    expect(screen.getByRole('checkbox', { name: 'Add 2 photos' })).toBeDisabled();
    expect(screen.getByText('Blocked by Create Portugal album')).toBeInTheDocument();
  });

  it('keeps technical operation details hidden until the user expands details', async () => {
    render(AgentPlanOperationRow, {
      props: {
        item: model().operationsById.get(addId)!,
        canChangeSelection: true,
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
      },
    });

    expect(screen.queryByText(addId)).not.toBeInTheDocument();

    await fireEvent.click(screen.getByText('Details'));

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
      },
    });

    await fireEvent.click(screen.getByText('Details'));

    const itemReview = screen.getByRole('group', { name: 'Review photos for Add 2 photos' });
    const technicalDetail = screen.getByText('Operation ID');
    expect(itemReview.compareDocumentPosition(technicalDetail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await fireEvent.click(screen.getByRole('checkbox', { name: 'Include photo 2' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Reset selection' }));

    expect(onToggleItem).toHaveBeenCalledWith(addId, assetB, true);
    expect(onResetItemSelection).toHaveBeenCalledWith(addId);
  });
});
