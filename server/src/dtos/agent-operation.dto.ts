import { createZodDto } from 'nestjs-zod';
import { AgentSearchSourceRefSchema } from 'src/dtos/agent-asset-source.dto';
import { AgentToolCallResponseDto } from 'src/dtos/agent-tool.dto';
import {
  AgentOperationApplyStatus,
  AgentOperationPlanStatus,
  AgentOperationRiskLevel,
  AgentOperationStatus,
  AgentOperationTargetKind,
  AgentOperationType,
  AgentToolName,
  SharedSpaceRole,
  UserAvatarColorSchema,
} from 'src/enum';
import { AgentAssetSourceInput, validateAgentAssetSourceMechanismCount } from 'src/types/agent-asset-source.types';
import { isoDatetimeToDate } from 'src/validation';
import z from 'zod';

const uuid = z.uuidv4();
const summary = z.string().trim().min(1).max(1000);
const temporaryTargetId = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9_-]+$/);
const emptyPayload = z.strictObject({}).optional();
const uniqueAssetIds = z
  .array(uuid)
  .min(1)
  .max(10_000)
  .superRefine((assetIds, ctx) => {
    if (new Set(assetIds).size !== assetIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'assetIds must be unique',
      });
    }
  });
const uniqueCoverAssetIds = z
  .array(uuid)
  .min(1)
  .max(500)
  .superRefine((assetIds, ctx) => {
    if (new Set(assetIds).size !== assetIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'assetIds must be unique',
      });
    }
  });
const assetSelectionHandleId = uuid;
const agentAssetSourceInput = z
  .strictObject({
    kind: z.literal('previousSearch'),
    sourceRef: AgentSearchSourceRefSchema,
  })
  .meta({ id: 'AgentOperationPlanningAssetSourceInput' }) as z.ZodType<
  Extract<AgentAssetSourceInput, { kind: 'previousSearch' }>
>;
const assetSelection = {
  assetSource: agentAssetSourceInput.optional(),
  assetIds: uniqueAssetIds.optional(),
  assetSelectionHandleId: assetSelectionHandleId.optional(),
};
const coverAssetSelection = {
  assetSource: agentAssetSourceInput.optional(),
  assetIds: uniqueCoverAssetIds.optional(),
  assetSelectionHandleId: assetSelectionHandleId.optional(),
};
const uniqueOperationIds = z
  .array(uuid)
  .min(1)
  .max(500)
  .superRefine((operationIds, ctx) => {
    if (new Set(operationIds).size !== operationIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'operationIds must be unique',
      });
    }
  });
const uniqueSelectionItemIds = (schema = z.array(uuid).max(10_000)) =>
  schema.superRefine((itemIds, ctx) => {
    if (new Set(itemIds).size !== itemIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'itemIds must be unique',
      });
    }
  });
const requiredUniqueSelectionItemIds = uniqueSelectionItemIds(z.array(uuid).min(1).max(10_000));
const fieldOverrideValue = z.string();
const AgentOperationFieldOverrideSchema = z
  .record(z.string().trim().min(1).max(80), fieldOverrideValue)
  .superRefine((override, ctx) => {
    const keyCount = Object.keys(override).length;
    if (keyCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'fieldOverrides must not be empty',
      });
    }

    if (keyCount > 20) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'fieldOverrides may contain at most 20 fields per operation',
      });
    }
  })
  .meta({ id: 'AgentOperationFieldOverride' });

const AgentOperationPlanStatusSchema = z.enum(AgentOperationPlanStatus).meta({ id: 'AgentOperationPlanStatus' });
const AgentOperationApplyStatusSchema = z.enum(AgentOperationApplyStatus).meta({ id: 'AgentOperationApplyStatus' });
const AgentOperationTypeSchema = z.enum(AgentOperationType).meta({ id: 'AgentOperationType' });
const AgentOperationTargetKindSchema = z.enum(AgentOperationTargetKind).meta({ id: 'AgentOperationTargetKind' });
const AgentOperationRiskLevelSchema = z.enum(AgentOperationRiskLevel).meta({ id: 'AgentOperationRiskLevel' });
const AgentOperationStatusSchema = z.enum(AgentOperationStatus).meta({ id: 'AgentOperationStatus' });
const AgentOperationItemKindSchema = z
  .enum(['asset', 'album', 'space', 'person', 'tag'])
  .meta({ id: 'AgentOperationItemKind' });

