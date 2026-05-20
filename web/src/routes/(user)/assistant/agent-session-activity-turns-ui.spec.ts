import {
  AgentApprovalMode,
  AgentMessageRole,
  AgentMessageTextBlockType,
  AgentOperationPlanStatus,
  AgentOperationRiskLevel,
  AgentOperationStatus,
  AgentOperationTargetKind,
  AgentOperationType,
  AgentPermissionPreset,
  AgentProviderType,
  Kind as AgentSessionActivityEventKind,
  AgentSessionActivityEventSource,
  AgentSessionActivityEventStatus,
  AgentSessionStatus,
  AgentToolApprovalDecision,
  AgentToolCallStatus,
  AgentToolDataClass,
  AgentToolName,
  type AgentMessageResponseDto,
  type AgentOperationPlanResponseDto,
  type AgentOperationResponseDto,
  type AgentSessionResponseDto,
  type AgentToolCallResponseDto,
} from '@immich/sdk';
import {
  buildAgentSessionActivityTurns,
  getAppliedPlanKeysForActivityTurns,
  getCoveredToolCallIdsForActivityTurns,
  type AgentActivityEvent,
} from './agent-session-activity-turns-ui';

const sessionId = '00000000-0000-4000-8000-000000000100';

const makeSession = (overrides: Partial<AgentSessionResponseDto> = {}): AgentSessionResponseDto => ({
  id: overrides.id ?? sessionId,
  status: overrides.status ?? AgentSessionStatus.Running,
  providerCredentialId: overrides.providerCredentialId ?? '00000000-0000-4000-8000-000000000001',
  credentialSnapshot: overrides.credentialSnapshot ?? {
    id: '00000000-0000-4000-8000-000000000001',
    providerType: AgentProviderType.Openai,
    label: 'OpenAI personal',
    baseUrl: null,
    models: ['gpt-5.1'],
    defaultModel: 'gpt-5.1',
  },
  modelSnapshot: overrides.modelSnapshot ?? {
    model: 'gpt-5.1',
    providerCredentialId: '00000000-0000-4000-8000-000000000001',
  },
  initialContextSnapshot: overrides.initialContextSnapshot ?? {},
  permissionPlanSnapshot: overrides.permissionPlanSnapshot ?? {
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
    writeScope: {
      addAssets: true,
      addAssetsToSpaces: true,
      addMembersToSpaces: true,
      archiveAssets: true,
      createAlbum: true,
      createSpace: true,
      editAssets: true,
      favoriteAssets: true,
      removeAssets: true,
      removeAssetsFromSpaces: true,
      removeMembersFromSpaces: true,
      setCover: true,
      tagAssets: true,
      updateDetails: true,
      updateSpaceDetails: true,
      updateSpaceMemberRoles: true,
    },
  },
  permissionPreset: overrides.permissionPreset ?? AgentPermissionPreset.VisualOrganizer,
  approvalMode: overrides.approvalMode ?? AgentApprovalMode.AskOnEscalation,
  runnerCapabilitiesSnapshot: overrides.runnerCapabilitiesSnapshot ?? {
    protocolVersion: '2026-05-14',
    streaming: true,
    tools: ['echo'],
    models: [],
  },
  runnerEndpoint: overrides.runnerEndpoint ?? 'http://agent-runner:4477',
  runnerSessionId: overrides.runnerSessionId ?? 'stub-session',
  createdAt: overrides.createdAt ?? '2026-05-18T10:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2026-05-18T10:00:10.000Z',
  endedAt: overrides.endedAt ?? null,
});

const makeMessage = (overrides: Partial<AgentMessageResponseDto> = {}): AgentMessageResponseDto => ({
  id: overrides.id ?? 'message-1',
  sessionId: overrides.sessionId ?? sessionId,
  role: overrides.role ?? AgentMessageRole.User,
  providerMessageId: overrides.providerMessageId ?? null,
  toolCallId: overrides.toolCallId ?? null,
  content: overrides.content ?? {
    blocks: [{ type: AgentMessageTextBlockType.Text, text: 'Organize my photos' }],
  },
  createdAt: overrides.createdAt ?? '2026-05-18T10:00:00.000Z',
});

