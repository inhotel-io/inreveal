import { createZodDto } from 'nestjs-zod';
import {
  AgentToolApprovalDecision,
  AgentToolCallStatus,
  AgentToolDataClass,
  AgentToolName,
  AssetTypeSchema,
  AssetVisibilitySchema,
} from 'src/enum';
import { isoDatetimeToDate } from 'src/validation';
import z from 'zod';

const MAX_ASSET_IDS_PER_TOOL_CALL = 10_000;
const uuid = z.uuidv4();
const summary = z.string().trim().min(1).max(1000);
const AgentToolApprovalDecisionSchema = z.enum(AgentToolApprovalDecision).meta({ id: 'AgentToolApprovalDecision' });
const AgentToolCallStatusSchema = z.enum(AgentToolCallStatus).meta({ id: 'AgentToolCallStatus' });
const AgentToolDataClassSchema = z.enum(AgentToolDataClass).meta({ id: 'AgentToolDataClass' });
const AgentToolNameSchema = z.enum(AgentToolName).meta({ id: 'AgentToolName' });

const AgentReadAssetMetadataToolRequestSchema = z
  .object({
    assetIds: z.array(uuid).min(1).max(MAX_ASSET_IDS_PER_TOOL_CALL).optional(),
    toolCallId: uuid.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.assetIds && value.toolCallId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either assetIds or toolCallId, not both',
      });
    }

    if (!value.assetIds && !value.toolCallId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide assetIds for a new tool request or toolCallId for an approved request',
      });
    }

    if (value.assetIds && new Set(value.assetIds).size !== value.assetIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assetIds'],
        message: 'assetIds must be unique',
      });
    }
  })
  .meta({ id: 'AgentReadAssetMetadataToolRequestDto' });

const AgentToolApprovalSchema = z
  .object({
    decision: AgentToolApprovalDecisionSchema,
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .meta({ id: 'AgentToolApprovalDto' });

const AgentAssetMetadataExifSchema = z
  .object({
    dateTimeOriginal: isoDatetimeToDate.nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    country: z.string().nullable(),
    make: z.string().nullable(),
    model: z.string().nullable(),
    lensModel: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    rating: z.number().int().nullable(),
  })
  .meta({ id: 'AgentAssetMetadataExif' });

const AgentAssetMetadataTagSchema = z
  .object({
    id: uuid,
    value: z.string(),
    color: z.string().nullable(),
  })
  .meta({ id: 'AgentAssetMetadataTag' });

const AgentToolCallResponseSchema = z
  .object({
    id: uuid,
    sessionId: uuid,
    toolName: AgentToolNameSchema,
    status: AgentToolCallStatusSchema,
    approvalDecision: AgentToolApprovalDecisionSchema.nullable(),
    requestSummary: summary,
    responseSummary: summary.nullable(),
    dataClass: AgentToolDataClassSchema,
    assetCount: z.number().int().min(0),
    albumCount: z.number().int().min(0),
    startedAt: isoDatetimeToDate,
    completedAt: isoDatetimeToDate.nullable(),
    error: z.string().nullable(),
  })
  .meta({ id: 'AgentToolCallResponseDto' });

export const AgentAssetMetadataSchema = z
  .object({
    id: uuid,
    ownerId: uuid,
    type: AssetTypeSchema,
    originalFileName: z.string(),
    localDateTime: isoDatetimeToDate,
    fileCreatedAt: isoDatetimeToDate,
    fileModifiedAt: isoDatetimeToDate,
    isFavorite: z.boolean(),
    visibility: AssetVisibilitySchema,
    exifInfo: AgentAssetMetadataExifSchema.nullable(),
    tags: z.array(AgentAssetMetadataTagSchema),
  })
  .meta({ id: 'AgentAssetMetadata' });

const AgentReadAssetMetadataToolApprovalRequiredResponseSchema = z
  .object({
    status: z.literal('approval-required'),
    toolCall: AgentToolCallResponseSchema,
  })
  .meta({ id: 'AgentReadAssetMetadataToolApprovalRequiredResponse' });

const AgentReadAssetMetadataToolDeniedResponseSchema = z
  .object({
    status: z.literal('denied'),
    reason: z.string(),
    toolCall: AgentToolCallResponseSchema,
  })
  .meta({ id: 'AgentReadAssetMetadataToolDeniedResponse' });

const AgentReadAssetMetadataToolSuccessResponseSchema = z
  .object({
    status: z.literal('success'),
    toolCall: AgentToolCallResponseSchema,
    assets: z.array(AgentAssetMetadataSchema),
  })
  .meta({ id: 'AgentReadAssetMetadataToolSuccessResponse' });

const AgentReadAssetMetadataToolResponseSchema = z
  .discriminatedUnion('status', [
    AgentReadAssetMetadataToolApprovalRequiredResponseSchema,
    AgentReadAssetMetadataToolDeniedResponseSchema,
    AgentReadAssetMetadataToolSuccessResponseSchema,
  ])
  .meta({ id: 'AgentReadAssetMetadataToolResponseDto' });

const AgentToolCallParamsSchema = z
  .object({
    id: uuid,
    toolCallId: uuid,
  })
  .meta({ id: 'AgentToolCallParamsDto' });

export class AgentReadAssetMetadataToolRequestDto extends createZodDto(AgentReadAssetMetadataToolRequestSchema) {}
export class AgentToolApprovalDto extends createZodDto(AgentToolApprovalSchema) {}
export class AgentToolCallResponseDto extends createZodDto(AgentToolCallResponseSchema) {}
export class AgentToolCallParamsDto extends createZodDto(AgentToolCallParamsSchema) {}
export const AgentReadAssetMetadataToolResponseDto = createZodDto(AgentReadAssetMetadataToolResponseSchema);
export type AgentReadAssetMetadataToolResponseDto = z.output<typeof AgentReadAssetMetadataToolResponseSchema>;