const AgentOperationItemSelectionSchema = z
  .discriminatedUnion('mode', [
    z.strictObject({
      itemKind: AgentOperationItemKindSchema,
      mode: z.literal('all'),
      itemIds: z.array(uuid).length(0).optional(),
    }),
    z.strictObject({
      itemKind: AgentOperationItemKindSchema,
      mode: z.literal('allExcept'),
      itemIds: requiredUniqueSelectionItemIds,
    }),
    z.strictObject({
      itemKind: AgentOperationItemKindSchema,
      mode: z.literal('only'),
      itemIds: requiredUniqueSelectionItemIds,
    }),
    z.strictObject({
      itemKind: AgentOperationItemKindSchema,
      mode: z.literal('none'),
      itemIds: z.array(uuid).length(0).optional(),
    }),
  ])
  .meta({ id: 'AgentOperationItemSelection' });

const operationDefaults = {
  riskLevel: AgentOperationRiskLevelSchema.optional().default(AgentOperationRiskLevel.Low),
  enabled: z.boolean().optional().default(true),
};
const NewAlbumTargetKindSchema = z
  .literal(AgentOperationTargetKind.NewAlbum)
  .meta({ id: 'AgentOperationNewAlbumTargetKind' });
const ExistingAlbumTargetKindSchema = z
  .literal(AgentOperationTargetKind.ExistingAlbum)
  .meta({ id: 'AgentOperationExistingAlbumTargetKind' });
const NewSpaceTargetKindSchema = z
  .literal(AgentOperationTargetKind.NewSpace)
  .meta({ id: 'AgentOperationNewSpaceTargetKind' });
const ExistingSpaceTargetKindSchema = z
  .literal(AgentOperationTargetKind.ExistingSpace)
  .meta({ id: 'AgentOperationExistingSpaceTargetKind' });
const spaceDetailsPayload = z.strictObject({
  spaceName: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  color: UserAvatarColorSchema.optional(),
});

const createAlbumOperationSchema = z
  .strictObject({
    type: z.literal(AgentOperationType.AlbumCreate).meta({ id: 'AgentAlbumCreateOperationType' }),
    summary,
    targetKind: NewAlbumTargetKindSchema,
    temporaryTargetId: temporaryTargetId.optional(),
    riskLevel: operationDefaults.riskLevel,
    enabled: operationDefaults.enabled,
    payload: z.strictObject({
      albumName: z.string().trim().min(1).max(200),
      description: z.string().trim().max(1000).optional().default(''),
    }),
  })
  .superRefine((operation, ctx) => {
    if (!operation.temporaryTargetId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['temporaryTargetId'],
        message: 'Required',
      });
    }
  });

const addAssetsOperationSchema = z
  .strictObject({
    type: z.literal(AgentOperationType.AlbumAddAssets).meta({ id: 'AgentAlbumAddAssetsOperationType' }),
    summary,
    targetKind: AgentOperationTargetKindSchema,
    targetId: uuid.optional(),
    temporaryTargetId: temporaryTargetId.optional(),
    ...assetSelection,
    riskLevel: operationDefaults.riskLevel,
    enabled: operationDefaults.enabled,
    payload: emptyPayload,
  })
  .superRefine((operation, ctx) => {
    validateAssetSelection(operation, ctx);
    validateAlbumTarget(operation, ctx, [AgentOperationTargetKind.NewAlbum]);
  });

const removeAssetsOperationSchema = z
  .strictObject({
    type: z.literal(AgentOperationType.AlbumRemoveAssets).meta({ id: 'AgentAlbumRemoveAssetsOperationType' }),
    summary,
    targetKind: AgentOperationTargetKindSchema,
    targetId: uuid.optional(),
    temporaryTargetId: temporaryTargetId.optional(),
    ...assetSelection,
    riskLevel: operationDefaults.riskLevel,
    enabled: operationDefaults.enabled,
    payload: emptyPayload,
  })
  .superRefine((operation, ctx) => {
    validateAssetSelection(operation, ctx);
    validateAlbumTarget(operation, ctx);
  });

