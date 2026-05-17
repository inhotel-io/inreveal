import {
  AgentOperationPlanStatus,
  AgentOperationRiskLevel,
  AgentOperationStatus,
  AgentOperationTargetKind,
  AgentOperationType,
  type AgentOperationPlanResponseDto,
  type AgentOperationResponseDto,
} from '@immich/sdk';
import {
  AGENT_PLAN_THUMBNAIL_STRIP_DEFAULT_LIMIT,
  AGENT_PLAN_THUMBNAIL_STRIP_MAX_LIMIT,
  buildAgentPlanThumbnailStrip,
  buildApprovedOperationIds,
  buildGroupEnabledState,
  buildOperationReviewImpactSummary,
  buildOperationReviewModel,
  buildSelectionPayload,
  createInitialOperationEnabledState,
  getOperationAssetCount,
} from './agent-operation-plan-ui';

const planId = '00000000-0000-4000-8000-000000000100';
const createId = '00000000-0000-4000-8000-000000000101';
const addId = '00000000-0000-4000-8000-000000000102';
const coverId = '00000000-0000-4000-8000-000000000103';
const updateId = '00000000-0000-4000-8000-000000000104';
const assetA = '00000000-0000-4000-8000-000000000201';
const assetB = '00000000-0000-4000-8000-000000000202';

const manyAssetIds = (count: number) =>
  Array.from({ length: count }, (_, index) => `asset-${String(index + 1).padStart(3, '0')}`);

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

const thumbnailGroup = (assetCount: number) =>
  buildOperationReviewModel(
    plan([
      operation({
        id: addId,
        type: AgentOperationType.AlbumAddAssets,
        summary: `Add ${assetCount} assets`,
        targetKind: AgentOperationTargetKind.NewAlbum,
        temporaryTargetId: 'album-portugal',
        assetIds: manyAssetIds(assetCount),
        payload: {},
      }),
    ]),
    { [addId]: true },
  ).groups[0];

