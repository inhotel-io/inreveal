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
  AgentSessionActivityEventSource,
  AgentSessionActivityEventStatus,
  AgentSessionStatus,
  AgentToolCallStatus,
  AgentToolDataClass,
  AgentToolName,
  Kind as AgentSessionActivityEventKind,
  type AgentMessageResponseDto,
  type AgentOperationPlanResponseDto,
  type AgentOperationResponseDto,
  type AgentSessionResponseDto,
  type AgentToolCallResponseDto,
} from '@immich/sdk';
import {
  buildAgentActivityModel,
  buildAgentActivityTechnicalRows,
  redactAgentActivityTechnicalText,
  type AgentActivityEvent,
} from './agent-activity-ui';

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
      archiveAssets: true,
      createAlbum: true,
      createSpace: true,
      editAssets: true,
      favoriteAssets: true,
      removeAssets: true,
      removeAssetsFromSpaces: true,
      setCover: true,
      tagAssets: true,
      updateDetails: true,
      updateSpaceDetails: true,
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
    blocks: [{ type: AgentMessageTextBlockType.Text, text: 'Organize my Portugal photos' }],
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
  status: overrides.status ?? AgentOperationStatus.Proposed,
  payload: overrides.payload ?? { albumName: 'Portugal' },
  result: overrides.result ?? null,
  error: overrides.error ?? null,
  createdAt: overrides.createdAt ?? '2026-05-18T10:01:00.000Z',
  updatedAt: overrides.updatedAt ?? '2026-05-18T10:01:00.000Z',
});