const updateDetailsOperationSchema = z
  .strictObject({
    type: z.literal(AgentOperationType.AlbumUpdateDetails).meta({ id: 'AgentAlbumUpdateDetailsOperationType' }),
    summary,
    targetKind: ExistingAlbumTargetKindSchema,
    targetId: uuid.optional(),
    riskLevel: operationDefaults.riskLevel,
    enabled: operationDefaults.enabled,
    payload: z
      .strictObject({
        albumName: z.string().trim().min(1).max(200).optional(),
        description: z.string().trim().max(1000).optional(),
      })
      .refine((payload) => payload.albumName !== undefined || payload.description !== undefined, {
        message: 'Provide albumName or description',
      }),
  })
  .superRefine((operation, ctx) => validateAlbumTarget(operation, ctx));

const setCoverOperationSchema = z
  .strictObject({
    type: z.literal(AgentOperationType.AlbumSetCover).meta({ id: 'AgentAlbumSetCoverOperationType' }),
    summary,
    targetKind: AgentOperationTargetKindSchema,
    targetId: uuid.optional(),
    temporaryTargetId: temporaryTargetId.optional(),
    ...coverAssetSelection,
    riskLevel: operationDefaults.riskLevel,
    enabled: operationDefaults.enabled,
    payload: emptyPayload,
  })
  .superRefine((operation, ctx) => {
    validateAssetSelection(operation, ctx);
    validateAlbumTarget(operation, ctx, [AgentOperationTargetKind.NewAlbum]);
  });

const createSpaceOperationSchema = z
  .strictObject({
    type: z.literal(AgentOperationType.SpaceCreate).meta({ id: 'AgentSpaceCreateOperationType' }),
    summary,
    targetKind: NewSpaceTargetKindSchema,
    temporaryTargetId: temporaryTargetId.optional(),
    riskLevel: operationDefaults.riskLevel,
    enabled: operationDefaults.enabled,
    payload: spaceDetailsPayload.extend({
      spaceName: z.string().trim().min(1).max(100),
    }),
  })
  .superRefine((operation, ctx) => {
    if (!operation.temporaryTargetId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['temporaryTargetId'],
        message: 'Required',
      });
    }
  });

const spaceAssetsOperationSchema = (type: AgentOperationType.SpaceAddAssets | AgentOperationType.SpaceRemoveAssets) =>
  z
    .strictObject({
      type: z.literal(type),
      summary,
      targetKind: AgentOperationTargetKindSchema,
      targetId: uuid.optional(),
      temporaryTargetId: temporaryTargetId.optional(),
      ...assetSelection,
      riskLevel: operationDefaults.riskLevel,
      enabled: operationDefaults.enabled,
      payload: emptyPayload,
    })
    .superRefine((operation, ctx) => {
      validateAssetSelection(operation, ctx);
      validateSpaceTarget(operation, ctx, [AgentOperationTargetKind.NewSpace]);
    });

const updateSpaceDetailsOperationSchema = z
  .strictObject({
    type: z.literal(AgentOperationType.SpaceUpdateDetails).meta({ id: 'AgentSpaceUpdateDetailsOperationType' }),
    summary,
    targetKind: ExistingSpaceTargetKindSchema,
    targetId: uuid.optional(),
    riskLevel: operationDefaults.riskLevel,
    enabled: operationDefaults.enabled,
    payload: spaceDetailsPayload.refine(
      (payload) => payload.spaceName !== undefined || payload.description !== undefined || payload.color !== undefined,
      { message: 'Provide spaceName, description, or color' },
    ),
  })
  .superRefine((operation, ctx) => validateSpaceTarget(operation, ctx));

const AgentAssignableSharedSpaceRoleSchema = z
  .enum([SharedSpaceRole.Editor, SharedSpaceRole.Viewer])
  .meta({ id: 'AgentAssignableSharedSpaceMemberRole' });
const uniqueUserIds = z
  .array(uuid)
  .min(1)
  .max(100)
  .superRefine((userIds, ctx) => {
    if (new Set(userIds).size !== userIds.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'userIds must be unique' });
    }
  });
const memberPayloads = z
  .array(
    z.strictObject({
      userId: uuid,
      role: AgentAssignableSharedSpaceRoleSchema,
    }),
  )
  .min(1)
  .max(100)
  .superRefine((members, ctx) => {
    const userIds = members.map((member) => member.userId);
    if (new Set(userIds).size !== userIds.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'members must contain unique userIds' });
    }
  });

const spaceAddMembersOperationSchema = z
  .strictObject({
    type: z.literal(AgentOperationType.SpaceAddMembers).meta({ id: 'AgentSpaceAddMembersOperationType' }),
    summary,
    targetKind: ExistingSpaceTargetKindSchema,
    targetId: uuid.optional(),
    temporaryTargetId: temporaryTargetId.optional(),
    riskLevel: operationDefaults.riskLevel,
    enabled: operationDefaults.enabled,
    payload: z.strictObject({ members: memberPayloads }),
  })
  .superRefine((operation, ctx) => validateSpaceTarget(operation, ctx));

