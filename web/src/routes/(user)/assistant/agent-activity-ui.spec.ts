import {
  AgentApprovalMode,
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
  AgentToolCallStatus,
  AgentToolDataClass,
  AgentToolName,
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
      updateAssetMetadata: true,
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

const makeToolCall = (overrides: Partial<AgentToolCallResponseDto> = {}): AgentToolCallResponseDto => ({
  id: overrides.id ?? 'tool-call-1',
  sessionId: overrides.sessionId ?? sessionId,
  toolName: overrides.toolName ?? AgentToolName.SearchAssets,
  status: overrides.status ?? AgentToolCallStatus.Completed,
  approvalDecision: overrides.approvalDecision ?? null,
  requestSummary: overrides.requestSummary ?? 'Search photos',
  responseSummary: Object.hasOwn(overrides, 'responseSummary')
    ? (overrides.responseSummary ?? null)
    : 'Found matching photos',
  dataClass: overrides.dataClass ?? AgentToolDataClass.Metadata,
  assetCount: overrides.assetCount ?? 0,
  albumCount: overrides.albumCount ?? 0,
  startedAt: overrides.startedAt ?? '2026-05-18T10:00:05.000Z',
  completedAt: overrides.completedAt ?? '2026-05-18T10:00:07.000Z',
  error: overrides.error ?? null,
});

const makeToolBurst = (count = 60) =>
  Array.from({ length: count }, (_, index) => {
    const startedAt = `2026-05-18T10:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`;
    const completedAt = `2026-05-18T10:${String(Math.floor((index + 1) / 60)).padStart(2, '0')}:${String((index + 1) % 60).padStart(2, '0')}.000Z`;

    if (index % 15 === 14) {
      return makeToolCall({
        id: `unknown-${index}`,
        toolName: 'futureMcpDebugTool' as AgentToolName,
        startedAt,
        completedAt,
      });
    }

    if (index % 15 === 13) {
      return makeToolCall({
        id: `space-${index}`,
        toolName: AgentToolName.ReadSpace,
        startedAt,
        completedAt,
      });
    }

    if (index % 15 === 12) {
      return makeToolCall({
        id: `album-${index}`,
        toolName: AgentToolName.ListAlbums,
        albumCount: 1,
        startedAt,
        completedAt,
      });
    }

    if (index % 2 === 0) {
      return makeToolCall({
        id: `search-${index}`,
        toolName: AgentToolName.SearchAssets,
        assetCount: 12,
        responseSummary: 'Found matching photos',
        startedAt,
        completedAt,
      });
    }

    return makeToolCall({
      id: `metadata-${index}`,
      toolName: AgentToolName.ReadAssetMetadata,
      status: index === 55 ? AgentToolCallStatus.Executing : AgentToolCallStatus.Completed,
      assetCount: 3,
      responseSummary: index === 55 ? null : 'Read details for photos',
      startedAt,
      completedAt: index === 55 ? null : completedAt,
    });
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
  it('builds a stable compact model from a burst of tool calls and events', () => {
    const toolCalls = makeToolBurst(60);
    const activityEvents = [
      makeActivityEvent({
        id: 'start',
        kind: 'start-processing',
        status: 'running',
        createdAt: '2026-05-18T09:59:59.000Z',
      }),
      makeActivityEvent({
        id: 'plan',
        kind: 'plan-composing',
        status: 'completed',
        createdAt: '2026-05-18T10:01:01.000Z',
      }),
    ];
    const pollingFirst = buildModel({ toolCalls, activityEvents });
    const websocketFirst = buildModel({
      toolCalls: [...toolCalls].reverse(),
      activityEvents: [...activityEvents].reverse(),
    });

    expect(pollingFirst.items.length).toBeLessThan(10);
    expect(pollingFirst.items.map((item) => item.id)).toContain('tool-search-search-assets');
    expect(
      buildModel({
        toolCalls: [...toolCalls, makeToolCall({ id: 'search-appended', startedAt: '2026-05-18T10:02:00.000Z' })],
      }).items.map((item) => item.id),
    ).toContain('tool-search-search-assets');
    expect(pollingFirst.items.find((item) => item.kind === 'search')).toMatchObject({
      title: 'Searching photos',
      status: 'completed',
      count: 288,
    });
    expect(pollingFirst.items.find((item) => item.kind === 'metadata')).toMatchObject({
      status: 'running',
      count: 72,
    });
    for (const item of pollingFirst.items) {
      expect(`${item.title} ${item.summary ?? ''}`).not.toContain('searchAssets');
      expect(`${item.title} ${item.summary ?? ''}`).not.toContain('readAssetMetadata');
      expect(`${item.title} ${item.summary ?? ''}`).not.toContain('futureMcpDebugTool');
    }
    expect(pollingFirst.activeItem?.id).toBe(websocketFirst.activeItem?.id);
  });

  it('builds an expanded verbose timeline with ordered plain-language rows', () => {
    const toolCalls = makeToolBurst(60);
    const activityEvents = [
      makeActivityEvent({
        id: 'start',
        kind: 'start-processing',
        status: 'running',
        createdAt: '2026-05-18T09:59:59.000Z',
      }),
      makeActivityEvent({
        id: 'plan',
        kind: 'plan-composing',
        status: 'completed',
        createdAt: '2026-05-18T10:01:01.000Z',
      }),
    ];
    const model = buildModel({ toolCalls, activityEvents });

    expect(model.verboseItems).toHaveLength(62);
    expect(model.verboseItems.map((item) => item.startedAt)).toEqual(
      [...model.verboseItems.map((item) => item.startedAt)].sort(),
    );
    expect(model.verboseItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'tool-search-0',
          title: 'Searching photos',
          status: 'completed',
          summary: 'Found matching photos',
          count: 12,
        }),
        expect.objectContaining({
          id: 'tool-metadata-55',
          title: 'Reading photo details',
          status: 'running',
          summary: 'Reading photo details',
          count: 3,
        }),
        expect.objectContaining({ id: 'tool-unknown-14', title: 'Working with Gallery' }),
      ]),
    );
    expect(model.verboseItems.find((item) => item.id === 'tool-unknown-14')?.technical?.toolName).toBe(
      'futureMcpDebugTool',
    );
    expect(model.verboseItems.map((item) => `${item.title} ${item.summary ?? ''}`).join(' ')).not.toContain(
      'futureMcpDebugTool',
    );
  });

  it('keeps every repeated tool call as a separate expanded row while compact rows stay coalesced', () => {
    const repeatedSearches = Array.from({ length: 50 }, (_, index) =>
      makeToolCall({
        id: `repeat-search-${index}`,
        toolName: AgentToolName.SearchAssets,
        assetCount: 1,
        startedAt: `2026-05-18T10:00:${String(index).padStart(2, '0')}.000Z`,
        completedAt: `2026-05-18T10:00:${String(index + 1).padStart(2, '0')}.000Z`,
      }),
    );

    const model = buildModel({ toolCalls: repeatedSearches });

    expect(model.verboseItems).toHaveLength(50);
    expect(model.verboseItems.map((item) => item.id)).toEqual(
      repeatedSearches.map((toolCall) => `tool-${toolCall.id}`),
    );
    expect(model.items).toHaveLength(1);
    expect(model.items[0]).toMatchObject({
      id: 'tool-search-search-assets',
      kind: 'search',
      status: 'completed',
      count: 50,
    });
  });

  it('shows source-aware planning steps in expanded activity while compact rows stay stable', () => {
    const toolCalls = [
      makeToolCall({
        id: 'resolve-people',
        toolName: AgentToolName.ResolveAssetSearchFilters,
        responseSummary: 'Resolved people: Pierre, Aurelia',
        assetCount: 0,
        startedAt: '2026-05-18T10:00:01.000Z',
        completedAt: '2026-05-18T10:00:02.000Z',
      }),
      makeToolCall({
        id: 'search-source',
        toolName: AgentToolName.SearchAssets,
        responseSummary: 'Found 100 matching photos',
        assetCount: 100,
        startedAt: '2026-05-18T10:00:03.000Z',
        completedAt: '2026-05-18T10:00:04.000Z',
      }),
      makeToolCall({
        id: 'prepare-album',
        toolName: AgentToolName.ProposeAlbumFromSearch,
        responseSummary: 'Prepared album plan with 100 photos',
        assetCount: 100,
        startedAt: '2026-05-18T10:00:05.000Z',
        completedAt: '2026-05-18T10:00:06.000Z',
      }),
    ];

    const beforePlan = buildModel({ toolCalls: toolCalls.slice(0, 2) });
    const afterPlan = buildModel({ toolCalls });

    expect(
      afterPlan.verboseItems.map(({ id, title, summary, status, count }) => ({ id, title, summary, status, count })),
    ).toEqual([
      {
        id: 'tool-resolve-people',
        title: 'Resolving filters',
        summary: 'Resolved people: Pierre, Aurelia',
        status: 'completed',
        count: undefined,
      },
      {
        id: 'tool-search-source',
        title: 'Searching photos',
        summary: 'Found 100 matching photos',
        status: 'completed',
        count: 100,
      },
      {
        id: 'tool-prepare-album',
        title: 'Preparing album plan',
        summary: 'Prepared album plan with 100 photos',
        status: 'completed',
        count: 100,
      },
    ]);
    expect(beforePlan.items.map((item) => item.id)).toEqual(['tool-resolve-people', 'tool-search-source']);
    expect(afterPlan.items.map((item) => item.id)).toEqual([
      'tool-resolve-people',
      'tool-search-source',
      'tool-prepare-album',
    ]);
  });

  it('keeps compact source workflow rows stable when repeated searches complete out of order', () => {
    const running = buildModel({
      toolCalls: [
        makeToolCall({
          id: 'search-page-1',
          toolName: AgentToolName.SearchAssets,
          status: AgentToolCallStatus.Executing,
          responseSummary: null,
          assetCount: 50,
          startedAt: '2026-05-18T10:00:01.000Z',
          completedAt: null,
        }),
        makeToolCall({
          id: 'search-page-2',
          toolName: AgentToolName.SearchAssets,
          status: AgentToolCallStatus.Completed,
          responseSummary: 'Returned metadata for 50 assets',
          assetCount: 50,
          startedAt: '2026-05-18T10:00:03.000Z',
          completedAt: '2026-05-18T10:00:04.000Z',
        }),
      ],
    });
    const completedOutOfOrder = buildModel({
      toolCalls: [
        makeToolCall({
          id: 'search-page-2',
          toolName: AgentToolName.SearchAssets,
          status: AgentToolCallStatus.Completed,
          responseSummary: 'Returned metadata for 50 assets',
          assetCount: 50,
          startedAt: '2026-05-18T10:00:03.000Z',
          completedAt: '2026-05-18T10:00:04.000Z',
        }),
        makeToolCall({
          id: 'search-page-1',
          toolName: AgentToolName.SearchAssets,
          status: AgentToolCallStatus.Completed,
          responseSummary: 'Returned metadata for 50 assets',
          assetCount: 50,
          startedAt: '2026-05-18T10:00:01.000Z',
          completedAt: '2026-05-18T10:00:05.000Z',
        }),
      ],
    });

    expect(running.items).toHaveLength(1);
    expect(completedOutOfOrder.items).toHaveLength(1);
    expect(running.items[0].id).toBe('tool-search-search-assets');
    expect(completedOutOfOrder.items[0]).toMatchObject({
      id: 'tool-search-search-assets',
      status: 'completed',
      summary: 'Returned metadata for 100 assets',
      count: 100,
    });
  });

  it('shows failed source planning as a terminal plan row', () => {
    const model = buildModel({
      toolCalls: [
        makeToolCall({
          id: 'failed-plan',
          toolName: AgentToolName.ProposeAlbumFromSearch,
          status: AgentToolCallStatus.Failed,
          responseSummary: null,
          error: 'runner failed',
          startedAt: '2026-05-18T10:00:05.000Z',
          completedAt: '2026-05-18T10:00:06.000Z',
        }),
      ],
    });

    expect(model.items).toHaveLength(1);
    expect(model.items[0]).toMatchObject({
      kind: 'plan',
      status: 'failed',
      title: 'Preparing album plan',
      summary: 'Plan preparation failed',
      completedAt: '2026-05-18T10:00:06.000Z',
    });
    expect(model.activeItem).toBeNull();
  });

  it('does not let secondary activity events remove expanded tool-call rows', () => {
    const model = buildModel({
      toolCalls: [
        makeToolCall({
          id: 'plan-tool',
          toolName: AgentToolName.ProposeAlbumOperations,
          startedAt: '2026-05-18T10:00:02.000Z',
          completedAt: '2026-05-18T10:00:04.000Z',
        }),
        makeToolCall({
          id: 'search-after-plan',
          toolName: AgentToolName.SearchAssets,
          assetCount: 3,
          responseSummary: null,
          startedAt: '2026-05-18T10:00:05.000Z',
          completedAt: '2026-05-18T10:00:07.000Z',
        }),
      ],
      currentPlan: makePlan({
        createdAt: '2026-05-18T10:00:08.000Z',
        updatedAt: '2026-05-18T10:00:09.000Z',
      }),
      activityEvents: [
        makeActivityEvent({
          id: 'start',
          kind: 'start-processing',
          status: 'running',
          createdAt: '2026-05-18T10:00:01.000Z',
        }),
        makeActivityEvent({
          id: 'plan-composing',
          kind: 'plan-composing',
          status: 'completed',
          createdAt: '2026-05-18T10:00:03.000Z',
        }),
      ],
    });

    expect(model.verboseItems.map((item) => item.id)).toEqual(
      expect.arrayContaining(['tool-plan-tool', 'tool-search-after-plan']),
    );
    expect(model.verboseItems.filter((item) => item.id.startsWith('tool-'))).toHaveLength(2);
    expect(model.verboseItems.find((item) => item.id === 'tool-search-after-plan')?.technical?.responseSummary).toBe(
      undefined,
    );
    expect(model.items.filter((item) => item.kind === 'plan')).toHaveLength(1);
  });

  it('returns identical compact and verbose models for polling-first and websocket-first updates', () => {
    const toolCalls = makeToolBurst(60);
    const activityEvents = [
      makeActivityEvent({
        id: 'start',
        kind: 'start-processing',
        status: 'running',
        createdAt: '2026-05-18T09:59:59.000Z',
      }),
      makeActivityEvent({
        id: 'plan',
        kind: 'plan-composing',
        status: 'completed',
        createdAt: '2026-05-18T10:01:01.000Z',
      }),
    ];
    const pollingFirst = buildModel({ toolCalls, activityEvents });
    const websocketFirst = buildModel({
      toolCalls: [...toolCalls].reverse(),
      activityEvents: [...activityEvents].reverse(),
    });

    expect(pollingFirst.items.map(({ id, status, count }) => ({ id, status, count }))).toEqual(
      websocketFirst.items.map(({ id, status, count }) => ({ id, status, count })),
    );
    expect(pollingFirst.verboseItems.map(({ id, status, count }) => ({ id, status, count }))).toEqual(
      websocketFirst.verboseItems.map(({ id, status, count }) => ({ id, status, count })),
    );
  });

  it.each([
    [AgentToolName.ResolveAssetSearchFilters, 'search', 'Resolving filters', 'Matched search filters'],
    [AgentToolName.SearchAssets, 'search', 'Searching photos', 'Found matching photos'],
    [AgentToolName.ReadAssetMetadata, 'metadata', 'Reading photo details', 'Read details for photos'],
    [AgentToolName.ReadAssetPreviews, 'preview', 'Loading photo previews', 'Loaded photo previews'],
    [AgentToolName.ReadAssetOriginals, 'preview', 'Opening original files', 'Opened original files'],
    [AgentToolName.ListAlbums, 'album', 'Searching albums', 'Found matching albums'],
    [AgentToolName.ReadAlbum, 'album', 'Reading album details', 'Read album details'],
    [AgentToolName.ListSpaces, 'space', 'Listing spaces', 'Found visible spaces'],
    [AgentToolName.ReadSpace, 'space', 'Reading space details', 'Read space details'],
    [AgentToolName.ProposeAlbumOperations, 'plan', 'Preparing a plan', 'Prepared a plan'],
    [AgentToolName.ReviseProposedOperations, 'plan', 'Revising the plan', 'Revised the plan'],
    [AgentToolName.SummarizePlan, 'plan', 'Summarizing the plan', 'Summarized the plan'],
    [AgentToolName.ProposeAlbumFromSearch, 'plan', 'Preparing album plan', 'Prepared album plan'],
    [AgentToolName.ProposeAddAssetsToAlbumFromSearch, 'plan', 'Preparing album plan', 'Prepared album plan'],
    [AgentToolName.ProposeSpaceFromSearch, 'plan', 'Preparing space plan', 'Prepared space plan'],
    [AgentToolName.ProposeAddAssetsToSpaceFromSearch, 'plan', 'Preparing space plan', 'Prepared space plan'],
    [AgentToolName.ProposeAssetBatchFromSearch, 'plan', 'Preparing asset update plan', 'Prepared asset update plan'],
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

  it('uses metadata-specific activity copy only for metadata asset batch plans', () => {
    const metadataModel = buildModel({
      toolCalls: [
        makeToolCall({
          toolName: AgentToolName.ProposeAssetBatchFromSearch,
          status: AgentToolCallStatus.Completed,
          requestSummary: 'Store 1 proposed metadata operation(s)',
          responseSummary: null,
        }),
      ],
    });
    const genericModel = buildModel({
      toolCalls: [
        makeToolCall({
          toolName: AgentToolName.ProposeAssetBatchFromSearch,
          status: AgentToolCallStatus.Completed,
          requestSummary: 'Store 1 proposed album operation(s)',
          responseSummary: null,
        }),
      ],
    });

    expect(metadataModel.items[0]).toMatchObject({
      kind: 'plan',
      title: 'Preparing metadata update plan',
      summary: 'Prepared metadata update plan',
    });
    expect(genericModel.items[0]).toMatchObject({
      kind: 'plan',
      title: 'Preparing asset update plan',
      summary: 'Prepared asset update plan',
    });
  });

  it('summarizes search acceptance activity without raw request payloads by default', () => {
    const model = buildModel({
      toolCalls: [
        makeToolCall({
          toolName: AgentToolName.SearchAssets,
          status: AgentToolCallStatus.Completed,
          requestSummary: 'Search ocr assets (limit 50)',
          responseSummary: 'Returned metadata for 4 assets',
          assetCount: 4,
        }),
      ],
      appliedPlans: [
        makePlan({
          status: AgentOperationPlanStatus.Applied,
          operations: [
            makeOperation({
              type: AgentOperationType.AssetSetArchive,
              status: AgentOperationStatus.Applied,
              assetIds: ['asset-1', 'asset-2', 'asset-3', 'asset-4'],
            }),
          ],
        }),
      ],
    });

    const userCopy = model.items.map((item) => `${item.title} ${item.summary}`).join(' ');
    expect(userCopy).toContain('Searching photos');
    expect(userCopy).toContain('Returned metadata for 4 assets');
    expect(userCopy).toContain('Applying changes');
    expect(userCopy).not.toContain('filters');
    expect(userCopy).not.toContain('asset-1');
    expect(userCopy).not.toContain('spacePersonIds');
    expect(model.items.find((item) => item.kind === 'search')?.technical?.toolName).toBe(AgentToolName.SearchAssets);
  });

  it('summarizes coalesced search activity with aggregate counts instead of stale page copy', () => {
    const model = buildModel({
      toolCalls: [
        makeToolCall({
          id: 'search-page-1',
          toolName: AgentToolName.SearchAssets,
          status: AgentToolCallStatus.Completed,
          requestSummary: 'Search metadata assets with filters personIds=["person-1"]',
          responseSummary: 'Returned metadata for 4 assets including asset-1',
          assetCount: 4,
          startedAt: '2026-05-18T10:00:01.000Z',
          completedAt: '2026-05-18T10:00:03.000Z',
        }),
        makeToolCall({
          id: 'search-page-2',
          toolName: AgentToolName.SearchAssets,
          status: AgentToolCallStatus.Completed,
          requestSummary: 'Search metadata assets page 2 with filters personIds=["person-1"]',
          responseSummary: 'Returned metadata for 3 assets including asset-5',
          assetCount: 3,
          startedAt: '2026-05-18T10:00:04.000Z',
          completedAt: '2026-05-18T10:00:06.000Z',
        }),
      ],
    });

    expect(model.items).toHaveLength(1);
    expect(model.items[0]).toMatchObject({
      kind: 'search',
      status: 'completed',
      title: 'Searching photos',
      summary: 'Returned metadata for 7 assets',
      count: 7,
    });

    const userCopy = `${model.items[0].title} ${model.items[0].summary}`;
    expect(userCopy).not.toContain('filters');
    expect(userCopy).not.toContain('person-1');
    expect(userCopy).not.toContain('asset-1');
    expect(userCopy).not.toContain('asset-5');
    expect(model.items[0].technical).toMatchObject({
      toolName: AgentToolName.SearchAssets,
      toolCallIds: ['search-page-1', 'search-page-2'],
      assetCount: 7,
      requestSummary: 'Search metadata assets with filters personIds=["person-1"]',
      responseSummary: 'Returned metadata for 4 assets including asset-1',
    });
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

  it('keeps a tool call row id stable across permission and execution lifecycle changes', () => {
    const lifecycleToolId = 'lifecycle-tool';
    const baseToolCall = {
      id: lifecycleToolId,
      toolName: AgentToolName.ReadAssetMetadata,
      requestSummary: 'Read 12 photo metadata records',
      responseSummary: null,
      assetCount: 12,
      startedAt: '2026-05-18T10:00:05.000Z',
    } satisfies Partial<AgentToolCallResponseDto>;

    const pending = buildModel({
      toolCalls: [
        makeToolCall({
          ...baseToolCall,
          status: AgentToolCallStatus.PendingApproval,
          completedAt: null,
        }),
      ],
    });
    const approved = buildModel({
      toolCalls: [
        makeToolCall({
          ...baseToolCall,
          status: AgentToolCallStatus.Approved,
          completedAt: null,
        }),
      ],
    });
    const executing = buildModel({
      toolCalls: [
        makeToolCall({
          ...baseToolCall,
          status: AgentToolCallStatus.Executing,
          completedAt: null,
        }),
      ],
    });
    const completed = buildModel({
      toolCalls: [
        makeToolCall({
          ...baseToolCall,
          status: AgentToolCallStatus.Completed,
          responseSummary: 'Read details for photos',
          completedAt: '2026-05-18T10:00:09.000Z',
        }),
      ],
    });

    expect(pending.verboseItems[0]).toMatchObject({
      id: 'tool-lifecycle-tool',
      kind: 'permission',
      status: 'blocked',
      title: 'Waiting for approval',
    });
    expect(approved.verboseItems[0]).toMatchObject({
      id: 'tool-lifecycle-tool',
      kind: 'metadata',
      status: 'running',
      title: 'Reading photo details',
    });
    expect(executing.verboseItems[0]).toMatchObject({
      id: 'tool-lifecycle-tool',
      kind: 'metadata',
      status: 'running',
    });
    expect(completed.verboseItems[0]).toMatchObject({
      id: 'tool-lifecycle-tool',
      kind: 'metadata',
      status: 'completed',
    });
    expect([pending, approved, executing, completed].map((model) => model.verboseItems[0].id)).toEqual([
      'tool-lifecycle-tool',
      'tool-lifecycle-tool',
      'tool-lifecycle-tool',
      'tool-lifecycle-tool',
    ]);
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

  it('keeps space lookup activity separate from album activity', () => {
    const model = buildModel({
      toolCalls: [
        makeToolCall({ id: 'list-spaces', toolName: AgentToolName.ListSpaces }),
        makeToolCall({ id: 'read-space', toolName: AgentToolName.ReadSpace }),
        makeToolCall({ id: 'list-albums', toolName: AgentToolName.ListAlbums }),
      ],
    });

    expect(model.items.map((item) => [item.kind, item.title])).toEqual([
      ['album', 'Searching albums'],
      ['space', 'Listing spaces'],
      ['space', 'Reading space details'],
    ]);
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

    expect(buildModel({ currentPlan: proposedPlan }).items.find((item) => item.kind === 'plan')).toMatchObject({
      status: 'completed',
      title: 'Preparing a plan',
      summary: 'Prepared a plan',
      count: 2,
    });
    expect(
      buildModel({ session: makeSession({ status: AgentSessionStatus.WaitingForPlanReview }), currentPlan: null })
        .items,
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
          totalCount: 5,
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
        count: 5,
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
    expect(model.activeItem?.id).toBe('event-recovery');
  });

  it('does not keep a stale start-processing event active after a plan is ready', () => {
    const model = buildModel({
      session: makeSession({
        status: AgentSessionStatus.WaitingForPlanReview,
        updatedAt: '2026-05-18T10:01:30.000Z',
      }),
      currentPlan: makePlan({
        id: 'ready-plan',
        createdAt: '2026-05-18T10:01:00.000Z',
        updatedAt: '2026-05-18T10:01:10.000Z',
      }),
      activityEvents: [
        makeActivityEvent({
          id: 'start',
          kind: 'start-processing',
          status: 'running',
          createdAt: '2026-05-18T10:00:00.000Z',
        }),
      ],
    });

    expect(model.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'event-start', kind: 'understanding', status: 'running' }),
        expect.objectContaining({ id: 'plan-ready-plan-1', kind: 'plan', status: 'completed' }),
      ]),
    );
    expect(model.activeItem).toBeNull();
    expect(model.summary).toBe('Prepared a plan');
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
      id: 'tool-plan-tool',
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
      'tool-search-same-time',
      'tool-metadata-same-time',
      'tool-z-unknown-time',
    ]);
  });

  it('keeps unknown tool names and sensitive details out of default copy', () => {
    const model = buildModel({
      toolCalls: [
        makeToolCall({
          id: 'unknown',
          toolName: 'futureDangerTool' as AgentToolName,
          status: AgentToolCallStatus.Failed,
          requestSummary: 'Read asset 00000000-0000-4000-8000-000000000001 with api_key=abc123 and Bearer secret-token',
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

  it('adds response-size telemetry to technical rows', () => {
    const rows = buildAgentActivityTechnicalRows({
      id: 'item-1',
      sessionId,
      kind: 'search',
      status: 'completed',
      title: 'Searching photos',
      startedAt: '2026-05-18T10:00:05.000Z',
      technical: {
        toolName: AgentToolName.SearchAssets,
        toolCallIds: ['tool-call-1'],
        resultSize: {
          returnedItems: 12,
          hasMore: true,
          nextPage: '2',
          estimatedBytes: 42_000,
          truncated: true,
          omittedFields: ['assets', 'sample'],
        },
      },
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'result-size',
          labelKey: 'assistant_activity_technical_result_size',
          value: '41 KB',
        }),
        expect.objectContaining({
          id: 'result-items',
          labelKey: 'assistant_activity_technical_result_items',
          value: '12',
        }),
        expect.objectContaining({
          id: 'result-truncated',
          labelKey: 'assistant_activity_technical_truncated',
          value: 'yes',
        }),
        expect.objectContaining({
          id: 'result-omitted-fields',
          labelKey: 'assistant_activity_technical_omitted_fields',
          value: 'assets, sample',
        }),
        expect.objectContaining({
          id: 'result-next-page',
          labelKey: 'assistant_activity_technical_next_page',
          value: '2',
        }),
      ]),
    );
  });

  it('shows unavailable result-size estimates without crashing', () => {
    const rows = buildAgentActivityTechnicalRows({
      id: 'item-1',
      sessionId,
      kind: 'metadata',
      status: 'blocked',
      title: 'Waiting for approval',
      startedAt: '2026-05-18T10:00:05.000Z',
      technical: {
        resultSize: {
          returnedItems: 0,
          hasMore: false,
          nextPage: null,
          estimatedBytes: null,
          truncated: false,
          omittedFields: [],
        },
      },
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'result-size', value: 'not estimated' }),
        expect.objectContaining({ id: 'result-items', value: '0' }),
      ]),
    );
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