const makeToolCall = (overrides: Partial<AgentToolCallResponseDto> = {}): AgentToolCallResponseDto => ({
  id: overrides.id ?? 'tool-call-1',
  sessionId: overrides.sessionId ?? sessionId,
  toolName: overrides.toolName ?? AgentToolName.SearchAssets,
  status: overrides.status ?? AgentToolCallStatus.Completed,
  approvalDecision: overrides.approvalDecision ?? null,
  requestSummary: overrides.requestSummary ?? 'Search photos',
  responseSummary: overrides.responseSummary ?? 'Found matching photos',
  dataClass: overrides.dataClass ?? AgentToolDataClass.Metadata,
  assetCount: overrides.assetCount ?? 0,
  albumCount: overrides.albumCount ?? 0,
  startedAt: overrides.startedAt ?? '2026-05-18T10:00:05.000Z',
  completedAt: overrides.completedAt ?? '2026-05-18T10:00:07.000Z',
  error: overrides.error ?? null,
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
  createdAt: overrides.createdAt ?? '2026-05-18T10:01:00.000Z',
  updatedAt: overrides.updatedAt ?? '2026-05-18T10:01:00.000Z',
});

const makePlan = (overrides: Partial<AgentOperationPlanResponseDto> = {}): AgentOperationPlanResponseDto => ({
  id: overrides.id ?? 'plan-1',
  sessionId: overrides.sessionId ?? sessionId,
  revision: overrides.revision ?? 1,
  status: overrides.status ?? AgentOperationPlanStatus.Applied,
  summary: overrides.summary ?? 'Organize Portugal holiday',
  operations: overrides.operations ?? [makeOperation({ planId: overrides.id ?? 'plan-1' })],
  createdAt: overrides.createdAt ?? '2026-05-18T10:01:00.000Z',
  updatedAt: overrides.updatedAt ?? '2026-05-18T10:01:10.000Z',
});

type ActivityEventOverrides = Omit<Partial<AgentActivityEvent>, 'kind' | 'status' | 'source'> & {
  kind?: AgentActivityEvent['kind'] | string;
  status?: AgentActivityEvent['status'] | string;
  source?: AgentActivityEvent['source'] | string;
  totalCount?: number | null;
  appliedCount?: number | null;
  skippedCount?: number | null;
  failedCount?: number | null;
};

const makeActivityEvent = (overrides: ActivityEventOverrides = {}): AgentActivityEvent => ({
  id: overrides.id ?? 'activity-event-1',
  sessionId: overrides.sessionId ?? sessionId,
  kind: (overrides.kind ?? AgentSessionActivityEventKind.StartProcessing) as AgentActivityEvent['kind'],
  status: (overrides.status ?? AgentSessionActivityEventStatus.Running) as AgentActivityEvent['status'],
  summary: overrides.summary ?? null,
  source: (overrides.source ?? AgentSessionActivityEventSource.Server) as AgentActivityEvent['source'],
  counts:
    overrides.counts ??
    (overrides.totalCount == null &&
    overrides.appliedCount == null &&
    overrides.skippedCount == null &&
    overrides.failedCount == null
      ? null
      : {
          total: overrides.totalCount ?? undefined,
          applied: overrides.appliedCount ?? undefined,
          skipped: overrides.skippedCount ?? undefined,
          failed: overrides.failedCount ?? undefined,
        }),
  createdAt: overrides.createdAt ?? '2026-05-18T10:00:01.000Z',
});

const buildTurns = (overrides: Partial<Parameters<typeof buildAgentSessionActivityTurns>[0]> = {}) =>
  buildAgentSessionActivityTurns({
    session: makeSession(),
    messages: [],
    toolCalls: [],
    currentPlan: null,
    appliedPlans: [],
    activityEvents: [],
    ...overrides,
  });