const spaceRemoveMembersOperationSchema = z
  .strictObject({
    type: z.literal(AgentOperationType.SpaceRemoveMembers).meta({ id: 'AgentSpaceRemoveMembersOperationType' }),
    summary,
    targetKind: ExistingSpaceTargetKindSchema,
    targetId: uuid.optional(),
    temporaryTargetId: temporaryTargetId.optional(),
    riskLevel: operationDefaults.riskLevel,
    enabled: operationDefaults.enabled,
    payload: z.strictObject({ userIds: uniqueUserIds }),
  })
  .superRefine((operation, ctx) => validateSpaceTarget(operation, ctx));

const spaceUpdateMemberRoleOperationSchema = z
  .strictObject({
    type: z.literal(AgentOperationType.SpaceUpdateMemberRole).meta({ id: 'AgentSpaceUpdateMemberRoleOperationType' }),
    summary,
    targetKind: ExistingSpaceTargetKindSchema,
    targetId: uuid.optional(),
    temporaryTargetId: temporaryTargetId.optional(),
    riskLevel: operationDefaults.riskLevel,
    enabled: operationDefaults.enabled,
    payload: z.strictObject({
      userIds: uniqueUserIds,
      role: AgentAssignableSharedSpaceRoleSchema,
    }),
  })
  .superRefine((operation, ctx) => validateSpaceTarget(operation, ctx));

const assetBatchBase = {
  summary,
  targetKind: AgentOperationTargetKindSchema,
  targetId: uuid.optional(),
  temporaryTargetId: temporaryTargetId.optional(),
  ...assetSelection,
  riskLevel: operationDefaults.riskLevel,
  enabled: operationDefaults.enabled,
};

const rotateOperationSchema = z
  .strictObject({
    type: z.literal(AgentOperationType.AssetRotate).meta({ id: 'AgentAssetRotateOperationType' }),
    ...assetBatchBase,
    payload: z.strictObject({
      angle: z
        .number()
        .int()
        .refine((angle): angle is 90 | 180 | 270 => angle === 90 || angle === 180 || angle === 270, {
          message: 'angle must be 90, 180, or 270',
        }),
    }),
  })
  .superRefine((operation, ctx) => {
    validateAssetSelection(operation, ctx);
    validateStandaloneTarget(operation, ctx, AgentOperationTargetKind.ImageEditBatch, AgentOperationType.AssetRotate);
  });

const setFavoriteOperationSchema = z
  .strictObject({
    type: z.literal(AgentOperationType.AssetSetFavorite).meta({ id: 'AgentAssetSetFavoriteOperationType' }),
    ...assetBatchBase,
    payload: z.strictObject({ favorite: z.boolean() }),
  })
  .superRefine((operation, ctx) => {
    validateAssetSelection(operation, ctx);
    validateStandaloneTarget(operation, ctx, AgentOperationTargetKind.AssetBatch, AgentOperationType.AssetSetFavorite);
  });

const setArchiveOperationSchema = z
  .strictObject({
    type: z.literal(AgentOperationType.AssetSetArchive).meta({ id: 'AgentAssetSetArchiveOperationType' }),
    ...assetBatchBase,
    payload: z.strictObject({ archived: z.boolean() }),
  })
  .superRefine((operation, ctx) => {
    validateAssetSelection(operation, ctx);
    validateStandaloneTarget(operation, ctx, AgentOperationTargetKind.AssetBatch, AgentOperationType.AssetSetArchive);
  });

const addTagOperationSchema = z
  .strictObject({
    type: z.literal(AgentOperationType.AssetAddTag).meta({ id: 'AgentAssetAddTagOperationType' }),
    ...assetBatchBase,
    payload: z
      .strictObject({
        tagId: uuid.optional(),
        tagName: z.string().trim().min(1).max(200).optional(),
      })
      .refine((payload) => Number(payload.tagId !== undefined) + Number(payload.tagName !== undefined) === 1, {
        message: 'Provide exactly one of tagId or tagName',
      }),
  })
  .superRefine((operation, ctx) => {
    validateAssetSelection(operation, ctx);
    validateStandaloneTarget(operation, ctx, AgentOperationTargetKind.AssetBatch, AgentOperationType.AssetAddTag);
  });

