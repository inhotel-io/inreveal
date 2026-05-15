import { createZodDto } from 'nestjs-zod';
import { AgentToolCallResponseDto } from 'src/dtos/agent-tool.dto';
import {
  AgentOperationPlanStatus,
  AgentOperationRiskLevel,
  AgentOperationStatus,
  AgentOperationTargetKind,
  AgentOperationType,
} from 'src/enum';
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

const AgentOperationPlanStatusSchema = z.enum(AgentOperationPlanStatus).meta({ id: 'AgentOperationPlanStatus' });
const AgentOperationTypeSchema = z.enum(AgentOperationType).meta({ id: 'AgentOperationType' });
const AgentOperationTargetKindSchema = z.enum(AgentOperationTargetKind).meta({ id: 'AgentOperationTargetKind' });
const AgentOperationRiskLevelSchema = z.enum(AgentOperationRiskLevel).meta({ id: 'AgentOperationRiskLevel' });
const AgentOperationStatusSchema = z.enum(AgentOperationStatus).meta({ id: 'AgentOperationStatus' });

const operationDefaults = {
  riskLevel: AgentOperationRiskLevelSchema.optional().default(AgentOperationRiskLevel.Low),
  enabled: z.boolean().optional().default(true),
};
const AlbumCreateOperationTypeSchema = z
  .literal(AgentOperationType.AlbumCreate)
  .meta({ id: 'AgentAlbumCreateOperationType' });
const AlbumAddAssetsOperationTypeSchema = z
  .literal(AgentOperationType.AlbumAddAssets)
  .meta({ id: 'AgentAlbumAddAssetsOperationType' });
const AlbumUpdateDetailsOperationTypeSchema = z
  .literal(AgentOperationType.AlbumUpdateDetails)
  .meta({ id: 'AgentAlbumUpdateDetailsOperationType' });
const AlbumSetCoverOperationTypeSchema = z
  .literal(AgentOperationType.AlbumSetCover)
  .meta({ id: 'AgentAlbumSetCoverOperationType' });
const NewAlbumTargetKindSchema = z
  .literal(AgentOperationTargetKind.NewAlbum)
  .meta({ id: 'AgentOperationNewAlbumTargetKind' });
const ExistingAlbumTargetKindSchema = z
  .literal(AgentOperationTargetKind.ExistingAlbum)
  .meta({ id: 'AgentOperationExistingAlbumTargetKind' });

const createAlbumOperationSchema = z
  .strictObject({
    type: AlbumCreateOperationTypeSchema,
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
    type: AlbumAddAssetsOperationTypeSchema,
    summary,
    targetKind: AgentOperationTargetKindSchema,
    targetId: uuid.optional(),
    temporaryTargetId: temporaryTargetId.optional(),
    assetIds: uniqueAssetIds,
    riskLevel: operationDefaults.riskLevel,
    enabled: operationDefaults.enabled,
    payload: emptyPayload,
  })
  .superRefine(validateTarget);

const updateDetailsOperationSchema = z
  .strictObject({
    type: AlbumUpdateDetailsOperationTypeSchema,
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
  .superRefine(validateTarget);

const setCoverOperationSchema = z
  .strictObject({
    type: AlbumSetCoverOperationTypeSchema,
    summary,
    targetKind: AgentOperationTargetKindSchema,
    targetId: uuid.optional(),
    temporaryTargetId: temporaryTargetId.optional(),
    assetIds: z.array(uuid).length(1),
    riskLevel: operationDefaults.riskLevel,
    enabled: operationDefaults.enabled,
    payload: emptyPayload,
  })
  .superRefine(validateTarget);

const AgentAlbumOperationInputSchema = z.discriminatedUnion('type', [
  createAlbumOperationSchema,
  addAssetsOperationSchema,
  updateDetailsOperationSchema,
  setCoverOperationSchema,
]);

const operationRequest = (schemaId: string) =>
  z
    .strictObject({
      summary,
      operations: z.array(AgentAlbumOperationInputSchema).min(1).max(500),
    })
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

function validateTarget(
  operation: {
    targetKind: AgentOperationTargetKind;
    targetId?: string;
    temporaryTargetId?: string;
  },
  ctx: z.RefinementCtx,
) {
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

export class AgentProposeAlbumOperationsDto extends createZodDto(AgentProposeAlbumOperationsSchema) {}
export class AgentReviseAlbumOperationsDto extends createZodDto(AgentReviseAlbumOperationsSchema) {}
export class AgentOperationPlanParamsDto extends createZodDto(AgentOperationPlanParamsSchema) {}
export class AgentOperationPlanSummaryRequestDto extends createZodDto(AgentOperationPlanSummaryRequestSchema) {}
export class AgentOperationResponseDto extends createZodDto(AgentOperationResponseSchema) {}
export class AgentOperationPlanResponseDto extends createZodDto(AgentOperationPlanResponseSchema) {}
export class AgentOperationPlanToolResponseDto extends createZodDto(AgentOperationPlanToolResponseSchema) {}
