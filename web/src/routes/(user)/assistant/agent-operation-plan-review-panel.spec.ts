import { sdkMock } from '$lib/__mocks__/sdk.mock';
import {
  AgentApprovalMode,
  AgentOperationApplyStatus,
  AgentOperationPlanStatus,
  AgentOperationRiskLevel,
  AgentOperationStatus,
  AgentOperationTargetKind,
  AgentOperationType,
  AgentPermissionPreset,
  AgentProviderType,
  AgentSessionStatus,
  type AgentOperationPlanResponseDto,
  type AgentOperationResponseDto,
  type AgentSessionResponseDto,
} from '@immich/sdk';
import { websocketMock } from '@test-data/mocks/websocket.mock';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import AgentOperationPlanReviewPanel from './agent-operation-plan-review-panel.svelte';

vi.mock('$lib/stores/websocket');

vi.mock('svelte-i18n', () => {
  const messages: Record<string, string> = {
    assistant_operation_asset_count: '{count} assets',
    assistant_operation_apply_applying: 'Applying operations',
    assistant_operation_apply_error: 'Unable to apply proposed operations',
    assistant_operation_apply_selected: 'Apply {count} selected',
    assistant_operation_apply_success: 'Applied {applied} operations. {failed} failed.',
    assistant_operation_blocked_by: 'Blocked by {dependencies}',
    assistant_operation_plan_empty: 'No proposed album plan yet.',
    assistant_operation_plan_error: 'Unable to load proposed album plan',
    assistant_operation_plan_loading: 'Loading proposed album plan',
    assistant_operation_plan_review: 'Plan review',
    assistant_operation_risk_high: 'High risk',
    assistant_operation_risk_low: 'Low risk',
    assistant_operation_risk_medium: 'Medium risk',
    assistant_operation_selected_count: '{count} selected',
    assistant_operation_type_album_add_assets: 'Add assets',
    assistant_operation_type_album_create: 'Create album',
    assistant_operation_type_album_set_cover: 'Set cover',
    assistant_operation_type_album_update_details: 'Update details',
  };

  return {
    t: readable((key: string, options?: { values?: Record<string, string | number> }) =>
      (messages[key] ?? key)
        .replace('{count}', String(options?.values?.count ?? ''))
        .replace('{applied}', String(options?.values?.applied ?? ''))
        .replace('{failed}', String(options?.values?.failed ?? ''))
        .replace('{dependencies}', String(options?.values?.dependencies ?? '')),
    ),
  };
});

const session: AgentSessionResponseDto = {
  id: '00000000-0000-4000-8000-000000000001',
  status: AgentSessionStatus.WaitingForPlanReview,
  providerCredentialId: '00000000-0000-4000-8000-000000000010',
  credentialSnapshot: {
    id: '00000000-0000-4000-8000-000000000010',
    providerType: AgentProviderType.Openai,
    label: 'OpenAI personal',
    baseUrl: null,
    models: ['gpt-5.1'],
    defaultModel: 'gpt-5.1',
  },
  modelSnapshot: { model: 'gpt-5.1', providerCredentialId: '00000000-0000-4000-8000-000000000010' },
  initialContextSnapshot: {},
  permissionPlanSnapshot: {
    assetScope: { locked: true, owned: true, sharedSpaces: false },
    limits: {
      expiresInMinutes: null,
      maxAssetsPerSession: 200,
      maxAssetsPerToolCall: 50,
      maxOriginalsPerToolCall: 10,
      maxPreviewsPerToolCall: 50,
    },
    providerExposure: { allowOriginalsForExternalProviders: false, metadata: true, originals: false, previews: true },
    read: { metadata: true, originals: false, previews: true },
    writeScope: { addAssets: true, createAlbum: true, setCover: true, updateDetails: true },
  },
  permissionPreset: AgentPermissionPreset.VisualOrganizer,
  approvalMode: AgentApprovalMode.PlanOnly,
  runnerCapabilitiesSnapshot: { protocolVersion: '2026-05-14', streaming: true, tools: [], models: [] },
  runnerEndpoint: 'http://agent-runner:4477',
  runnerSessionId: 'runner-session',
  createdAt: '2026-05-15T00:00:00.000Z',
  updatedAt: '2026-05-15T00:00:00.000Z',
  endedAt: null,
};