const removeTagOperationSchema = z
  .strictObject({
    type: z.literal(AgentOperationType.AssetRemoveTag).meta({ id: 'AgentAssetRemoveTagOperationType' }),
    ...assetBatchBase,
    payload: z.strictObject({ tagId: uuid }),
  })
  .superRefine((operation, ctx) => {
    validateAssetSelection(operation, ctx);
    validateStandaloneTarget(operation, ctx, AgentOperationTargetKind.AssetBatch, AgentOperationType.AssetRemoveTag);
  });

const validateAssetSelection = (
  operation: { assetSource?: AgentAssetSourceInput; assetIds?: string[]; assetSelectionHandleId?: string },
  ctx: z.RefinementCtx,
) => {
  const validation = validateAgentAssetSourceMechanismCount(operation);
  if (!validation.valid) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: validation.message,
    });
  }
};

const AgentGalleryOperationInputSchema = z.discriminatedUnion('type', [
  createAlbumOperationSchema,
  addAssetsOperationSchema,
  removeAssetsOperationSchema,
  updateDetailsOperationSchema,
  setCoverOperationSchema,
  createSpaceOperationSchema,
  spaceAssetsOperationSchema(AgentOperationType.SpaceAddAssets),
  spaceAssetsOperationSchema(AgentOperationType.SpaceRemoveAssets),
  updateSpaceDetailsOperationSchema,
  spaceAddMembersOperationSchema,
  spaceRemoveMembersOperationSchema,
  spaceUpdateMemberRoleOperationSchema,
  rotateOperationSchema,
  setFavoriteOperationSchema,
  setArchiveOperationSchema,
  addTagOperationSchema,
  removeTagOperationSchema,
]);

const operationRequest = (schemaId: string) =>
  z
    .strictObject({
      summary,
      operations: z.array(AgentGalleryOperationInputSchema).min(1).max(500),
    })
    .superRefine(validateTemporaryTargetReferences)
    .meta({ id: schemaId });

const AgentProposeAlbumOperationsSchema = operationRequest('AgentProposeAlbumOperationsDto');

const AgentReviseAlbumOperationsSchema = operationRequest('AgentReviseAlbumOperationsDto').extend({
  feedback: z.string().trim().min(1).max(2000).optional(),
});

const AgentOperationPlanParamsSchema = z
  .strictObject({
    id: uuid,
    planId: uuid,
  })
  .meta({ id: 'AgentOperationPlanParamsDto' });

const AgentOperationPlanSummaryRequestSchema = z
  .strictObject({
    focus: z.string().trim().min(1).max(1000).optional(),
  })
  .meta({ id: 'AgentOperationPlanSummaryRequestDto' });

const planId = uuid;

const AgentReviseProposedOperationsToolRequestSchema = operationRequest('AgentReviseProposedOperationsToolRequestDto')
  .extend({
    planId,
    feedback: z.string().trim().min(1).max(2000).optional(),
  })
  .meta({ id: 'AgentReviseProposedOperationsToolRequestDto' });

const AgentSummarizePlanToolRequestSchema = AgentOperationPlanSummaryRequestSchema.extend({
  planId,
}).meta({ id: 'AgentSummarizePlanToolRequestDto' });

export const AgentOperationPlanToolRequestSchemas = {
  [AgentToolName.ProposeAlbumOperations]: AgentProposeAlbumOperationsSchema,
  [AgentToolName.ReviseProposedOperations]: AgentReviseProposedOperationsToolRequestSchema,
  [AgentToolName.SummarizePlan]: AgentSummarizePlanToolRequestSchema,
} as const;

const AgentOperationResponseSchema = z
  .object({
    id: uuid,
    planId: uuid,
    type: AgentOperationTypeSchema,
    summary,
    targetKind: AgentOperationTargetKindSchema,
    targetId: uuid.nullable(),
    temporaryTargetId: temporaryTargetId.nullable(),
    assetIds: z.array(uuid),
    payload: z.record(z.string(), z.unknown()),
    dependencyIds: z.array(uuid),
    riskLevel: AgentOperationRiskLevelSchema,
    enabled: z.boolean(),
    status: AgentOperationStatusSchema,
    result: z.record(z.string(), z.unknown()).nullable(),
    error: z.string().nullable(),
    createdAt: isoDatetimeToDate,
    updatedAt: isoDatetimeToDate,
  })
  .meta({ id: 'AgentOperationResponseDto' });

