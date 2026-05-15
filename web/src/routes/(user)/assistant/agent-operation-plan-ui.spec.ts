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
  buildApprovedOperationIds,
  buildGroupEnabledState,
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

describe('agent operation plan UI helpers', () => {
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
