import {
  AgentOperationPlanStatus,
  AgentOperationRiskLevel,
  AgentOperationStatus,
  AgentOperationTargetKind,
  AgentOperationType,
  type AgentOperationPlanResponseDto,
  type AgentOperationResponseDto,
} from '@immich/sdk';
import { render, screen, within } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import AgentAppliedPlanTimelineCard from './agent-applied-plan-timeline-card.svelte';

vi.mock('svelte-i18n', () => {
  const messages: Record<string, string> = {
    assistant_operation_applied_plan: 'Applied plan',
    assistant_operation_applied_plan_label: 'Applied plan: {summary}',
    assistant_operation_apply_partial_summary: '{applied} applied · {skipped} skipped · {failed} failed.',
    assistant_operation_asset_count: '{count} assets',
    assistant_operation_asset_selection_summary: '{selected} of {total} photos selected',
    assistant_operation_plan_destination_count: '{count} destinations',
    assistant_operation_plan_selected_asset_count: '{count} selected assets',
    assistant_operation_plan_selected_change_count: '{count} selected changes',
    assistant_operation_status_applied: 'Applied',
    assistant_operation_status_failed: 'Failed',
    assistant_operation_status_skipped: 'Skipped',
    assistant_operation_type_album_add_assets: 'Add assets',
    assistant_operation_type_album_create: 'Create album',
  };

  return {
    t: readable((key: string, options?: { values?: Record<string, string | number> }) =>
      (messages[key] ?? key)
        .replace('{summary}', String(options?.values?.summary ?? ''))
        .replace('{count}', String(options?.values?.count ?? ''))
        .replace('{selected}', String(options?.values?.selected ?? ''))
        .replace('{total}', String(options?.values?.total ?? ''))
        .replace('{applied}', String(options?.values?.applied ?? ''))
        .replace('{skipped}', String(options?.values?.skipped ?? ''))
        .replace('{failed}', String(options?.values?.failed ?? '')),
    ),
  };
});

const makeOperation = (overrides: Partial<AgentOperationResponseDto> = {}): AgentOperationResponseDto => ({
  id: overrides.id ?? 'operation-1',
  planId: overrides.planId ?? 'plan-1',
  type: overrides.type ?? AgentOperationType.AlbumCreate,
  summary: overrides.summary ?? 'Create Portugal album',
  targetKind: overrides.targetKind ?? AgentOperationTargetKind.NewAlbum,
  targetId: overrides.targetId ?? null,
  temporaryTargetId: overrides.temporaryTargetId ?? 'album-portugal',
  assetIds: overrides.assetIds ?? [],
  dependencyIds: overrides.dependencyIds ?? [],
  riskLevel: overrides.riskLevel ?? AgentOperationRiskLevel.Low,
  enabled: overrides.enabled ?? true,
  status: overrides.status ?? AgentOperationStatus.Applied,
  payload: overrides.payload ?? { albumName: 'Portugal' },
  result: overrides.result ?? { albumId: 'album-1' },
  error: overrides.error ?? null,
  createdAt: overrides.createdAt ?? '2026-05-16T10:01:00.000Z',
  updatedAt: overrides.updatedAt ?? '2026-05-16T10:01:00.000Z',
});

const makePlan = (overrides: Partial<AgentOperationPlanResponseDto> = {}): AgentOperationPlanResponseDto => ({
  id: overrides.id ?? 'plan-1',
  sessionId: overrides.sessionId ?? 'session-1',
  revision: overrides.revision ?? 1,
  status: overrides.status ?? AgentOperationPlanStatus.Applied,
  summary: overrides.summary ?? 'Organize Portugal holiday',
  operations: overrides.operations ?? [
    makeOperation({ id: 'operation-create', planId: overrides.id ?? 'plan-1' }),
    makeOperation({
      id: 'operation-add',
      planId: overrides.id ?? 'plan-1',
      type: AgentOperationType.AlbumAddAssets,
      summary: 'Add two photos',
      assetIds: ['asset-1', 'asset-2'],
      dependencyIds: ['operation-create'],
      payload: {},
    }),
  ],
  createdAt: overrides.createdAt ?? '2026-05-16T10:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2026-05-16T10:01:00.000Z',
});

describe(AgentAppliedPlanTimelineCard.name, () => {
  it('renders an applied plan as a structured read-only article', () => {
    render(AgentAppliedPlanTimelineCard, {
      props: {
        plan: makePlan({
          operations: [
            makeOperation({ id: 'operation-applied', status: AgentOperationStatus.Applied }),
            makeOperation({
              id: 'operation-skipped',
              type: AgentOperationType.AlbumAddAssets,
              status: AgentOperationStatus.Skipped,
              assetIds: ['asset-1'],
              payload: {},
              result: { skippedReason: 'Dependency failed' },
            }),
            makeOperation({
              id: 'operation-failed',
              type: AgentOperationType.AlbumAddAssets,
              status: AgentOperationStatus.Failed,
              assetIds: ['asset-2'],
              payload: {},
              error: 'Album owner changed before apply',
            }),
          ],
        }),
      },
    });

    const card = screen.getByRole('article', { name: 'Applied plan: Organize Portugal holiday' });
    expect(card).toHaveTextContent('Applied plan');
    expect(card).toHaveTextContent('Organize Portugal holiday');
    expect(card).toHaveTextContent('1 applied · 1 skipped · 1 failed.');
    expect(card).toHaveTextContent('Create album "Portugal"');
    expect(card).toHaveTextContent('Add 1 photo');
    expect(card).toHaveTextContent('Album owner changed before apply');
    expect(within(card).queryByRole('button', { name: /Apply/i })).not.toBeInTheDocument();
    expect(within(card).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(card).queryByRole('textbox')).not.toBeInTheDocument();
  });
});