const AgentOperationPlanResponseSchema = z
  .object({
    id: uuid,
    sessionId: uuid,
    revision: z.number().int().min(1),
    status: AgentOperationPlanStatusSchema,
    summary,
    operations: z.array(AgentOperationResponseSchema),
    createdAt: isoDatetimeToDate,
    updatedAt: isoDatetimeToDate,
  })
  .meta({ id: 'AgentOperationPlanResponseDto' });

const AgentOperationPlanToolResponseSchema = z
  .object({
    status: z.literal('success'),
    plan: AgentOperationPlanResponseSchema.nullable(),
    toolCall: AgentToolCallResponseDto.schema.nullable(),
    summary,
  })
  .meta({ id: 'AgentOperationPlanToolResponseDto' });

const AgentOperationPlanApplyRequestSchema = z
  .strictObject({
    operationIds: uniqueOperationIds,
    itemSelections: z.record(uuid, AgentOperationItemSelectionSchema).optional(),
    fieldOverrides: z.record(uuid, AgentOperationFieldOverrideSchema).optional(),
    planRevision: z.number().int().min(1).optional(),
  })
  .meta({ id: 'AgentOperationPlanApplyRequestDto' });

const AgentOperationPlanApplyResponseSchema = z
  .object({
    status: AgentOperationApplyStatusSchema,
    plan: AgentOperationPlanResponseSchema,
    appliedOperationIds: z.array(uuid),
    skippedOperationIds: z.array(uuid),
    failedOperationIds: z.array(uuid),
    summary,
  })
  .meta({ id: 'AgentOperationPlanApplyResponseDto' });

function validateAlbumTarget(
  operation: {
    targetKind: AgentOperationTargetKind;
    targetId?: string;
    temporaryTargetId?: string;
  },
  ctx: z.RefinementCtx,
  allowedNewTargets: AgentOperationTargetKind[] = [],
) {
  if (
    operation.targetKind !== AgentOperationTargetKind.ExistingAlbum &&
    operation.targetKind !== AgentOperationTargetKind.NewAlbum
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetKind'],
      message: 'album operations require an album target',
    });
    return;
  }

  if (operation.targetKind === AgentOperationTargetKind.NewAlbum && !allowedNewTargets.includes(operation.targetKind)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetKind'],
      message: 'new album targets are not valid for this operation',
    });
  }

  if (operation.targetKind === AgentOperationTargetKind.ExistingAlbum && !operation.targetId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetId'],
      message: 'targetId is required for existing album targets',
    });
  }

  if (operation.targetKind === AgentOperationTargetKind.ExistingAlbum && operation.temporaryTargetId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['temporaryTargetId'],
      message: 'temporaryTargetId is only valid for new album targets',
    });
  }

  if (operation.targetKind === AgentOperationTargetKind.NewAlbum && !operation.temporaryTargetId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['temporaryTargetId'],
      message: 'temporaryTargetId is required for new album targets',
    });
  }

  if (operation.targetKind === AgentOperationTargetKind.NewAlbum && operation.targetId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetId'],
      message: 'targetId is only valid for existing album targets',
    });
  }
}

function validateSpaceTarget(
  operation: {
    targetKind: AgentOperationTargetKind;
    targetId?: string;
    temporaryTargetId?: string;
  },
  ctx: z.RefinementCtx,
  allowedNewTargets: AgentOperationTargetKind[] = [],
) {
  if (
    operation.targetKind !== AgentOperationTargetKind.ExistingSpace &&
    operation.targetKind !== AgentOperationTargetKind.NewSpace
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetKind'],
      message: 'space operations require a space target',
    });
    return;
  }

  if (operation.targetKind === AgentOperationTargetKind.NewSpace && !allowedNewTargets.includes(operation.targetKind)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetKind'],
      message: 'new space targets are not valid for this operation',
    });
  }

  if (operation.targetKind === AgentOperationTargetKind.ExistingSpace && !operation.targetId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetId'],
      message: 'targetId is required for existing space targets',
    });
  }

  if (operation.targetKind === AgentOperationTargetKind.ExistingSpace && operation.temporaryTargetId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['temporaryTargetId'],
      message: 'Use targetId for existing spaces; temporaryTargetId is only for new spaces',
    });
  }

  if (operation.targetKind === AgentOperationTargetKind.NewSpace && !operation.temporaryTargetId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['temporaryTargetId'],
      message: 'temporaryTargetId is required for new space targets',
    });
  }

  if (operation.targetKind === AgentOperationTargetKind.NewSpace && operation.targetId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetId'],
      message: 'targetId is only valid for existing space targets',
    });
  }
}