describe('agent session activity turn helpers', () => {
  it('reconstructs a completed single-turn tool summary after reload', () => {
    const turns = buildTurns({
      messages: [
        makeMessage({ id: 'user-1', createdAt: '2026-05-18T10:00:00.000Z' }),
        makeMessage({
          id: 'assistant-1',
          role: AgentMessageRole.Assistant,
          createdAt: '2026-05-18T10:00:20.000Z',
        }),
      ],
      toolCalls: [
        makeToolCall({
          id: 'search-1',
          toolName: AgentToolName.SearchAssets,
          assetCount: 12,
          startedAt: '2026-05-18T10:00:05.000Z',
        }),
      ],
    });

    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ anchorMessageId: 'user-1', occurredAt: '2026-05-18T10:00:00.000Z' });
    expect(turns[0].model.items).toEqual([
      expect.objectContaining({
        kind: 'search',
        status: 'completed',
        title: 'Searching photos',
        count: 12,
      }),
    ]);
    expect([...turns[0].coveredToolCallIds]).toEqual(['search-1']);
    expect([...getCoveredToolCallIdsForActivityTurns(turns)]).toEqual(['search-1']);
  });

  it('keeps activity separated across multiple user turns', () => {
    const turns = buildTurns({
      messages: [
        makeMessage({ id: 'user-a', createdAt: '2026-05-18T10:00:00.000Z' }),
        makeMessage({ id: 'assistant-a', role: AgentMessageRole.Assistant, createdAt: '2026-05-18T10:00:20.000Z' }),
        makeMessage({ id: 'user-b', createdAt: '2026-05-18T10:01:00.000Z' }),
        makeMessage({ id: 'assistant-b', role: AgentMessageRole.Assistant, createdAt: '2026-05-18T10:01:20.000Z' }),
      ],
      toolCalls: [
        makeToolCall({ id: 'tool-a', startedAt: '2026-05-18T10:00:05.000Z' }),
        makeToolCall({
          id: 'tool-b',
          toolName: AgentToolName.ReadAssetMetadata,
          assetCount: 4,
          startedAt: '2026-05-18T10:01:05.000Z',
        }),
      ],
    });

    expect(turns.map((turn) => turn.anchorMessageId)).toEqual(['user-a', 'user-b']);
    expect(turns.map((turn) => [...turn.coveredToolCallIds])).toEqual([['tool-a'], ['tool-b']]);
    expect(turns[0].model.items).toEqual([expect.objectContaining({ kind: 'search' })]);
    expect(turns[1].model.items).toEqual([expect.objectContaining({ kind: 'metadata', count: 4 })]);
  });

  it('does not fold tool calls after a terminal assistant response into that completed turn', () => {
    const turns = buildTurns({
      messages: [
        makeMessage({ id: 'user-a', createdAt: '2026-05-18T10:00:00.000Z' }),
        makeMessage({ id: 'assistant-a', role: AgentMessageRole.Assistant, createdAt: '2026-05-18T10:00:10.000Z' }),
        makeMessage({ id: 'user-b', createdAt: '2026-05-18T10:00:30.000Z' }),
      ],
      toolCalls: [
        makeToolCall({ id: 'tool-a', startedAt: '2026-05-18T10:00:05.000Z' }),
        makeToolCall({ id: 'late-tool', startedAt: '2026-05-18T10:00:20.000Z' }),
      ],
    });

    expect(turns).toHaveLength(1);
    expect([...turns[0].coveredToolCallIds]).toEqual(['tool-a']);
    expect(getCoveredToolCallIdsForActivityTurns(turns).has('late-tool')).toBe(false);
  });

  it('reconstructs pending approval reloads as blocked activity', () => {
    const turns = buildTurns({
      session: makeSession({ status: AgentSessionStatus.WaitingForToolApproval }),
      messages: [makeMessage({ id: 'user-1' })],
      toolCalls: [
        makeToolCall({
          id: 'metadata-approval',
          toolName: AgentToolName.ReadAssetMetadata,
          status: AgentToolCallStatus.PendingApproval,
          responseSummary: null,
          completedAt: null,
        }),
      ],
    });

    expect(turns).toHaveLength(1);
    expect(turns[0].model.items).toEqual([
      expect.objectContaining({ kind: 'permission', status: 'blocked', title: 'Waiting for approval' }),
    ]);
    expect(turns[0].model.activeItem).toMatchObject({ status: 'blocked' });
  });

  it.each([
    [AgentToolCallStatus.Failed, 'failed', 'Gallery step failed'],
    [AgentToolCallStatus.Denied, 'skipped', 'Skipped this step'],
    [AgentToolCallStatus.Approved, 'running', 'Searching photos'],
  ] as const)('reconstructs %s tool reload state', (status, activityStatus, summary) => {
    const turns = buildTurns({
      messages: [makeMessage({ id: 'user-1' })],
      toolCalls: [
        makeToolCall({
          id: `tool-${status}`,
          status,
          approvalDecision:
            status === AgentToolCallStatus.Approved
              ? AgentToolApprovalDecision.Approved
              : AgentToolApprovalDecision.Denied,
          responseSummary: status === AgentToolCallStatus.Approved ? null : '',
          error: status === AgentToolCallStatus.Failed ? 'Provider timed out' : null,
          completedAt: status === AgentToolCallStatus.Approved ? null : '2026-05-18T10:00:07.000Z',
        }),
      ],
    });

    expect(turns[0].model.items).toEqual([expect.objectContaining({ status: activityStatus, summary })]);
  });

  it('attaches applied plan activity to the preceding user turn even after assistant plan text', () => {
    const turns = buildTurns({
      messages: [
        makeMessage({ id: 'user-1', createdAt: '2026-05-18T10:00:00.000Z' }),
        makeMessage({ id: 'assistant-1', role: AgentMessageRole.Assistant, createdAt: '2026-05-18T10:00:20.000Z' }),
      ],
      appliedPlans: [
        makePlan({
          id: 'plan-1',
          revision: 2,
          updatedAt: '2026-05-18T10:00:40.000Z',
        }),
      ],
    });

    expect(turns).toHaveLength(1);
    expect(turns[0].model.items).toEqual([
      expect.objectContaining({ kind: 'apply', status: 'completed', title: 'Applying changes', count: 1 }),
    ]);
    expect([...turns[0].appliedPlanKeys]).toEqual(['plan-1:2']);
    expect([...getAppliedPlanKeysForActivityTurns(turns)]).toEqual(['plan-1:2']);
  });

  it('anchors explicit activity events to turns and dedupes history with live events', () => {
    const turns = buildTurns({
      messages: [
        makeMessage({ id: 'user-a', createdAt: '2026-05-18T10:00:00.000Z' }),
        makeMessage({ id: 'assistant-a', role: AgentMessageRole.Assistant, createdAt: '2026-05-18T10:00:20.000Z' }),
        makeMessage({ id: 'user-b', createdAt: '2026-05-18T10:01:00.000Z' }),
      ],
      activityEvents: [
        makeActivityEvent({ id: 'before-first-user', createdAt: '2026-05-18T09:59:59.000Z' }),
        makeActivityEvent({ id: 'start-a', kind: 'start-processing', createdAt: '2026-05-18T10:00:01.000Z' }),
        makeActivityEvent({ id: 'late-after-terminal', createdAt: '2026-05-18T10:00:30.000Z' }),
        makeActivityEvent({
          id: 'apply-b',
          kind: 'apply-progress',
          status: 'running',
          totalCount: 3,
          appliedCount: 1,
          createdAt: '2026-05-18T10:01:05.000Z',
        }),
        makeActivityEvent({
          id: 'apply-b',
          kind: 'apply-progress',
          status: 'running',
          totalCount: 3,
          appliedCount: 1,
          createdAt: '2026-05-18T10:01:05.000Z',
        }),
      ],
    });

    expect(turns.map((turn) => turn.anchorMessageId)).toEqual(['user-a', 'user-b']);
    expect(turns[0].model.items).toEqual([expect.objectContaining({ id: 'event-start-a', kind: 'understanding' })]);
    expect(turns[1].model.items).toEqual([expect.objectContaining({ id: 'event-apply-b', kind: 'apply', count: 3 })]);
    expect(turns.flatMap((turn) => turn.model.items.map((item) => item.id))).not.toContain('event-before-first-user');
    expect(turns.flatMap((turn) => turn.model.items.map((item) => item.id))).not.toContain('event-late-after-terminal');
    expect(turns[1].model.items).toHaveLength(1);
  });

  it('attaches missing timestamp tool calls only when there is a single user turn', () => {
    expect(
      buildTurns({
        messages: [makeMessage({ id: 'only-user' })],
        toolCalls: [makeToolCall({ id: 'legacy-tool', startedAt: 'not-a-date', completedAt: 'also-not-a-date' })],
      })[0].coveredToolCallIds.has('legacy-tool'),
    ).toBe(true);

    const multiTurn = buildTurns({
      messages: [
        makeMessage({ id: 'user-a', createdAt: '2026-05-18T10:00:00.000Z' }),
        makeMessage({ id: 'user-b', createdAt: '2026-05-18T10:01:00.000Z' }),
      ],
      toolCalls: [makeToolCall({ id: 'ambiguous-tool', startedAt: 'not-a-date', completedAt: 'also-not-a-date' })],
    });

    expect(getCoveredToolCallIdsForActivityTurns(multiTurn).has('ambiguous-tool')).toBe(false);
  });

  it('does not invent activity turns without user anchors', () => {
    const turns = buildTurns({
      messages: [makeMessage({ id: 'assistant-1', role: AgentMessageRole.Assistant })],
      toolCalls: [makeToolCall({ id: 'tool-1' })],
      appliedPlans: [makePlan()],
    });

    expect(turns).toEqual([]);
  });
});
