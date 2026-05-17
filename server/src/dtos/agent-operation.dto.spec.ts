import {
  AgentOperationPlanApplyRequestDto,
  AgentOperationPlanApplyResponseDto,
  AgentOperationPlanParamsDto,
  AgentOperationPlanResponseDto,
  AgentOperationPlanSummaryRequestDto,
  AgentOperationPlanToolRequestSchemas,
  AgentOperationPlanToolResponseDto,
  AgentProposeAlbumOperationsDto,
  AgentReviseAlbumOperationsDto,
} from 'src/dtos/agent-operation.dto';
import {
  AgentOperationApplyStatus,
  AgentOperationPlanStatus,
  AgentOperationRiskLevel,
  AgentOperationStatus,
  AgentOperationTargetKind,
  AgentOperationType,
  AgentToolName,
} from 'src/enum';
import { factory } from 'test/small.factory';
import z from 'zod';

const expectIssue = (
  result: { success: boolean; error?: z.ZodError },
  path: Array<string | number>,
  message: string,
) => {
  expect(result.success).toBe(false);
  expect(result.error?.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path,
        message: expect.stringContaining(message),
      }),
    ]),
  );
};

const makeCreateAlbumOperation = () => ({
  type: AgentOperationType.AlbumCreate,
  summary: 'Create Portugal highlights.',
  targetKind: AgentOperationTargetKind.NewAlbum,
  temporaryTargetId: 'tmp-portugal',
  payload: { albumName: 'Portugal highlights', description: '' },
});

const makePlanningToolRequest = () => ({
  summary: 'Create a Portugal highlights album.',
  operations: [makeCreateAlbumOperation()],
});