function validateStandaloneTarget(
  operation: {
    type: AgentOperationType;
    targetKind: AgentOperationTargetKind;
    targetId?: string;
    temporaryTargetId?: string;
  },
  ctx: z.RefinementCtx,
  expectedTargetKind: AgentOperationTargetKind,
  operationType: AgentOperationType,
) {
  if (operation.targetKind !== expectedTargetKind) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetKind'],
      message: `${operationType} requires an ${expectedTargetKind} target`,
    });
  }

  if (operation.targetId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetId'],
      message: 'targetId is not valid for asset batch targets',
    });
  }

  if (operation.temporaryTargetId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['temporaryTargetId'],
      message: 'temporaryTargetId is not valid for asset batch targets',
    });
  }
}

function validateTemporaryTargetReferences(
  value: {
    operations: Array<{ type: AgentOperationType; targetKind: AgentOperationTargetKind; temporaryTargetId?: string }>;
  },
  ctx: z.RefinementCtx,
) {
  const createdAlbumTargetIds = new Set<string>();
  const createdSpaceTargetIds = new Set<string>();

  for (const [index, operation] of value.operations.entries()) {
    if (operation.type === AgentOperationType.AlbumCreate && operation.temporaryTargetId) {
      addUniqueTemporaryTargetId(createdAlbumTargetIds, operation.temporaryTargetId, index, ctx);
      continue;
    }

    if (operation.type === AgentOperationType.SpaceCreate && operation.temporaryTargetId) {
      addUniqueTemporaryTargetId(createdSpaceTargetIds, operation.temporaryTargetId, index, ctx);
      continue;
    }

    const requiresAlbumDependency =
      (operation.type === AgentOperationType.AlbumAddAssets || operation.type === AgentOperationType.AlbumSetCover) &&
      operation.targetKind === AgentOperationTargetKind.NewAlbum;
    const requiresSpaceDependency =
      (operation.type === AgentOperationType.SpaceAddAssets ||
        operation.type === AgentOperationType.SpaceRemoveAssets) &&
      operation.targetKind === AgentOperationTargetKind.NewSpace;

    if (
      requiresAlbumDependency &&
      (!operation.temporaryTargetId || !createdAlbumTargetIds.has(operation.temporaryTargetId))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['operations', index, 'temporaryTargetId'],
        message: 'No matching create operation for temporaryTargetId',
      });
    }

    if (
      requiresSpaceDependency &&
      (!operation.temporaryTargetId || !createdSpaceTargetIds.has(operation.temporaryTargetId))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['operations', index, 'temporaryTargetId'],
        message: 'No matching create operation for temporaryTargetId',
      });
    }
  }
}

function addUniqueTemporaryTargetId(
  temporaryTargetIds: Set<string>,
  targetId: string,
  operationIndex: number,
  ctx: z.RefinementCtx,
) {
  if (temporaryTargetIds.has(targetId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['operations', operationIndex, 'temporaryTargetId'],
      message: 'temporaryTargetId must be unique for create operations',
    });
  }

  temporaryTargetIds.add(targetId);
}

export class AgentProposeAlbumOperationsDto extends createZodDto(AgentProposeAlbumOperationsSchema) {}
export class AgentReviseAlbumOperationsDto extends createZodDto(AgentReviseAlbumOperationsSchema) {}
export class AgentOperationPlanParamsDto extends createZodDto(AgentOperationPlanParamsSchema) {}
export class AgentOperationPlanSummaryRequestDto extends createZodDto(AgentOperationPlanSummaryRequestSchema) {}
export class AgentOperationResponseDto extends createZodDto(AgentOperationResponseSchema) {}
export class AgentOperationPlanResponseDto extends createZodDto(AgentOperationPlanResponseSchema) {}
export class AgentOperationPlanToolResponseDto extends createZodDto(AgentOperationPlanToolResponseSchema) {}
export class AgentOperationPlanApplyRequestDto extends createZodDto(AgentOperationPlanApplyRequestSchema) {}
export class AgentOperationPlanApplyResponseDto extends createZodDto(AgentOperationPlanApplyResponseSchema) {}