const makePlan = (overrides: Partial<AgentOperationPlanResponseDto> = {}): AgentOperationPlanResponseDto => ({
  id: overrides.id ?? 'plan-1',
  sessionId: overrides.sessionId ?? sessionId,
  revision: overrides.revision ?? 1,
  status: overrides.status ?? AgentOperationPlanStatus.Proposed,
  summary: overrides.summary ?? 'Organize Portugal holiday',
  operations: overrides.operations ?? [makeOperation()],
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

const buildModel = (
  overrides: Partial<Parameters<typeof buildAgentActivityModel>[0]> = {},
): ReturnType<typeof buildAgentActivityModel> =>
  buildAgentActivityModel({
    session: makeSession(),
    messages: [],
    toolCalls: [],
    currentPlan: null,
    appliedPlans: [],
    activityEvents: [],
    ...overrides,
  });

describe('agent activity UI helpers', () => {
  it.each([
    [AgentToolName.SearchAssets, 'search', 'Searching photos', 'Found matching photos'],
    [AgentToolName.ReadAssetMetadata, 'metadata', 'Reading photo details', 'Read details for photos'],
    [AgentToolName.ReadAssetPreviews, 'preview', 'Loading photo previews', 'Loaded photo previews'],
    [AgentToolName.ReadAssetOriginals, 'preview', 'Opening original files', 'Opened original files'],
    [AgentToolName.ListAlbums, 'album', 'Searching albums', 'Found matching albums'],
    [AgentToolName.ReadAlbum, 'album', 'Reading album details', 'Read album details'],
    [AgentToolName.ProposeAlbumOperations, 'plan', 'Preparing a plan', 'Prepared a plan'],
    [AgentToolName.ReviseProposedOperations, 'plan', 'Revising the plan', 'Revised the plan'],
    [AgentToolName.SummarizePlan, 'plan', 'Summarizing the plan', 'Summarized the plan'],
  ] as const)('maps %s to safe activity copy', (toolName, kind, title, summary) => {
    const model = buildModel({
      toolCalls: [makeToolCall({ toolName, status: AgentToolCallStatus.Completed, responseSummary: null })],
    });

    expect(model.items).toHaveLength(1);
    expect(model.items[0]).toMatchObject({
      kind,
      status: 'completed',
      title,
      summary,
    });
    expect(`${model.items[0].title} ${model.items[0].summary}`).not.toContain(toolName);
    expect(model.items[0].technical?.toolName).toBe(toolName);
  });

  it.each([
    [AgentToolCallStatus.Approved, 'running'],
    [AgentToolCallStatus.Executing, 'running'],
    [AgentToolCallStatus.Completed, 'completed'],
    [AgentToolCallStatus.Failed, 'failed'],
    [AgentToolCallStatus.Denied, 'skipped'],
  ] as const)('maps %s tool calls to %s activity', (toolStatus, activityStatus) => {
    const model = buildModel({ toolCalls: [makeToolCall({ status: toolStatus })] });

    expect(model.items[0]).toMatchObject({ status: activityStatus });
  });

  it('maps pending tool calls to a blocked permission row without exposing raw tool names', () => {
    const model = buildModel({
      toolCalls: [
        makeToolCall({
          toolName: AgentToolName.ReadAssetMetadata,
          status: AgentToolCallStatus.PendingApproval,
          requestSummary: 'Read 12 photo metadata records',
          responseSummary: null,
          completedAt: null,
        }),
      ],
    });

    expect(model.items).toHaveLength(1);
    expect(model.items[0]).toMatchObject({
      kind: 'permission',
      status: 'blocked',
      title: 'Waiting for approval',
      summary: 'Needs your approval to continue',
    });
    expect(`${model.items[0].title} ${model.items[0].summary}`).not.toContain('readAssetMetadata');
    expect(model.items[0].technical?.toolName).toBe(AgentToolName.ReadAssetMetadata);
    expect(model.activeItem?.id).toBe(model.items[0].id);
  });

  it('coalesces repeated read calls with aggregate counts and running status precedence', () => {
    const model = buildModel({
      toolCalls: [
        makeToolCall({
          id: 'metadata-2',
          toolName: AgentToolName.ReadAssetMetadata,
          assetCount: 4,
          startedAt: '2026-05-18T10:00:10.000Z',
          completedAt: '2026-05-18T10:00:12.000Z',
        }),
        makeToolCall({
          id: 'metadata-1',
          toolName: AgentToolName.ReadAssetMetadata,
          assetCount: 8,
          startedAt: '2026-05-18T10:00:01.000Z',
          completedAt: '2026-05-18T10:00:03.000Z',
        }),
        makeToolCall({
          id: 'metadata-running',
          toolName: AgentToolName.ReadAssetMetadata,
          status: AgentToolCallStatus.Executing,
          assetCount: 2,
          startedAt: '2026-05-18T10:00:05.000Z',
          completedAt: null,
          responseSummary: null,
        }),
        makeToolCall({
          id: 'preview-1',
          toolName: AgentToolName.ReadAssetPreviews,
          dataClass: AgentToolDataClass.Previews,
          assetCount: 3,
          startedAt: '2026-05-18T10:00:06.000Z',
          completedAt: '2026-05-18T10:00:08.000Z',
        }),
        makeToolCall({
          id: 'preview-2',
          toolName: AgentToolName.ReadAssetPreviews,
          dataClass: AgentToolDataClass.Previews,
          assetCount: 5,
          startedAt: '2026-05-18T10:00:09.000Z',
          completedAt: '2026-05-18T10:00:11.000Z',
        }),
      ],
    });

    const metadata = model.items.find((item) => item.kind === 'metadata');
    const preview = model.items.find((item) => item.kind === 'preview');

    expect(metadata).toMatchObject({
      status: 'running',
      count: 14,
      startedAt: '2026-05-18T10:00:01.000Z',
    });
    expect(metadata).not.toHaveProperty('completedAt');
    expect(metadata?.technical?.toolCallIds).toEqual(['metadata-1', 'metadata-running', 'metadata-2']);
    expect(preview).toMatchObject({
      status: 'completed',
      count: 8,
      startedAt: '2026-05-18T10:00:06.000Z',
      completedAt: '2026-05-18T10:00:11.000Z',
    });
  });

  it('derives plan, apply, and writing rows from session state and plans', () => {
    const proposedPlan = makePlan({
      operations: [
        makeOperation({ id: 'operation-1' }),
        makeOperation({ id: 'operation-2', type: AgentOperationType.AlbumAddAssets, assetIds: ['asset-1'] }),
      ],
    });
    const appliedPlan = makePlan({
      id: 'applied-plan',
      status: AgentOperationPlanStatus.Applied,
      operations: [makeOperation({ id: 'applied-operation', status: AgentOperationStatus.Applied })],
      createdAt: '2026-05-18T10:02:00.000Z',
      updatedAt: '2026-05-18T10:02:10.000Z',
    });

    expect(
      buildModel({ currentPlan: proposedPlan }).items.find((item) => item.kind === 'plan'),
    ).toMatchObject({
      status: 'completed',
      title: 'Preparing a plan',
      summary: 'Prepared a plan',
      count: 2,
    });
    expect(
      buildModel({ session: makeSession({ status: AgentSessionStatus.WaitingForPlanReview }), currentPlan: null }).items,
    ).toEqual([expect.objectContaining({ kind: 'plan', status: 'completed', title: 'Preparing a plan' })]);
    expect(buildModel({ session: makeSession({ status: AgentSessionStatus.Applying }) }).items).toEqual([
      expect.objectContaining({ kind: 'apply', status: 'running', title: 'Applying changes' }),
    ]);
    expect(buildModel({ appliedPlans: [appliedPlan] }).items).toEqual([
      expect.objectContaining({ kind: 'apply', status: 'completed', title: 'Applying changes', count: 1 }),
    ]);
    expect(buildModel({ isAssistantActive: true }).items).toEqual([
      expect.objectContaining({ kind: 'message', status: 'running', title: 'Writing response' }),
    ]);
    expect(buildModel({ streamingText: 'Working on it' }).activeItem).toMatchObject({ kind: 'message' });
  });

  it('maps explicit lifecycle activity events to safe user-facing rows', () => {
    const model = buildModel({
      activityEvents: [
        makeActivityEvent({ id: 'start', kind: 'start-processing', status: 'running' }),
        makeActivityEvent({
          id: 'plan',
          kind: 'plan-composing',
          status: 'completed',
          summary: 'system prompt: private provider instructions',
          createdAt: '2026-05-18T10:00:02.000Z',
        }),
        makeActivityEvent({
          id: 'apply',
          kind: 'apply-progress',
          status: 'running',
          totalCount: 5,
          appliedCount: 2,
          skippedCount: 1,
          failedCount: 0,
          createdAt: '2026-05-18T10:00:03.000Z',
        }),
        makeActivityEvent({
          id: 'recovery',
          kind: 'runner-recovery',
          status: 'running',
          summary: 'Bearer secret-token',
          createdAt: '2026-05-18T10:00:04.000Z',
        }),
        makeActivityEvent({
          id: 'future',
          kind: 'unknown',
          status: 'skipped',
          summary: 'Future safe summary',
          createdAt: '2026-05-18T10:00:05.000Z',
        }),
      ],
    });

    expect(model.items).toEqual([
      expect.objectContaining({
        id: 'event-start',
        kind: 'understanding',
        status: 'running',
        title: 'Understanding request',
        summary: 'Getting started',
      }),
      expect.objectContaining({
        id: 'event-plan',
        kind: 'plan',
        status: 'completed',
        title: 'Preparing a plan',
        summary: 'Prepared a plan',
      }),
      expect.objectContaining({
        id: 'event-apply',
        kind: 'apply',
        status: 'running',
        title: 'Applying changes',
        summary: 'Applied 2 of 5 changes',
        count: 5,
      }),
      expect.objectContaining({
        id: 'event-recovery',
        kind: 'message',
        status: 'running',
        title: 'Resuming work',
        summary: 'Resuming after a pause',
      }),
      expect.objectContaining({
        id: 'event-future',
        kind: 'unknown',
        status: 'skipped',
        title: 'Working with Gallery',
        summary: 'Skipped this step',
      }),
    ]);
    expect(model.items[1].technical?.requestSummary).toBe('[redacted unsafe prompt/reasoning text]');
    expect(model.items[3].technical?.requestSummary).toContain('[redacted]');
    expect(model.items[3].technical?.requestSummary).not.toContain('secret-token');
    expect(model.activeItem?.id).toBe('event-start');
  });

  it('keeps tool-call and current-plan evidence primary over duplicate explicit events', () => {
    const model = buildModel({
      toolCalls: [
        makeToolCall({
          id: 'plan-tool',
          toolName: AgentToolName.ProposeAlbumOperations,
          startedAt: '2026-05-18T10:00:02.000Z',
          completedAt: '2026-05-18T10:00:04.000Z',
        }),
      ],
      currentPlan: makePlan({
        createdAt: '2026-05-18T10:00:05.000Z',
        updatedAt: '2026-05-18T10:00:06.000Z',
      }),
      activityEvents: [
        makeActivityEvent({
          id: 'plan-composing',
          kind: 'plan-composing',
          status: 'running',
          createdAt: '2026-05-18T10:00:01.000Z',
        }),
      ],
    });

    expect(model.items.filter((item) => item.kind === 'plan')).toHaveLength(1);
    expect(model.items.find((item) => item.kind === 'plan')).toMatchObject({
      id: 'tool-plan-plan-tool',
      status: 'completed',
      summary: 'Prepared a plan',
    });
  });

  it('uses deterministic ordering for same timestamps and malformed timestamps', () => {
    const model = buildModel({
      toolCalls: [
        makeToolCall({
          id: 'z-unknown-time',
          toolName: 'futureTool' as AgentToolName,
          startedAt: 'not-a-date',
          completedAt: null,
        }),
        makeToolCall({
          id: 'metadata-same-time',
          toolName: AgentToolName.ReadAssetMetadata,
          startedAt: '2026-05-18T10:00:00.000Z',
          completedAt: null,
        }),
        makeToolCall({
          id: 'search-same-time',
          toolName: AgentToolName.SearchAssets,
          startedAt: '2026-05-18T10:00:00.000Z',
          completedAt: null,
        }),
      ],
    });

    expect(model.items.map((item) => item.id)).toEqual([
      'tool-search-search-same-time',
      'tool-metadata-metadata-same-time',
      'tool-unknown-z-unknown-time',
    ]);
  });

  it('keeps unknown tool names and sensitive details out of default copy', () => {
    const model = buildModel({
      toolCalls: [
        makeToolCall({
          id: 'unknown',
          toolName: 'futureDangerTool' as AgentToolName,
          status: AgentToolCallStatus.Failed,
          requestSummary:
            'Read asset 00000000-0000-4000-8000-000000000001 with api_key=abc123 and Bearer secret-token',
          responseSummary: null,
          error: 'provider key sk-123456 failed with token=topsecret',
          assetCount: 10_000,
        }),
      ],
    });

    expect(model.items[0]).toMatchObject({
      kind: 'unknown',
      status: 'failed',
      title: 'Working with Gallery',
      summary: 'Gallery step failed',
      count: 10_000,
    });
    expect(`${model.items[0].title} ${model.items[0].summary}`).not.toContain('futureDangerTool');
    expect(`${model.items[0].title} ${model.items[0].summary}`).not.toContain('00000000-0000-4000-8000');
    expect(model.items[0].technical?.toolName).toBe('futureDangerTool');
    expect(model.items[0].technical?.requestSummary).not.toContain('abc123');
    expect(model.items[0].technical?.requestSummary).not.toContain('secret-token');
    expect(model.items[0].technical?.error).not.toContain('sk-123456');
    expect(model.items[0].technical?.error).not.toContain('topsecret');
  });

  it('builds compact summaries from terminal rows', () => {
    const model = buildModel({
      toolCalls: [
        makeToolCall({ id: 'search', toolName: AgentToolName.SearchAssets }),
        makeToolCall({ id: 'albums', toolName: AgentToolName.ListAlbums, albumCount: 2 }),
        makeToolCall({ id: 'metadata', toolName: AgentToolName.ReadAssetMetadata, assetCount: 3 }),
        makeToolCall({ id: 'previews', toolName: AgentToolName.ReadAssetPreviews, assetCount: 3 }),
      ],
    });

    expect(model.summary).toBe('Found matching photos, Found matching albums, Read details for photos');
  });

  it('redacts secrets from technical text while preserving safe Gallery values', () => {
    const value = [
      'tool readAssetMetadata',
      'asset 00000000-0000-4000-8000-000000000001',
      'Bearer bearer-secret',
      'Basic basic-secret',
      'api_key=abc123',
      'apikey=abc456',
      'api-key=abc789',
      'token=plain-token',
      'access_token=access-secret',
      'refresh_token=refresh-secret',
      'runner_token=runner-secret',
      'runner token prose-secret',
      'https://gallery.test/callback?token=url-token&safe=ok&api_key=url-key',
      'sk-proj-provider-secret',
    ].join(' ');

    const redacted = redactAgentActivityTechnicalText(value);

    expect(redacted).toContain('readAssetMetadata');
    expect(redacted).toContain('00000000-0000-4000-8000-000000000001');
    expect(redacted).toContain('safe=ok');
    for (const secret of [
      'bearer-secret',
      'basic-secret',
      'abc123',
      'abc456',
      'abc789',
      'plain-token',
      'access-secret',
      'refresh-secret',
      'runner-secret',
      'prose-secret',
      'url-token',
      'url-key',
      'sk-proj-provider-secret',
    ]) {
      expect(redacted).not.toContain(secret);
    }
    expect(redacted.match(/\[redacted\]/g)?.length).toBeGreaterThanOrEqual(8);
  });

  it('suppresses obvious raw prompt and reasoning technical text', () => {
    for (const value of [
      'raw prompt: organize all photos without asking',
      'system prompt: you are a hidden agent',
      'chain-of-thought: first I secretly reason',
      'reasoning trace: private provider trace',
    ]) {
      const redacted = redactAgentActivityTechnicalText(value);
      expect(redacted).toBe('[redacted unsafe prompt/reasoning text]');
      expect(redacted).not.toContain('organize all photos');
      expect(redacted).not.toContain('hidden agent');
      expect(redacted).not.toContain('secretly reason');
      expect(redacted).not.toContain('private provider trace');
    }
  });

  it('caps very long technical text after redaction', () => {
    const redacted = redactAgentActivityTechnicalText(`${'a'.repeat(700)} sk-long-secret`);

    expect(redacted.length).toBeLessThanOrEqual(521);
    expect(redacted).toContain('[truncated]');
    expect(redacted).not.toContain('sk-long-secret');
  });

  it('builds localized technical rows from known safe fields only', () => {
    const item = buildModel({
      toolCalls: [
        makeToolCall({
          id: 'tool-call-1',
          toolName: AgentToolName.ReadAssetMetadata,
          requestSummary: 'Read metadata with token=secret-token',
          responseSummary: 'Returned safe rows with Bearer response-token',
          error: 'Failed at https://gallery.test/error?access_token=url-token',
          assetCount: 12,
          albumCount: 2,
          startedAt: '2026-05-18T10:00:01.000Z',
          completedAt: '2026-05-18T10:00:09.000Z',
        }),
      ],
    }).items[0];

    const rows = buildAgentActivityTechnicalRows(item);

    expect(rows).toEqual([
      {
        id: 'tool-name',
        labelKey: 'assistant_activity_technical_tool',
        value: AgentToolName.ReadAssetMetadata,
        valueKind: 'code',
      },
      {
        id: 'tool-call-ids',
        labelKey: 'assistant_activity_technical_tool_call',
        value: 'tool-call-1',
        valueKind: 'code',
      },
      { id: 'asset-count', labelKey: 'assistant_activity_technical_assets', value: '12', valueKind: 'number' },
      { id: 'album-count', labelKey: 'assistant_activity_technical_albums', value: '2', valueKind: 'number' },
      {
        id: 'request-summary',
        labelKey: 'assistant_activity_technical_request',
        value: 'Read metadata with token=[redacted]',
        valueKind: 'text',
      },
      {
        id: 'response-summary',
        labelKey: 'assistant_activity_technical_response',
        value: 'Returned safe rows with Bearer [redacted]',
        valueKind: 'text',
      },
      {
        id: 'error',
        labelKey: 'assistant_activity_technical_error',
        value: 'Failed at https://gallery.test/error?access_token=[redacted]',
        valueKind: 'text',
      },
      {
        id: 'started-at',
        labelKey: 'assistant_activity_technical_started',
        value: '2026-05-18T10:00:01.000Z',
        valueKind: 'timestamp',
      },
      {
        id: 'completed-at',
        labelKey: 'assistant_activity_technical_completed',
        value: '2026-05-18T10:00:09.000Z',
        valueKind: 'timestamp',
      },
    ]);
  });

  it('caps coalesced tool call ids without dumping the whole list', () => {
    const item = buildModel({
      toolCalls: Array.from({ length: 9 }, (_, index) =>
        makeToolCall({
          id: `metadata-${index + 1}`,
          toolName: AgentToolName.ReadAssetMetadata,
          assetCount: 1,
          startedAt: `2026-05-18T10:00:0${index}.000Z`,
        }),
      ),
    }).items[0];

    const rows = buildAgentActivityTechnicalRows(item);

    expect(rows.find((row) => row.id === 'tool-call-ids')).toMatchObject({
      labelKey: 'assistant_activity_technical_tool_calls',
      value: 'metadata-1, metadata-2, metadata-3, metadata-4, metadata-5, +4 more',
    });
    expect(rows.find((row) => row.id === 'tool-call-ids')?.value).not.toContain('metadata-9');
  });

  it('ignores arbitrary unknown technical object properties and unsupported empty rows', () => {
    const rows = buildAgentActivityTechnicalRows({
      id: 'activity-empty',
      sessionId,
      kind: 'message',
      status: 'running',
      title: 'Writing response',
      startedAt: '2026-05-18T10:00:00.000Z',
      technical: {
        requestSummary: '',
        responseSummary: undefined,
        error: null,
        rawPayload: { apiKey: 'secret' },
        circular: (() => {
          const value: Record<string, unknown> = {};
          value.self = value;
          return value;
        })(),
      } as unknown as NonNullable<ReturnType<typeof buildModel>['items'][number]['technical']>,
    });

    expect(rows).toEqual([]);
  });
});