describe('Agent operation DTOs', () => {
  it('accepts a create album operation proposal and defaults enabled/risk fields', () => {
    const result = AgentProposeAlbumOperationsDto.schema.safeParse({
      summary: 'Create a Portugal trip album.',
      operations: [
        {
          type: AgentOperationType.AlbumCreate,
          summary: 'Create Portugal 2026.',
          targetKind: AgentOperationTargetKind.NewAlbum,
          temporaryTargetId: 'tmp-portugal-2026',
          payload: { albumName: 'Portugal 2026', description: 'Best travel photos.' },
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.operations[0]).toMatchObject({
        enabled: true,
        riskLevel: AgentOperationRiskLevel.Low,
      });
    }
  });

  it('accepts add assets to a newly proposed album by temporary target id', () => {
    const assetId = factory.uuid();
    const result = AgentProposeAlbumOperationsDto.schema.safeParse({
      summary: 'Create Portugal and add one photo.',
      operations: [
        {
          type: AgentOperationType.AlbumCreate,
          summary: 'Create Portugal 2026.',
          targetKind: AgentOperationTargetKind.NewAlbum,
          temporaryTargetId: 'tmp-portugal-2026',
          payload: { albumName: 'Portugal 2026' },
        },
        {
          type: AgentOperationType.AlbumAddAssets,
          summary: 'Add beach photo.',
          targetKind: AgentOperationTargetKind.NewAlbum,
          temporaryTargetId: 'tmp-portugal-2026',
          assetIds: [assetId],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects create album operations without a temporary target id', () => {
    const result = AgentProposeAlbumOperationsDto.schema.safeParse({
      summary: 'Invalid create.',
      operations: [
        {
          type: AgentOperationType.AlbumCreate,
          summary: 'Create missing temp id.',
          targetKind: AgentOperationTargetKind.NewAlbum,
          payload: { albumName: 'Portugal' },
        },
      ],
    });

    expectIssue(result, ['operations', 0, 'temporaryTargetId'], 'Required');
  });

  it('rejects duplicate asset ids within one operation', () => {
    const assetId = factory.uuid();
    const result = AgentProposeAlbumOperationsDto.schema.safeParse({
      summary: 'Invalid add.',
      operations: [
        {
          type: AgentOperationType.AlbumAddAssets,
          summary: 'Duplicate add.',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          targetId: factory.uuid(),
          assetIds: [assetId, assetId],
        },
      ],
    });

    expectIssue(result, ['operations', 0, 'assetIds'], 'assetIds must be unique');
  });

  it('rejects existing album operations without targetId', () => {
    const result = AgentProposeAlbumOperationsDto.schema.safeParse({
      summary: 'Invalid target.',
      operations: [
        {
          type: AgentOperationType.AlbumSetCover,
          summary: 'Set cover without target id.',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          assetIds: [factory.uuid()],
        },
      ],
    });

    expectIssue(result, ['operations', 0, 'targetId'], 'targetId is required for existing album targets');
  });

  it('rejects existing album add-assets targets with temporary target ids', () => {
    const result = AgentProposeAlbumOperationsDto.schema.safeParse({
      summary: 'Invalid contradictory target.',
      operations: [
        {
          type: AgentOperationType.AlbumAddAssets,
          summary: 'Add photos ambiguously.',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          targetId: factory.uuid(),
          temporaryTargetId: 'tmp-portugal-2026',
          assetIds: [factory.uuid()],
        },
      ],
    });

    expectIssue(
      result,
      ['operations', 0, 'temporaryTargetId'],
      'temporaryTargetId is only valid for new album targets',
    );
  });

  it('rejects new album set-cover targets with persistent target ids', () => {
    const result = AgentProposeAlbumOperationsDto.schema.safeParse({
      summary: 'Invalid contradictory target.',
      operations: [
        {
          type: AgentOperationType.AlbumSetCover,
          summary: 'Set cover ambiguously.',
          targetKind: AgentOperationTargetKind.NewAlbum,
          targetId: factory.uuid(),
          temporaryTargetId: 'tmp-portugal-2026',
          assetIds: [factory.uuid()],
        },
      ],
    });

    expectIssue(result, ['operations', 0, 'targetId'], 'targetId is only valid for existing album targets');
  });

  it('enforces operation count, asset count, text limits, and create-description defaults', () => {
    const assetIds = Array.from({ length: 10_001 }, () => factory.uuid());
    const tooManyOperations = Array.from({ length: 501 }, (_, index) => ({
      type: AgentOperationType.AlbumCreate,
      summary: `Create album ${index}.`,
      targetKind: AgentOperationTargetKind.NewAlbum,
      temporaryTargetId: `tmp-album-${index}`,
      payload: { albumName: `Album ${index}` },
    }));

    expectIssue(
      AgentProposeAlbumOperationsDto.schema.safeParse({
        summary: 'Too many operations.',
        operations: tooManyOperations,
      }),
      ['operations'],
      'Too big',
    );
    expectIssue(
      AgentProposeAlbumOperationsDto.schema.safeParse({
        summary: 'Too many assets.',
        operations: [
          {
            type: AgentOperationType.AlbumAddAssets,
            summary: 'Add too many assets.',
            targetKind: AgentOperationTargetKind.ExistingAlbum,
            targetId: factory.uuid(),
            assetIds,
          },
        ],
      }),
      ['operations', 0, 'assetIds'],
      'Too big',
    );
    expectIssue(
      AgentProposeAlbumOperationsDto.schema.safeParse({
        summary: 'Long album name.',
        operations: [
          {
            type: AgentOperationType.AlbumCreate,
            summary: 'Create with long name.',
            targetKind: AgentOperationTargetKind.NewAlbum,
            temporaryTargetId: 'tmp-long-name',
            payload: { albumName: 'a'.repeat(201) },
          },
        ],
      }),
      ['operations', 0, 'payload', 'albumName'],
      'Too big',
    );
    expectIssue(
      AgentProposeAlbumOperationsDto.schema.safeParse({
        summary: 'Long description.',
        operations: [
          {
            type: AgentOperationType.AlbumUpdateDetails,
            summary: 'Update with long description.',
            targetKind: AgentOperationTargetKind.ExistingAlbum,
            targetId: factory.uuid(),
            payload: { description: 'a'.repeat(1001) },
          },
        ],
      }),
      ['operations', 0, 'payload', 'description'],
      'Too big',
    );
    expectIssue(
      AgentReviseAlbumOperationsDto.schema.safeParse({
        feedback: 'a'.repeat(2001),
        summary: 'Revise with too much feedback.',
        operations: [
          {
            type: AgentOperationType.AlbumCreate,
            summary: 'Create album.',
            targetKind: AgentOperationTargetKind.NewAlbum,
            temporaryTargetId: 'tmp-album',
            payload: { albumName: 'Album' },
          },
        ],
      }),
      ['feedback'],
      'Too big',
    );

    const validCreate = AgentProposeAlbumOperationsDto.schema.safeParse({
      summary: 'Create album.',
      operations: [
        {
          type: AgentOperationType.AlbumCreate,
          summary: 'Create with default description.',
          targetKind: AgentOperationTargetKind.NewAlbum,
          temporaryTargetId: 'tmp-default-description',
          payload: { albumName: 'Album' },
        },
      ],
    });

    expect(validCreate.success).toBe(true);
    if (validCreate.success) {
      expect(validCreate.data.operations[0].payload).toMatchObject({ description: '' });
    }
  });

  it('accepts revision requests with a non-empty operation list', () => {
    const result = AgentReviseAlbumOperationsDto.schema.safeParse({
      feedback: 'Split Lisbon and Porto into separate albums.',
      summary: 'Separate city albums.',
      operations: [
        {
          type: AgentOperationType.AlbumUpdateDetails,
          summary: 'Rename existing album.',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          targetId: factory.uuid(),
          payload: { albumName: 'Lisbon highlights' },
          riskLevel: AgentOperationRiskLevel.Medium,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('accepts summarize-plan requests', () => {
    const result = AgentOperationPlanSummaryRequestDto.schema.safeParse({
      focus: 'Explain high risk changes.',
    });

    expect(result.success).toBe(true);
  });

  it('accepts operation plan params', () => {
    const result = AgentOperationPlanParamsDto.schema.safeParse({ id: factory.uuid(), planId: factory.uuid() });

    expect(result.success).toBe(true);
  });

  it('serializes persisted plan responses with dates and dependency ids', () => {
    const planId = factory.uuid();
    const operationId = factory.uuid();
    const dependencyId = factory.uuid();
    const result = AgentOperationPlanResponseDto.schema.safeParse({
      id: planId,
      sessionId: factory.uuid(),
      revision: 2,
      status: AgentOperationPlanStatus.Proposed,
      summary: 'Portugal album plan.',
      operations: [
        {
          id: operationId,
          planId,
          type: AgentOperationType.AlbumAddAssets,
          summary: 'Add photos.',
          targetKind: AgentOperationTargetKind.NewAlbum,
          targetId: null,
          temporaryTargetId: 'tmp-portugal-2026',
          assetIds: [factory.uuid()],
          payload: {},
          dependencyIds: [dependencyId],
          riskLevel: AgentOperationRiskLevel.Low,
          enabled: true,
          status: AgentOperationStatus.Proposed,
          result: null,
          error: null,
          createdAt: '2026-05-15T12:00:00.000Z',
          updatedAt: '2026-05-15T12:00:01.000Z',
        },
      ],
      createdAt: '2026-05-15T12:00:00.000Z',
      updatedAt: '2026-05-15T12:00:01.000Z',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.createdAt).toEqual(new Date('2026-05-15T12:00:00.000Z'));
      expect(result.data.operations[0].dependencyIds).toEqual([dependencyId]);
    }
  });

  it('encodes Date-backed persisted plan responses as ISO strings', () => {
    const planId = factory.uuid();
    const result = AgentOperationPlanResponseDto.schema.safeEncode({
      id: planId,
      sessionId: factory.uuid(),
      revision: 1,
      status: AgentOperationPlanStatus.Proposed,
      summary: 'Portugal album plan.',
      operations: [
        {
          id: factory.uuid(),
          planId,
          type: AgentOperationType.AlbumSetCover,
          summary: 'Set cover.',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          targetId: factory.uuid(),
          temporaryTargetId: null,
          assetIds: [factory.uuid()],
          payload: {},
          dependencyIds: [],
          riskLevel: AgentOperationRiskLevel.Low,
          enabled: true,
          status: AgentOperationStatus.Proposed,
          result: null,
          error: null,
          createdAt: new Date('2026-05-15T12:00:00.000Z'),
          updatedAt: new Date('2026-05-15T12:00:01.000Z'),
        },
      ],
      createdAt: new Date('2026-05-15T12:00:00.000Z'),
      updatedAt: new Date('2026-05-15T12:00:01.000Z'),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.createdAt).toBe('2026-05-15T12:00:00.000Z');
      expect(result.data.operations[0].updatedAt).toBe('2026-05-15T12:00:01.000Z');
    }
  });

  it('accepts a unique apply operation id list', () => {
    const firstOperationId = factory.uuid();
    const secondOperationId = factory.uuid();

    const result = AgentOperationPlanApplyRequestDto.schema.safeParse({
      operationIds: [firstOperationId, secondOperationId],
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ operationIds: [firstOperationId, secondOperationId] });
  });

  it('accepts sparse apply item selections and a numeric plan revision', () => {
    const operationId = factory.uuid();
    const assetId = factory.uuid();

    const result = AgentOperationPlanApplyRequestDto.schema.safeParse({
      operationIds: [operationId],
      itemSelections: {
        [operationId]: {
          itemKind: 'asset',
          mode: 'allExcept',
          itemIds: [assetId],
        },
      },
      planRevision: 3,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      operationIds: [operationId],
      itemSelections: {
        [operationId]: {
          itemKind: 'asset',
          mode: 'allExcept',
          itemIds: [assetId],
        },
      },
      planRevision: 3,
    });
  });

  it('rejects duplicate apply operation ids', () => {
    const operationId = factory.uuid();

    const result = AgentOperationPlanApplyRequestDto.schema.safeParse({
      operationIds: [operationId, operationId],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([expect.objectContaining({ message: 'operationIds must be unique' })]);
  });

  it('rejects duplicate sparse item ids', () => {
    const operationId = factory.uuid();
    const assetId = factory.uuid();

    const result = AgentOperationPlanApplyRequestDto.schema.safeParse({
      operationIds: [operationId],
      itemSelections: {
        [operationId]: {
          itemKind: 'asset',
          mode: 'only',
          itemIds: [assetId, assetId],
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([expect.objectContaining({ message: 'itemIds must be unique' })]);
  });

  it('rejects unsupported sparse item kinds', () => {
    const operationId = factory.uuid();

    const result = AgentOperationPlanApplyRequestDto.schema.safeParse({
      operationIds: [operationId],
      itemSelections: {
        [operationId]: {
          itemKind: 'photo',
          mode: 'none',
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects an empty apply operation id list', () => {
    const result = AgentOperationPlanApplyRequestDto.schema.safeParse({ operationIds: [] });

    expect(result.success).toBe(false);
  });

  it('accepts an apply response with per-operation result groups', () => {
    const planId = factory.uuid();
    const operationId = factory.uuid();
    const createdAt = '2026-05-16T12:00:00.000Z';
    const updatedAt = '2026-05-16T12:00:01.000Z';

    const result = AgentOperationPlanApplyResponseDto.schema.safeParse({
      status: AgentOperationApplyStatus.Applied,
      plan: {
        id: planId,
        sessionId: factory.uuid(),
        revision: 1,
        status: AgentOperationPlanStatus.Applied,
        summary: 'Portugal plan.',
        operations: [
          {
            id: operationId,
            planId,
            type: AgentOperationType.AlbumCreate,
            summary: 'Create Portugal.',
            targetKind: AgentOperationTargetKind.NewAlbum,
            targetId: null,
            temporaryTargetId: 'tmp-portugal',
            assetIds: [],
            payload: { albumName: 'Portugal' },
            dependencyIds: [],
            riskLevel: AgentOperationRiskLevel.Low,
            enabled: true,
            status: AgentOperationStatus.Applied,
            result: { albumId: factory.uuid() },
            error: null,
            createdAt,
            updatedAt,
          },
        ],
        createdAt,
        updatedAt,
      },
      appliedOperationIds: [operationId],
      skippedOperationIds: [],
      failedOperationIds: [],
      summary: 'Applied 1 operation.',
    });

    expect(result.success).toBe(true);
    expect(result.data?.plan.operations[0].createdAt).toEqual(new Date(createdAt));
  });

  it('serializes planning tool responses with no plan as null', () => {
    const result = AgentOperationPlanToolResponseDto.schema.safeParse({
      status: 'success',
      plan: null,
      toolCall: null,
      summary: 'No proposed plan exists.',
    });

    expect(result.success).toBe(true);
  });

  describe('MCP planning tool request schemas', () => {
    it('does not require planId for proposeAlbumOperations', () => {
      const result =
        AgentOperationPlanToolRequestSchemas[AgentToolName.ProposeAlbumOperations].safeParse(makePlanningToolRequest());

      expect(result.success).toBe(true);
    });

    it('requires planId for reviseProposedOperations MCP calls and keeps the body fields', () => {
      const planId = factory.uuid();
      const valid = AgentOperationPlanToolRequestSchemas[AgentToolName.ReviseProposedOperations].safeParse({
        planId,
        feedback: 'Use a shorter title.',
        ...makePlanningToolRequest(),
      });

      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data).toMatchObject({
          planId,
          feedback: 'Use a shorter title.',
          summary: 'Create a Portugal highlights album.',
          operations: expect.any(Array),
        });
      }

      expectIssue(
        AgentOperationPlanToolRequestSchemas[AgentToolName.ReviseProposedOperations].safeParse(
          makePlanningToolRequest(),
        ),
        ['planId'],
        'Invalid input',
      );
      expectIssue(
        AgentOperationPlanToolRequestSchemas[AgentToolName.ReviseProposedOperations].safeParse({
          planId: 'not-a-uuid',
          ...makePlanningToolRequest(),
        }),
        ['planId'],
        'Invalid UUID',
      );
    });

    it('requires planId for summarizePlan MCP calls and validates focus', () => {
      const planId = factory.uuid();
      const valid = AgentOperationPlanToolRequestSchemas[AgentToolName.SummarizePlan].safeParse({
        planId,
        focus: 'risk',
      });

      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data).toEqual({ planId, focus: 'risk' });
      }

      expectIssue(
        AgentOperationPlanToolRequestSchemas[AgentToolName.SummarizePlan].safeParse({ focus: 'risk' }),
        ['planId'],
        'Invalid input',
      );
      expectIssue(
        AgentOperationPlanToolRequestSchemas[AgentToolName.SummarizePlan].safeParse({
          planId: 'not-a-uuid',
          focus: 'risk',
        }),
        ['planId'],
        'Invalid UUID',
      );
      expectIssue(
        AgentOperationPlanToolRequestSchemas[AgentToolName.SummarizePlan].safeParse({
          planId,
          focus: '',
        }),
        ['focus'],
        'Too small',
      );
    });

    it('keeps strict object validation for planning MCP tool arguments', () => {
      expectIssue(
        AgentOperationPlanToolRequestSchemas[AgentToolName.ProposeAlbumOperations].safeParse({
          ...makePlanningToolRequest(),
          unexpected: true,
        }),
        [],
        'Unrecognized key',
      );
      expectIssue(
        AgentOperationPlanToolRequestSchemas[AgentToolName.ReviseProposedOperations].safeParse({
          planId: factory.uuid(),
          ...makePlanningToolRequest(),
          unexpected: true,
        }),
        [],
        'Unrecognized key',
      );
      expectIssue(
        AgentOperationPlanToolRequestSchemas[AgentToolName.SummarizePlan].safeParse({
          planId: factory.uuid(),
          focus: 'risk',
          unexpected: true,
        }),
        [],
        'Unrecognized key',
      );
    });
  });
});