describe('agent operation plan UI helpers', () => {
  it('builds spec-shaped review metadata for album operations', () => {
    const model = buildOperationReviewModel(
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
      ]),
      { [createId]: true, [addId]: true },
    );

    expect(model.operationsById.get(createId)?.review).toEqual({
      operationId: createId,
      operationType: AgentOperationType.AlbumCreate,
      destination: {
        kind: 'album',
        temporaryId: 'album-portugal',
        name: 'Portugal',
        subtitle: 'New album',
      },
      summary: 'Create album "Portugal"',
      riskLevel: AgentOperationRiskLevel.Low,
      selection: {
        itemKind: 'asset',
        totalCount: 0,
        selectedCount: 0,
        mode: 'all',
        supportsItemSelection: false,
      },
      thumbnails: {
        totalCount: 0,
        representativeAssetIds: [],
        hasMore: false,
      },
      dependencies: [],
    });
    expect(model.operationsById.get(addId)?.review).toEqual({
      operationId: addId,
      operationType: AgentOperationType.AlbumAddAssets,
      destination: {
        kind: 'album',
        temporaryId: 'album-portugal',
        name: 'Portugal',
        subtitle: 'New album',
      },
      summary: 'Add 2 photos',
      riskLevel: AgentOperationRiskLevel.Low,
      selection: {
        itemKind: 'asset',
        totalCount: 2,
        selectedCount: 2,
        mode: 'all',
        supportsItemSelection: false,
      },
      thumbnails: {
        totalCount: 2,
        representativeAssetIds: [assetA, assetB],
        hasMore: false,
      },
      dependencies: [{ operationId: createId, summary: 'Create Portugal album', blocked: false }],
    });
  });

  it('derives human-readable summaries for current album operation types', () => {
    const existingAlbumId = '00000000-0000-4000-8000-000000000301';
    const model = buildOperationReviewModel(
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
          summary: 'Add assets',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          targetId: existingAlbumId,
          assetIds: [assetA],
          payload: {},
        }),
        operation({
          id: coverId,
          type: AgentOperationType.AlbumSetCover,
          summary: 'Set cover',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          targetId: existingAlbumId,
          assetIds: [assetA],
          payload: {},
        }),
        operation({
          id: updateId,
          type: AgentOperationType.AlbumUpdateDetails,
          summary: 'Update details',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          targetId: existingAlbumId,
          payload: { albumName: 'Portugal Archive' },
        }),
      ]),
      { [createId]: true, [addId]: true, [coverId]: true, [updateId]: true },
    );

    expect(model.operationsById.get(createId)?.review.summary).toBe('Create album "Portugal"');
    expect(model.operationsById.get(addId)?.review.summary).toBe('Add 1 photo');
    expect(model.operationsById.get(coverId)?.review.summary).toBe('Set cover photo');
    expect(model.operationsById.get(updateId)?.review.summary).toBe('Rename album to "Portugal Archive"');
  });

  it('maps future target kinds into stable review destination kinds without throwing', () => {
    const futureOperation = operation({
      id: updateId,
      type: 'asset.rotate' as AgentOperationType,
      summary: 'Rotate landscape photos',
      targetKind: 'asset_batch' as AgentOperationTargetKind,
      assetIds: [assetA, assetB],
      payload: { angle: 90 },
    });

    expect(() => buildOperationReviewModel(plan([futureOperation]), { [updateId]: true })).not.toThrow();

    const model = buildOperationReviewModel(plan([futureOperation]), { [updateId]: true });
    expect(model.operationsById.get(updateId)?.review.destination).toEqual({
      kind: 'assetBatch',
      name: 'Rotate landscape photos',
    });
    expect(model.operationsById.get(updateId)?.review.summary).toBe('Rotate landscape photos');
  });

  it('exposes bounded thumbnail summaries for large operations and groups', () => {
    const assetIds = Array.from(
      { length: 1_000 },
      (_, index) => `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    );
    const model = buildOperationReviewModel(
      plan([
        operation({
          id: addId,
          type: AgentOperationType.AlbumAddAssets,
          summary: 'Add many assets',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          targetId: '00000000-0000-4000-8000-000000000301',
          assetIds,
          payload: {},
        }),
      ]),
      { [addId]: true },
    );

    expect(model.operationsById.get(addId)?.review.thumbnails).toEqual({
      totalCount: 1_000,
      representativeAssetIds: assetIds.slice(0, 12),
      hasMore: true,
    });
    expect(model.groups[0].thumbnailSummary).toEqual({
      totalCount: 1_000,
      representativeAssetIds: assetIds.slice(0, 12),
      hasMore: true,
    });
  });

  describe('buildAgentPlanThumbnailStrip', () => {
    it('returns a bounded collapsed thumbnail set and overflow count for large plans', () => {
      const strip = buildAgentPlanThumbnailStrip(thumbnailGroup(20), 4);

      expect(strip).toEqual({
        totalCount: 20,
        assetIds: ['asset-001', 'asset-002', 'asset-003', 'asset-004'],
        overflowCount: 16,
        hasMore: true,
        hasThumbnails: true,
      });
    });

    it('uses the default collapsed strip limit and never exceeds the maximum supported strip size', () => {
      const defaultStrip = buildAgentPlanThumbnailStrip(thumbnailGroup(20));
      const oversizedStrip = buildAgentPlanThumbnailStrip(thumbnailGroup(20), 200);

      expect(defaultStrip.assetIds).toHaveLength(AGENT_PLAN_THUMBNAIL_STRIP_DEFAULT_LIMIT);
      expect(oversizedStrip.assetIds).toHaveLength(AGENT_PLAN_THUMBNAIL_STRIP_MAX_LIMIT);
      expect(oversizedStrip.overflowCount).toBe(8);
    });

    it('handles zero and negative limits without rendering thumbnails', () => {
      expect(buildAgentPlanThumbnailStrip(thumbnailGroup(5), 0)).toEqual({
        totalCount: 5,
        assetIds: [],
        overflowCount: 0,
        hasMore: false,
        hasThumbnails: false,
      });

      expect(buildAgentPlanThumbnailStrip(thumbnailGroup(5), -4).assetIds).toHaveLength(0);
    });

    it('returns a no-preview model when assets exist but representative thumbnail IDs are unavailable', () => {
      const group = thumbnailGroup(7);
      const strip = buildAgentPlanThumbnailStrip(
        {
          ...group,
          representativeAssetIds: [],
          thumbnailSummary: {
            totalCount: 7,
            representativeAssetIds: [],
            hasMore: true,
          },
        },
        6,
      );

      expect(strip).toEqual({
        totalCount: 7,
        assetIds: [],
        overflowCount: 0,
        hasMore: false,
        hasThumbnails: false,
      });
    });
  });

  it('marks disabled and blocked operations as unselected in review selection metadata', () => {
    const model = buildOperationReviewModel(
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
      { [createId]: false, [addId]: true },
    );

    expect(model.operationsById.get(createId)?.review.selection).toEqual({
      itemKind: 'asset',
      totalCount: 0,
      selectedCount: 0,
      mode: 'none',
      supportsItemSelection: false,
    });
    expect(model.operationsById.get(addId)?.review.selection).toEqual({
      itemKind: 'asset',
      totalCount: 2,
      selectedCount: 0,
      mode: 'none',
      supportsItemSelection: false,
    });
    expect(model.operationsById.get(addId)?.review.dependencies).toEqual([
      { operationId: createId, summary: 'Create Portugal album', blocked: true },
    ]);
  });

  it('builds an empty review model and legacy empty selection payload for an empty operation plan', () => {
    const model = buildOperationReviewModel(plan([]), {});

    expect(model.groups).toEqual([]);
    expect(model.operationsById.size).toBe(0);
    expect(buildApprovedOperationIds(model)).toEqual([]);
    expect(buildSelectionPayload(model)).toEqual({ planId, operationIds: [] });
  });

  it('keeps legacy operation-id apply payload while exposing the richer review model', () => {
    const model = buildOperationReviewModel(
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
      { [createId]: true, [addId]: true },
    );

    expect(buildSelectionPayload(model)).toEqual({ planId, operationIds: [createId, addId] });
    expect(model.groups[0]).toEqual(
      expect.objectContaining({
        id: 'new-album:album-portugal',
        title: 'New album "Portugal"',
        subtitle: '2 operations',
        assetCount: 2,
        representativeAssetIds: [assetA, assetB],
      }),
    );
    expect(model.operationsById.get(addId)).toEqual(
      expect.objectContaining({
        id: addId,
        summary: 'Add 2 photos',
        assetCount: 2,
        representativeAssetIds: [assetA, assetB],
      }),
    );
  });

  it('summarizes selected destinations, changes, and assets for the evidence ledger shell', () => {
    const model = buildOperationReviewModel(
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
          summary: 'Update existing Portugal description',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          targetId: '00000000-0000-4000-8000-000000000301',
          payload: { description: 'Updated trip notes' },
        }),
      ]),
      { [createId]: true, [addId]: true, [updateId]: true },
    );

    expect(buildOperationReviewImpactSummary(model)).toEqual({
      destinationCount: 2,
      totalOperationCount: 3,
      selectedOperationCount: 3,
      blockedOperationCount: 0,
      totalAssetCount: 2,
      selectedAssetCount: 2,
    });
  });

  it('excludes disabled and blocked operations from selected evidence ledger impact counts', () => {
    const model = buildOperationReviewModel(
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
          summary: 'Update existing Portugal description',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          targetId: '00000000-0000-4000-8000-000000000301',
          payload: { description: 'Updated trip notes' },
        }),
      ]),
      { [createId]: false, [addId]: true, [updateId]: true },
    );

    expect(buildOperationReviewImpactSummary(model)).toEqual({
      destinationCount: 2,
      totalOperationCount: 3,
      selectedOperationCount: 1,
      blockedOperationCount: 1,
      totalAssetCount: 2,
      selectedAssetCount: 0,
    });
  });

  it('groups new-album operations by temporary target and keeps operation order', () => {
    const model = buildOperationReviewModel(
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
          id: coverId,
          type: AgentOperationType.AlbumSetCover,
          summary: 'Set cover',
          targetKind: AgentOperationTargetKind.NewAlbum,
          temporaryTargetId: 'album-portugal',
          assetIds: [assetA],
          dependencyIds: [createId],
          payload: {},
        }),
      ]),
      { [createId]: true, [addId]: true, [coverId]: true },
    );

    expect(model.groups).toHaveLength(1);
    expect(model.groups[0]).toEqual(
      expect.objectContaining({
        id: 'new-album:album-portugal',
        title: 'New album "Portugal"',
        subtitle: '3 operations',
        assetCount: 2,
      }),
    );
    expect(model.groups[0].operations.map((operation) => operation.id)).toEqual([createId, addId, coverId]);
  });

  it('marks dependent operations blocked when their create-album dependency is disabled', () => {
    const model = buildOperationReviewModel(
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
      { [createId]: false, [addId]: true },
    );

    expect(model.operationsById.get(addId)).toEqual(
      expect.objectContaining({
        blocked: true,
        enabled: false,
        blockedBy: ['Create Portugal album'],
      }),
    );
    expect(buildApprovedOperationIds(model)).toEqual([]);
  });

  it('blocks transitive dependents when an intermediate dependency is blocked', () => {
    const model = buildOperationReviewModel(
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
          id: coverId,
          type: AgentOperationType.AlbumSetCover,
          summary: 'Set cover',
          targetKind: AgentOperationTargetKind.NewAlbum,
          temporaryTargetId: 'album-portugal',
          assetIds: [assetA],
          dependencyIds: [addId],
          payload: {},
        }),
      ]),
      { [createId]: false, [addId]: true, [coverId]: true },
    );

    expect(model.operationsById.get(addId)).toEqual(expect.objectContaining({ blocked: true, enabled: false }));
    expect(model.operationsById.get(coverId)).toEqual(
      expect.objectContaining({
        blocked: true,
        enabled: false,
        blockedBy: ['Add two assets'],
      }),
    );
    expect(model.operationsById.get(coverId)?.review.dependencies).toEqual([
      { operationId: addId, summary: 'Add two assets', blocked: true },
    ]);
    expect(buildSelectionPayload(model)).toEqual({ planId, operationIds: [] });
  });

  it('blocks operations that reference a missing dependency', () => {
    const model = buildOperationReviewModel(
      plan([
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
      { [addId]: true },
    );

    expect(model.operationsById.get(addId)).toEqual(
      expect.objectContaining({
        blocked: true,
        enabled: false,
        blockedBy: ['Missing dependency'],
      }),
    );
    expect(buildSelectionPayload(model)).toEqual({ planId, operationIds: [] });
  });

  it('builds group toggle state without changing operations outside the group', () => {
    const initialPlan = plan([
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
        summary: 'Update existing Portugal description',
        targetKind: AgentOperationTargetKind.ExistingAlbum,
        targetId: '00000000-0000-4000-8000-000000000301',
        payload: { description: 'Updated trip notes' },
      }),
    ]);
    const initialState = { [createId]: true, [addId]: true, [updateId]: true };
    const initialModel = buildOperationReviewModel(initialPlan, initialState);

    const nextState = buildGroupEnabledState(initialState, initialModel.groups[0], false);
    const nextModel = buildOperationReviewModel(initialPlan, nextState);

    expect(nextState).toEqual({ [createId]: false, [addId]: false, [updateId]: true });
    expect(buildSelectionPayload(nextModel)).toEqual({ planId, operationIds: [updateId] });
  });

  it('preserves independent existing-album operations when a new-album dependency is disabled', () => {
    const model = buildOperationReviewModel(
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
          id: updateId,
          type: AgentOperationType.AlbumUpdateDetails,
          summary: 'Update existing Portugal description',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          targetId: '00000000-0000-4000-8000-000000000301',
          payload: { description: 'Updated trip notes' },
        }),
      ]),
      { [createId]: false, [updateId]: true },
    );

    expect(buildApprovedOperationIds(model)).toEqual([updateId]);
    expect(model.groups.map((group) => group.id)).toEqual([
      'new-album:album-portugal',
      'existing-album:00000000-0000-4000-8000-000000000301',
    ]);
  });

  it('uses a generic existing-album group title when an existing-album operation has no target id', () => {
    const model = buildOperationReviewModel(
      plan([
        operation({
          id: updateId,
          type: AgentOperationType.AlbumUpdateDetails,
          summary: 'Update existing Portugal description',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          targetId: null,
          payload: { description: 'Updated trip notes' },
        }),
      ]),
      { [updateId]: true },
    );

    expect(model.groups[0]).toEqual(
      expect.objectContaining({
        id: `operation:${updateId}`,
        title: 'Existing album',
      }),
    );
  });

  it('creates the initial enabled state from server operation defaults', () => {
    expect(
      createInitialOperationEnabledState(
        plan([
          operation({
            id: createId,
            type: AgentOperationType.AlbumCreate,
            summary: 'Create album',
            targetKind: AgentOperationTargetKind.NewAlbum,
            temporaryTargetId: 'album-portugal',
            enabled: false,
            payload: { albumName: 'Portugal' },
          }),
          operation({
            id: updateId,
            type: AgentOperationType.AlbumUpdateDetails,
            summary: 'Update album',
            targetKind: AgentOperationTargetKind.ExistingAlbum,
            targetId: '00000000-0000-4000-8000-000000000301',
            enabled: true,
            payload: { description: 'Updated trip notes' },
          }),
        ]),
      ),
    ).toEqual({ [createId]: false, [updateId]: true });
  });

  it('counts unique assets across operations', () => {
    expect(
      getOperationAssetCount([
        operation({
          id: addId,
          type: AgentOperationType.AlbumAddAssets,
          summary: 'Add assets',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          targetId: '00000000-0000-4000-8000-000000000301',
          assetIds: [assetA, assetB],
          payload: {},
        }),
        operation({
          id: coverId,
          type: AgentOperationType.AlbumSetCover,
          summary: 'Set cover',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          targetId: '00000000-0000-4000-8000-000000000301',
          assetIds: [assetA],
          payload: {},
        }),
      ]),
    ).toBe(2);
  });
});
