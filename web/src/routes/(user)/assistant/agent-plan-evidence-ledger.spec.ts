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
import AgentPlanEvidenceLedger from './agent-plan-evidence-ledger.svelte';

vi.mock('$lib/utils', () => ({
  getAssetMediaUrl: ({ id, size }: { id: string; size: string }) => `/api/assets/${id}/thumbnail?size=${size}`,
}));

vi.mock('svelte-i18n', () => {
  const messages: Record<string, string> = {
    assistant_operation_apply_applying: 'Applying operations',
    assistant_operation_apply_selected: 'Apply {count} selected',
    assistant_operation_apply_summary: '{changes} changes · {assets} assets selected',
    assistant_operation_asset_count: '{count} assets',
    assistant_operation_asset_selection_summary: '{selected} of {total} photos selected',
    assistant_operation_blocked_by: 'Blocked by {dependencies}',
    assistant_operation_destination_selected_summary: '{selected} of {total} changes selected',
    assistant_operation_destination_toggle: 'Select destination {name}',
    assistant_operation_detail_id: 'Operation ID',
    assistant_operation_detail_risk: 'Risk',
    assistant_operation_detail_status: 'Status',
    assistant_operation_detail_toggle: 'Details',
    assistant_operation_detail_type: 'Type',
    assistant_operation_plan_destination_count: '{count} destinations',
    assistant_operation_plan_no_destructive_changes: 'No photos will be deleted',
    assistant_operation_plan_review: 'Plan review',
    assistant_operation_plan_selected_asset_count: '{count} selected assets',
    assistant_operation_plan_selected_change_count: '{count} selected changes',
    assistant_operation_item_excluded_count: '{count} excluded',
    assistant_operation_item_overflow: '+{count} not shown',
    assistant_operation_item_overflow_label: '{count} more affected photos are not shown',
    assistant_operation_item_reset: 'Reset selection',
    assistant_operation_item_review_label: 'Review photos for {summary}',
    assistant_operation_item_selected_count: '{selected} of {total} selected',
    assistant_operation_item_thumbnail_alt: 'Photo {index} of {count}',
    assistant_operation_item_thumbnail_unavailable: 'Preview unavailable',
    assistant_operation_item_toggle: 'Include photo {index}',
    assistant_operation_risk_low: 'Low risk',
    assistant_operation_type_album_add_assets: 'Add assets',
    assistant_operation_type_album_create: 'Create album',
    assistant_operation_type_album_update_details: 'Update album details',
  };

  return {
    t: readable((key: string, options?: { values?: Record<string, string | number> }) =>
      (messages[key] ?? key)
        .replace('{assets}', String(options?.values?.assets ?? ''))
        .replace('{changes}', String(options?.values?.changes ?? ''))
        .replace('{count}', String(options?.values?.count ?? ''))
        .replace('{dependencies}', String(options?.values?.dependencies ?? ''))
        .replace('{index}', String(options?.values?.index ?? ''))
        .replace('{name}', String(options?.values?.name ?? ''))
        .replace('{selected}', String(options?.values?.selected ?? ''))
        .replace('{total}', String(options?.values?.total ?? '')),
    ),
  };
});

const planId = '00000000-0000-4000-8000-000000000100';
const createId = '00000000-0000-4000-8000-000000000101';
const addId = '00000000-0000-4000-8000-000000000102';
const updateId = '00000000-0000-4000-8000-000000000103';
const assetA = '00000000-0000-4000-8000-000000000201';
const assetB = '00000000-0000-4000-8000-000000000202';
const existingAlbumId = '00000000-0000-4000-8000-000000000301';

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

const model = (itemSelectionByOperationId = {}) =>
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
      operation({
        id: updateId,
        type: AgentOperationType.AlbumUpdateDetails,
        summary: 'Update description',
        targetKind: AgentOperationTargetKind.ExistingAlbum,
        targetId: existingAlbumId,
        payload: { description: 'Better notes' },
      }),
    ]),
    { [createId]: true, [addId]: true, [updateId]: true },
    itemSelectionByOperationId,
  );

