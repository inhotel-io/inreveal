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
import { buildOperationReviewModel } from './agent-operation-plan-ui';
import AgentPlanDestinationCard from './agent-plan-destination-card.svelte';

vi.mock('svelte-i18n', () => {
  const messages: Record<string, string> = {
    assistant_operation_asset_count: '{count} assets',
    assistant_operation_blocked_by: 'Blocked by {dependencies}',
    assistant_operation_destination_selected_summary: '{selected} of {total} changes selected',
    assistant_operation_destination_toggle: 'Select destination {name}',
    assistant_operation_detail_id: 'Operation ID',
    assistant_operation_detail_risk: 'Risk',
    assistant_operation_detail_status: 'Status',
    assistant_operation_detail_toggle: 'Details',
    assistant_operation_detail_type: 'Type',
    assistant_operation_thumbnail_alt: 'Photo preview {index} of {count}',
    assistant_operation_thumbnail_empty: '{count} photos without previews',
    assistant_operation_thumbnail_overflow: '+{count}',
    assistant_operation_thumbnail_overflow_label: '{count} more photos',
    assistant_operation_thumbnail_strip_label: '{count} photo previews',
    assistant_operation_thumbnail_unavailable: 'Preview unavailable',
    assistant_operation_risk_low: 'Low risk',
    assistant_operation_type_album_add_assets: 'Add assets',
    assistant_operation_type_album_create: 'Create album',
  };

  return {
    t: readable((key: string, options?: { values?: Record<string, string | number> }) =>
      (messages[key] ?? key)
        .replace('{count}', String(options?.values?.count ?? ''))
        .replace('{index}', String(options?.values?.index ?? ''))
        .replace('{selected}', String(options?.values?.selected ?? ''))
        .replace('{total}', String(options?.values?.total ?? ''))
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

const group = (enabledByOperationId = { [createId]: true, [addId]: true }) =>
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
  ).groups[0];

describe('AgentPlanDestinationCard', () => {
  it('renders destination evidence with compact operation and asset counts', () => {
    render(AgentPlanDestinationCard, {
      props: {
        group: group(),
        canChangeSelection: true,
        onToggleGroup: vi.fn(),
        onToggleOperation: vi.fn(),
      },
    });

    expect(screen.getByRole('region', { name: 'Portugal' })).toBeInTheDocument();
    expect(screen.getByText('Portugal')).toBeInTheDocument();
    expect(screen.getByText('New album')).toBeInTheDocument();
    const compactCounts = screen.getByText('2 of 2 changes selected').parentElement!;
    expect(within(compactCounts).getByText('2 assets')).toBeInTheDocument();
    const thumbnailStrip = screen.getByTestId('agent-plan-thumbnail-strip');
    expect(thumbnailStrip).toHaveAttribute('aria-label', '2 photo previews');
    expect(within(thumbnailStrip).getAllByTestId('agent-plan-thumbnail-image')).toHaveLength(2);
    expect(within(thumbnailStrip).queryByText(/\+\d+/)).not.toBeInTheDocument();
    expect(screen.getByText('Create album "Portugal"')).toBeInTheDocument();
    expect(screen.getByText('Add 2 photos')).toBeInTheDocument();
  });

  it('renders bounded thumbnails for a destination with 1,000 affected photos', () => {
    const largeAssetIds = Array.from({ length: 1_000 }, (_, index) => `large-asset-${index + 1}`);
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
      },
    });

    const thumbnailStrip = screen.getByTestId('agent-plan-thumbnail-strip');
    expect(within(thumbnailStrip).getAllByTestId('agent-plan-thumbnail-image')).toHaveLength(6);
    expect(within(thumbnailStrip).getByText('+994')).toBeInTheDocument();
    expect(screen.queryByText('large-asset-7')).not.toBeInTheDocument();
    expect(screen.queryByText('large-asset-13')).not.toBeInTheDocument();
  });

  it('sets mixed state when only some operations are selected', () => {
    render(AgentPlanDestinationCard, {
      props: {
        group: group({ [createId]: true, [addId]: false }),
        canChangeSelection: true,
        onToggleGroup: vi.fn(),
        onToggleOperation: vi.fn(),
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
      },
    });

    await fireEvent.click(screen.getByRole('checkbox', { name: 'Select destination Portugal' }));

    expect(onToggleGroup).toHaveBeenCalledWith(currentGroup, false);
  });
});