const planId = '00000000-0000-4000-8000-000000000100';
const createId = '00000000-0000-4000-8000-000000000101';
const addId = '00000000-0000-4000-8000-000000000102';
const existingId = '00000000-0000-4000-8000-000000000103';
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
): AgentOperationResponseDto => ({
  ...baseOperation,
  ...operation,
});

const plan = (operations: AgentOperationResponseDto[], revision = 1): AgentOperationPlanResponseDto => ({
  id: planId,
  sessionId: session.id,
  revision,
  status: AgentOperationPlanStatus.Proposed,
  summary: 'Organize Portugal holiday',
  operations,
  createdAt: '2026-05-15T00:00:00.000Z',
  updatedAt: '2026-05-15T00:00:00.000Z',
});

const samplePlan = () =>
  plan([
    operation({
      id: createId,
      type: AgentOperationType.AlbumCreate,
      summary: 'Create Portugal album',
      targetKind: AgentOperationTargetKind.NewAlbum,
      temporaryTargetId: 'album-portugal',
      payload: { albumName: 'Portugal', description: 'Lisbon and Porto' },
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
      id: existingId,
      type: AgentOperationType.AlbumUpdateDetails,
      summary: 'Update existing album description',
      targetKind: AgentOperationTargetKind.ExistingAlbum,
      targetId: '00000000-0000-4000-8000-000000000301',
      riskLevel: AgentOperationRiskLevel.Medium,
      payload: { description: 'Better description' },
    }),
  ]);

const appliedPlan = (): AgentOperationPlanResponseDto => ({
  ...samplePlan(),
  status: AgentOperationPlanStatus.Applied,
  operations: samplePlan().operations.map((operation) => ({
    ...operation,
    status: AgentOperationStatus.Applied,
    result: { albumId: '00000000-0000-4000-8000-000000000400' },
  })),
});

