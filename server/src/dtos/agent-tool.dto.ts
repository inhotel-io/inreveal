import { createZodDto } from 'nestjs-zod';
import { AgentToolApprovalDecision, AssetTypeSchema, AssetVisibilitySchema } from 'src/enum';
import { isoDatetimeToDate } from 'src/validation';
import z from 'zod';

const MAX_ASSET_IDS_PER_TOOL_CALL = 10_000;
const AgentToolApprovalDecisionSchema = z.enum(AgentToolApprovalDecision).meta({ id: 'AgentToolApprovalDecision' });

const AgentReadAssetMetadataToolRequestSchema = z
  .object({
    assetIds: z.array(z.uuidv4()).min(1).max(MAX_ASSET_IDS_PER_TOOL_CALL).optional(),
    toolCallId: z.uuidv4().optional(),
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
    rating: z.number().nullable(),
  })
  .meta({ id: 'AgentAssetMetadataExif' });

const AgentAssetMetadataTagSchema = z
  .object({
    id: z.uuidv4(),
    value: z.string(),
    color: z.string().nullable(),
  })
  .meta({ id: 'AgentAssetMetadataTag' });

export const AgentAssetMetadataSchema = z
  .object({
    id: z.uuidv4(),
    ownerId: z.uuidv4(),
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
    toolCallId: z.uuidv4(),
    requestSummary: z.string(),
    assetCount: z.number().int().min(0),
  })
  .meta({ id: 'AgentReadAssetMetadataToolApprovalRequiredResponse' });

const AgentReadAssetMetadataToolDeniedResponseSchema = z
  .object({
    status: z.literal('denied'),
    toolCallId: z.uuidv4(),
    decision: AgentToolApprovalDecisionSchema,
    reason: z.string().nullable(),
  })
  .meta({ id: 'AgentReadAssetMetadataToolDeniedResponse' });

const AgentReadAssetMetadataToolSuccessResponseSchema = z
  .object({
    status: z.literal('success'),
    toolCallId: z.uuidv4(),
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

export class AgentReadAssetMetadataToolRequestDto extends createZodDto(AgentReadAssetMetadataToolRequestSchema) {}
export class AgentToolApprovalDto extends createZodDto(AgentToolApprovalSchema) {}
export const AgentReadAssetMetadataToolResponseDto = createZodDto(AgentReadAssetMetadataToolResponseSchema);