describe('AgentPlanEvidenceLedger', () => {
  it('renders the plan header, destination cards, and sticky apply summary without raw operation details', () => {
    render(AgentPlanEvidenceLedger, {
      props: {
        model: model(),
        selectedOperationIds: [createId, addId, updateId],
        canChangeSelection: true,
        canApply: true,
        applying: false,
        errorMessage: null,
        applyErrorMessage: null,
        applyMessage: null,
        onToggleGroup: vi.fn(),
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
        onApply: vi.fn(),
      },
    });

    expect(screen.getByRole('heading', { name: 'Plan review' })).toBeInTheDocument();
    expect(screen.getByText('Organize Portugal holiday')).toBeInTheDocument();
    expect(screen.getByText('2 destinations')).toBeInTheDocument();
    expect(screen.getByText('3 selected changes')).toBeInTheDocument();
    expect(screen.getByText('2 selected assets')).toBeInTheDocument();
    expect(screen.getByText('No photos will be deleted')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Portugal' })).toBeInTheDocument();
    expect(screen.queryByText('Create Portugal album')).not.toBeInTheDocument();
    expect(screen.queryByText('Add two assets')).not.toBeInTheDocument();
    expect(screen.queryByText('Update description')).not.toBeInTheDocument();
    expect(screen.queryByText('album-portugal')).not.toBeInTheDocument();
    expect(screen.queryByText(existingAlbumId)).not.toBeInTheDocument();
    expect(screen.queryByText('Better notes')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply 3 selected' })).toBeInTheDocument();
    expect(screen.getByText('3 changes · 2 assets selected')).toBeInTheDocument();
  });

  it('dispatches apply from the sticky apply bar', async () => {
    const onApply = vi.fn();
    render(AgentPlanEvidenceLedger, {
      props: {
        model: model(),
        selectedOperationIds: [createId, addId, updateId],
        canChangeSelection: true,
        canApply: true,
        applying: false,
        errorMessage: null,
        applyErrorMessage: null,
        applyMessage: null,
        onToggleGroup: vi.fn(),
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
        onApply,
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Apply 3 selected' }));

    expect(onApply).toHaveBeenCalledOnce();
  });

  it('can omit the ledger header when embedded inside the collapsible review panel', () => {
    render(AgentPlanEvidenceLedger, {
      props: {
        model: model(),
        selectedOperationIds: [createId, addId, updateId],
        canChangeSelection: true,
        canApply: true,
        applying: false,
        showHeader: false,
        errorMessage: null,
        applyErrorMessage: null,
        applyMessage: null,
        onToggleGroup: vi.fn(),
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
        onApply: vi.fn(),
      },
    });

    expect(screen.queryByRole('heading', { name: 'Plan review' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Portugal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply 3 selected' })).toBeInTheDocument();
  });

  it('renders an empty ledger shell without destination cards or an enabled apply action', () => {
    render(AgentPlanEvidenceLedger, {
      props: {
        model: buildOperationReviewModel(plan([]), {}),
        selectedOperationIds: [],
        canChangeSelection: true,
        canApply: false,
        applying: false,
        errorMessage: null,
        applyErrorMessage: null,
        applyMessage: null,
        onToggleGroup: vi.fn(),
        onToggleOperation: vi.fn(),
        onToggleItem: vi.fn(),
        onResetItemSelection: vi.fn(),
        onApply: vi.fn(),
      },
    });

    expect(screen.getByText('0 destinations')).toBeInTheDocument();
    expect(screen.getByText('0 selected changes')).toBeInTheDocument();
    expect(screen.getByText('0 selected assets')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Portugal' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply 0 selected' })).toBeDisabled();
  });

  it('uses selected asset counts after item exclusion and threads item callbacks', async () => {
    const onToggleItem = vi.fn();
    const onResetItemSelection = vi.fn();
    render(AgentPlanEvidenceLedger, {
      props: {
        model: model({ [addId]: { itemKind: 'asset', mode: 'allExcept', itemIds: [assetB] } }),
        selectedOperationIds: [createId, addId, updateId],
        canChangeSelection: true,
        canApply: true,
        applying: false,
        errorMessage: null,
        applyErrorMessage: null,
        applyMessage: null,
        onToggleGroup: vi.fn(),
        onToggleOperation: vi.fn(),
        onToggleItem,
        onResetItemSelection,
        onApply: vi.fn(),
      },
    });

    expect(screen.getByText('1 selected assets')).toBeInTheDocument();
    expect(screen.getByText('3 changes · 1 assets selected')).toBeInTheDocument();

    await fireEvent.click(screen.getAllByText('Details')[1]);
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Include photo 2' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Reset selection' }));

    expect(onToggleItem).toHaveBeenCalledWith(addId, assetB, true);
    expect(onResetItemSelection).toHaveBeenCalledWith(addId);
  });
});