describe('AgentOperationPlanReviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    websocketMock.websocketEvents.on.mockReturnValue(vi.fn());
  });

  it('does not render a review region when the session has no current plan', async () => {
    sdkMock.getCurrentOperationPlan.mockResolvedValue(null);

    render(AgentOperationPlanReviewPanel, { props: { session } });

    expect(await screen.findByText('No proposed album plan yet.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Plan review' })).not.toBeInTheDocument();
  });

  it('loads and renders grouped proposed operations', async () => {
    sdkMock.getCurrentOperationPlan.mockResolvedValue(samplePlan());
    const onSelectionChange = vi.fn();

    render(AgentOperationPlanReviewPanel, { props: { session, onSelectionChange } });

    const region = await screen.findByRole('region', { name: 'Plan review' });
    expect(within(region).getByText('Organize Portugal holiday')).toBeInTheDocument();
    expect(within(region).getByText('New album "Portugal"')).toBeInTheDocument();
    expect(within(region).getByText('Create Portugal album')).toBeInTheDocument();
    expect(within(region).getByText('Add two assets')).toBeInTheDocument();
    expect(within(region).getByText('Update existing album description')).toBeInTheDocument();
    expect(within(region).getAllByText('3 selected')).not.toHaveLength(0);
    await waitFor(() =>
      expect(onSelectionChange).toHaveBeenLastCalledWith({
        planId,
        operationIds: [createId, addId, existingId],
      }),
    );
  });

  it('does not publish a selection when an in-flight load resolves after unmount', async () => {
    let resolveLoad: (plan: AgentOperationPlanResponseDto) => void;
    sdkMock.getCurrentOperationPlan.mockReturnValueOnce(
      new Promise<AgentOperationPlanResponseDto>((resolve) => {
        resolveLoad = resolve;
      }),
    );
    const onSelectionChange = vi.fn();

    const { unmount } = render(AgentOperationPlanReviewPanel, { props: { session, onSelectionChange } });
    await waitFor(() => expect(sdkMock.getCurrentOperationPlan).toHaveBeenCalledWith({ id: session.id }));

    unmount();
    resolveLoad!(samplePlan());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('disables dependent operations and removes them from the selection payload', async () => {
    sdkMock.getCurrentOperationPlan.mockResolvedValue(samplePlan());
    const onSelectionChange = vi.fn();

    render(AgentOperationPlanReviewPanel, { props: { session, onSelectionChange } });

    const createToggle = await screen.findByRole('checkbox', { name: 'Create Portugal album' });
    await fireEvent.click(createToggle);

    const addToggle = screen.getByRole('checkbox', { name: 'Add two assets' });
    expect(addToggle).toBeDisabled();
    expect(screen.getByText('Blocked by Create Portugal album')).toBeInTheDocument();
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      planId,
      operationIds: [existingId],
    });
  });

  it('toggles a whole operation group without changing other groups', async () => {
    sdkMock.getCurrentOperationPlan.mockResolvedValue(samplePlan());
    const onSelectionChange = vi.fn();

    render(AgentOperationPlanReviewPanel, { props: { session, onSelectionChange } });

    const groupToggle = await screen.findByRole('checkbox', { name: 'New album "Portugal"' });
    await fireEvent.click(groupToggle);

    expect(screen.getByRole('checkbox', { name: 'Create Portugal album' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Add two assets' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Update existing album description' })).toBeChecked();
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      planId,
      operationIds: [existingId],
    });
  });

  it('shows a mixed group checkbox state when only some child operations are enabled', async () => {
    sdkMock.getCurrentOperationPlan.mockResolvedValue(samplePlan());

    render(AgentOperationPlanReviewPanel, { props: { session } });

    const addToggle = await screen.findByRole('checkbox', { name: 'Add two assets' });
    await fireEvent.click(addToggle);

    const groupToggle = screen.getByRole('checkbox', { name: 'New album "Portugal"' }) as HTMLInputElement;
    expect(groupToggle).not.toBeChecked();
    expect(groupToggle.indeterminate).toBe(true);
    expect(groupToggle).toHaveAttribute('aria-checked', 'mixed');
  });

  it('applies the current approved operation selection', async () => {
    sdkMock.getCurrentOperationPlan.mockResolvedValue(samplePlan());
    sdkMock.applyApprovedOperations.mockResolvedValue({
      status: AgentOperationApplyStatus.Applied,
      plan: appliedPlan(),
      appliedOperationIds: [createId, addId, existingId],
      skippedOperationIds: [],
      failedOperationIds: [],
      summary: 'Applied 3 operation(s), skipped 0, failed 0.',
    });

    render(AgentOperationPlanReviewPanel, { props: { session } });

    await fireEvent.click(await screen.findByRole('button', { name: 'Apply 3 selected' }));

    expect(sdkMock.applyApprovedOperations).toHaveBeenCalledWith({
      id: session.id,
      planId,
      agentOperationPlanApplyRequestDto: { operationIds: [createId, addId, existingId] },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Applied 3 operations. 0 failed.');
    expect(screen.getByRole('button', { name: 'Apply 3 selected' })).toBeDisabled();
  });

  it('keeps local apply success visible when the same plan-applied event arrives', async () => {
    let handler: Parameters<typeof websocketMock.websocketEvents.on>[1] | undefined;
    websocketMock.websocketEvents.on.mockImplementation((_eventName, nextHandler) => {
      handler = nextHandler;
      return vi.fn();
    });
    sdkMock.getCurrentOperationPlan.mockResolvedValue(samplePlan());
    sdkMock.applyApprovedOperations.mockResolvedValue({
      status: AgentOperationApplyStatus.Applied,
      plan: appliedPlan(),
      appliedOperationIds: [createId, addId, existingId],
      skippedOperationIds: [],
      failedOperationIds: [],
      summary: 'Applied 3 operation(s), skipped 0, failed 0.',
    });

    render(AgentOperationPlanReviewPanel, { props: { session } });

    await fireEvent.click(await screen.findByRole('button', { name: 'Apply 3 selected' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Applied 3 operations. 0 failed.');

    handler?.({
      type: 'operation-plan-applied',
      sessionId: session.id,
      planId,
      status: AgentOperationApplyStatus.Applied,
      appliedCount: 3,
      skippedCount: 0,
      failedCount: 0,
    });

    expect(screen.getByRole('status')).toHaveTextContent('Applied 3 operations. 0 failed.');
    expect(screen.getByText('Organize Portugal holiday')).toBeInTheDocument();
    expect(screen.queryByText('No proposed album plan yet.')).not.toBeInTheDocument();
    expect(sdkMock.getCurrentOperationPlan).toHaveBeenCalledTimes(1);
  });

  it('ignores same-plan plan-applied events while local apply is pending', async () => {
    let handler: Parameters<typeof websocketMock.websocketEvents.on>[1] | undefined;
    let resolveApply: (response: Awaited<ReturnType<typeof sdkMock.applyApprovedOperations>>) => void;
    websocketMock.websocketEvents.on.mockImplementation((_eventName, nextHandler) => {
      handler = nextHandler;
      return vi.fn();
    });
    sdkMock.getCurrentOperationPlan.mockImplementation(() =>
      Promise.resolve(sdkMock.getCurrentOperationPlan.mock.calls.length === 1 ? samplePlan() : null),
    );
    sdkMock.applyApprovedOperations.mockReturnValue(
      new Promise((resolve) => {
        resolveApply = resolve;
      }),
    );

    render(AgentOperationPlanReviewPanel, { props: { session } });

    await fireEvent.click(await screen.findByRole('button', { name: 'Apply 3 selected' }));

    handler?.({
      type: 'operation-plan-applied',
      sessionId: session.id,
      planId,
      status: AgentOperationApplyStatus.Applied,
      appliedCount: 3,
      skippedCount: 0,
      failedCount: 0,
    });

    expect(sdkMock.getCurrentOperationPlan).toHaveBeenCalledTimes(1);

    resolveApply!({
      status: AgentOperationApplyStatus.Applied,
      plan: appliedPlan(),
      appliedOperationIds: [createId, addId, existingId],
      skippedOperationIds: [],
      failedOperationIds: [],
      summary: 'Applied 3 operation(s), skipped 0, failed 0.',
    });

    expect(await screen.findByRole('status')).toHaveTextContent('Applied 3 operations. 0 failed.');
    expect(screen.getByText('Organize Portugal holiday')).toBeInTheDocument();
    expect(screen.queryByText('No proposed album plan yet.')).not.toBeInTheDocument();
  });

  it('disables operation selection while applying and after the plan is applied', async () => {
    let resolveApply: (response: Awaited<ReturnType<typeof sdkMock.applyApprovedOperations>>) => void;
    sdkMock.getCurrentOperationPlan.mockResolvedValue(samplePlan());
    sdkMock.applyApprovedOperations.mockReturnValue(
      new Promise((resolve) => {
        resolveApply = resolve;
      }),
    );

    render(AgentOperationPlanReviewPanel, { props: { session } });

    await fireEvent.click(await screen.findByRole('button', { name: 'Apply 3 selected' }));

    expect(screen.getByRole('checkbox', { name: 'New album "Portugal"' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Create Portugal album' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Update existing album description' })).toBeDisabled();

    resolveApply!({
      status: AgentOperationApplyStatus.Applied,
      plan: appliedPlan(),
      appliedOperationIds: [createId, addId, existingId],
      skippedOperationIds: [],
      failedOperationIds: [],
      summary: 'Applied 3 operation(s), skipped 0, failed 0.',
    });

    expect(await screen.findByRole('status')).toHaveTextContent('Applied 3 operations. 0 failed.');
    expect(screen.getByRole('checkbox', { name: 'New album "Portugal"' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Create Portugal album' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Update existing album description' })).toBeDisabled();
  });

  it('sends only enabled and unblocked operation ids when applying', async () => {
    sdkMock.getCurrentOperationPlan.mockResolvedValue(samplePlan());
    sdkMock.applyApprovedOperations.mockResolvedValue({
      status: AgentOperationApplyStatus.PartiallyApplied,
      plan: samplePlan(),
      appliedOperationIds: [existingId],
      skippedOperationIds: [createId, addId],
      failedOperationIds: [],
      summary: 'Applied 1 operation(s), skipped 2, failed 0.',
    });

    render(AgentOperationPlanReviewPanel, { props: { session } });

    await fireEvent.click(await screen.findByRole('checkbox', { name: 'New album "Portugal"' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Apply 1 selected' }));

    expect(sdkMock.applyApprovedOperations).toHaveBeenCalledWith(
      expect.objectContaining({
        agentOperationPlanApplyRequestDto: { operationIds: [existingId] },
      }),
    );
  });

  it('disables apply when no operations are selected', async () => {
    sdkMock.getCurrentOperationPlan.mockResolvedValue(samplePlan());

    render(AgentOperationPlanReviewPanel, { props: { session } });

    await fireEvent.click(await screen.findByRole('checkbox', { name: 'New album "Portugal"' }));
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Update existing album description' }));

    expect(screen.getByRole('button', { name: 'Apply 0 selected' })).toBeDisabled();
    expect(sdkMock.applyApprovedOperations).not.toHaveBeenCalled();
  });

  it('shows an apply error without clearing the loaded plan', async () => {
    sdkMock.getCurrentOperationPlan.mockResolvedValue(samplePlan());
    sdkMock.applyApprovedOperations.mockRejectedValue(new Error('failed'));

    render(AgentOperationPlanReviewPanel, { props: { session } });

    await fireEvent.click(await screen.findByRole('button', { name: 'Apply 3 selected' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to apply proposed operations');
    expect(screen.getByText('Organize Portugal holiday')).toBeInTheDocument();
  });

  it('refetches the current plan for same-session plan-applied events from another client', async () => {
    let handler: Parameters<typeof websocketMock.websocketEvents.on>[1] | undefined;
    websocketMock.websocketEvents.on.mockImplementation((_eventName, nextHandler) => {
      handler = nextHandler;
      return vi.fn();
    });
    sdkMock.getCurrentOperationPlan.mockResolvedValueOnce(samplePlan()).mockResolvedValueOnce(null);

    render(AgentOperationPlanReviewPanel, { props: { session } });
    expect(await screen.findByText('Organize Portugal holiday')).toBeInTheDocument();

    handler?.({
      type: 'operation-plan-applied',
      sessionId: session.id,
      planId,
      status: AgentOperationApplyStatus.Applied,
      appliedCount: 3,
      skippedCount: 0,
      failedCount: 0,
    });

    expect(await screen.findByText('No proposed album plan yet.')).toBeInTheDocument();
    expect(sdkMock.getCurrentOperationPlan).toHaveBeenCalledTimes(2);
  });

  it('refetches the current plan for same-session plan-ready events', async () => {
    let handler: Parameters<typeof websocketMock.websocketEvents.on>[1] | undefined;
    websocketMock.websocketEvents.on.mockImplementation((_eventName, nextHandler) => {
      handler = nextHandler;
      return vi.fn();
    });
    sdkMock.getCurrentOperationPlan
      .mockResolvedValueOnce(samplePlan())
      .mockResolvedValueOnce({ ...samplePlan(), revision: 2, summary: 'Updated plan' });

    render(AgentOperationPlanReviewPanel, { props: { session } });
    expect(await screen.findByText('Organize Portugal holiday')).toBeInTheDocument();

    handler?.({
      type: 'operation-plan-ready',
      sessionId: session.id,
      planId,
      revision: 2,
    });

    expect(await screen.findByText('Updated plan')).toBeInTheDocument();
    expect(sdkMock.getCurrentOperationPlan).toHaveBeenCalledTimes(2);
  });

  it('ignores stale plan responses when a newer refresh completes first', async () => {
    let handler: Parameters<typeof websocketMock.websocketEvents.on>[1] | undefined;
    let resolveFirstLoad: (plan: AgentOperationPlanResponseDto) => void;
    websocketMock.websocketEvents.on.mockImplementation((_eventName, nextHandler) => {
      handler = nextHandler;
      return vi.fn();
    });
    sdkMock.getCurrentOperationPlan
      .mockReturnValueOnce(
        new Promise<AgentOperationPlanResponseDto>((resolve) => {
          resolveFirstLoad = resolve;
        }),
      )
      .mockResolvedValueOnce({ ...samplePlan(), revision: 2, summary: 'Newer plan' });

    render(AgentOperationPlanReviewPanel, { props: { session } });
    await waitFor(() => expect(handler).toBeDefined());

    handler?.({
      type: 'operation-plan-ready',
      sessionId: session.id,
      planId,
      revision: 2,
    });

    expect(await screen.findByText('Newer plan')).toBeInTheDocument();
    resolveFirstLoad!(samplePlan());

    await waitFor(() => expect(screen.queryByText('Organize Portugal holiday')).not.toBeInTheDocument());
    expect(screen.getByText('Newer plan')).toBeInTheDocument();
  });

  it('ignores plan-ready events for another session', async () => {
    let handler: Parameters<typeof websocketMock.websocketEvents.on>[1] | undefined;
    websocketMock.websocketEvents.on.mockImplementation((_eventName, nextHandler) => {
      handler = nextHandler;
      return vi.fn();
    });
    sdkMock.getCurrentOperationPlan.mockResolvedValue(samplePlan());

    render(AgentOperationPlanReviewPanel, { props: { session } });
    expect(await screen.findByText('Organize Portugal holiday')).toBeInTheDocument();

    handler?.({
      type: 'operation-plan-ready',
      sessionId: '00000000-0000-4000-8000-000000000999',
      planId,
      revision: 2,
    });

    await waitFor(() => expect(sdkMock.getCurrentOperationPlan).toHaveBeenCalledTimes(1));
  });

  it('ignores plan-applied events for another session', async () => {
    let handler: Parameters<typeof websocketMock.websocketEvents.on>[1] | undefined;
    websocketMock.websocketEvents.on.mockImplementation((_eventName, nextHandler) => {
      handler = nextHandler;
      return vi.fn();
    });
    sdkMock.getCurrentOperationPlan.mockResolvedValue(samplePlan());

    render(AgentOperationPlanReviewPanel, { props: { session } });
    expect(await screen.findByText('Organize Portugal holiday')).toBeInTheDocument();

    handler?.({
      type: 'operation-plan-applied',
      sessionId: '00000000-0000-4000-8000-000000000999',
      planId,
      status: AgentOperationApplyStatus.Applied,
      appliedCount: 3,
      skippedCount: 0,
      failedCount: 0,
    });

    await waitFor(() => expect(sdkMock.getCurrentOperationPlan).toHaveBeenCalledTimes(1));
  });

  it('shows a refresh error without clearing an already loaded plan', async () => {
    let handler: Parameters<typeof websocketMock.websocketEvents.on>[1] | undefined;
    websocketMock.websocketEvents.on.mockImplementation((_eventName, nextHandler) => {
      handler = nextHandler;
      return vi.fn();
    });
    sdkMock.getCurrentOperationPlan.mockResolvedValueOnce(samplePlan()).mockRejectedValueOnce(new Error('failed'));

    render(AgentOperationPlanReviewPanel, { props: { session } });
    expect(await screen.findByText('Organize Portugal holiday')).toBeInTheDocument();

    handler?.({
      type: 'operation-plan-ready',
      sessionId: session.id,
      planId,
      revision: 2,
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load proposed album plan');
    expect(screen.getByText('Organize Portugal holiday')).toBeInTheDocument();
  });

  it('shows a load error when the plan request fails', async () => {
    sdkMock.getCurrentOperationPlan.mockRejectedValue(new Error('failed'));

    render(AgentOperationPlanReviewPanel, { props: { session } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load proposed album plan');
  });

  it('cleans up websocket listener on destroy', () => {
    const cleanup = vi.fn();
    sdkMock.getCurrentOperationPlan.mockResolvedValue(samplePlan());
    websocketMock.websocketEvents.on.mockReturnValue(cleanup);

    const { unmount } = render(AgentOperationPlanReviewPanel, { props: { session } });
    unmount();

    expect(cleanup).toHaveBeenCalled();
  });
});
