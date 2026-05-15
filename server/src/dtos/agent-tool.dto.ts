import { createZodDto, type ZodDto } from 'nestjs-zod';
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
const MAX_TOOL_LIMIT = 10_000;
const uuid = z.uuidv4();
const summary = z.string().trim().min(1).max(1000);
const AgentToolApprovalDecisionSchema = z.enum(AgentToolApprovalDecision).meta({ id: 'AgentToolApprovalDecision' });
const AgentToolCallStatusSchema = z.enum(AgentToolCallStatus).meta({ id: 'AgentToolCallStatus' });
const AgentToolDataClassSchema = z.enum(AgentToolDataClass).meta({ id: 'AgentToolDataClass' });
const AgentToolNameSchema = z.enum(AgentToolName).meta({ id: 'AgentToolName' });

const assetIdRequest = (schemaId: string, missingMessage: string) =>
  z
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
          message: missingMessage,
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
    .meta({ id: schemaId });

const AgentReadAssetMetadataToolRequestSchema = assetIdRequest(
  'AgentReadAssetMetadataToolRequestDto',
  'Provide assetIds for a new tool request or toolCallId for an approved request',
);

const AgentReadAssetPreviewsToolRequestSchema = assetIdRequest(
  'AgentReadAssetPreviewsToolRequestDto',
  'Provide assetIds for a new tool request or toolCallId for an approved request',
);

const AgentReadAssetOriginalsToolRequestSchema = assetIdRequest(
  'AgentReadAssetOriginalsToolRequestDto',
  'Provide assetIds for a new tool request or toolCallId for an approved request',
);

const AgentSearchAssetsFiltersSchema = z
  .object({
    takenAfter: isoDatetimeToDate.optional(),
    takenBefore: isoDatetimeToDate.optional(),
    city: z.string().trim().nullable().optional(),
    state: z.string().trim().nullable().optional(),
    country: z.string().trim().nullable().optional(),
    make: z.string().trim().nullable().optional(),
    model: z.string().trim().nullable().optional(),
    lensModel: z.string().trim().nullable().optional(),
    isFavorite: z.boolean().optional(),
    isNotInAlbum: z.boolean().optional(),
    type: AssetTypeSchema.optional(),
    rating: z.number().int().min(1).max(5).nullable().optional(),
    tagIds: z.array(uuid).optional(),
    albumIds: z.array(uuid).optional(),
  })
  .meta({ id: 'AgentSearchAssetsFilters' });

const AgentSearchAssetsToolRequestSchema = z
  .strictObject({
    filters: AgentSearchAssetsFiltersSchema.optional(),
    limit: z.number().int().min(1).max(MAX_TOOL_LIMIT).optional(),
    toolCallId: uuid.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.toolCallId && (value.filters || value.limit !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either search filters or toolCallId, not both',
      });
    }
  })
  .transform((value) =>
    value.toolCallId ? value : { filters: value.filters ?? {}, limit: value.limit ?? MAX_TOOL_LIMIT },
  )
  .meta({ id: 'AgentSearchAssetsToolRequestDto' });

const AgentListAlbumsToolRequestSchema = z
  .strictObject({
    toolCallId: uuid.optional(),
  })
  .meta({ id: 'AgentListAlbumsToolRequestDto' });

const AgentReadAlbumToolRequestSchema = z
  .strictObject({
    albumId: uuid.optional(),
    toolCallId: uuid.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.albumId && value.toolCallId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either albumId or toolCallId, not both',
      });
    }

    if (!value.albumId && !value.toolCallId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide albumId for a new tool request or toolCallId for an approved request',
      });
    }
  })
  .meta({ id: 'AgentReadAlbumToolRequestDto' });

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

const AgentAssetMediaReferenceSchema = z
  .object({
    assetId: uuid,
    mediaUrl: z.string(),
    mimeType: z.string(),
    fileName: z.string(),
    width: z.number().int().min(0).nullable(),
    height: z.number().int().min(0).nullable(),
  })
  .meta({ id: 'AgentAssetMediaReference' });

const AgentAlbumSummarySchema = z
  .object({
    id: uuid,
    albumName: z.string(),
    description: z.string(),
    ownerId: uuid,
    assetCount: z.number().int().min(0),
    startDate: isoDatetimeToDate.nullable(),
    endDate: isoDatetimeToDate.nullable(),
    albumThumbnailAssetId: uuid.nullable(),
  })
  .meta({ id: 'AgentAlbumSummary' });

const AgentAlbumDetailSchema = AgentAlbumSummarySchema.extend({
  assetIds: z.array(uuid),
}).meta({ id: 'AgentAlbumDetail' });

const approvalRequiredResponse = (schemaId: string) =>
  z
    .object({
      status: z.literal('approval-required'),
      toolCall: AgentToolCallResponseSchema,
    })
    .meta({ id: schemaId });

const deniedResponse = (schemaId: string) =>
  z
    .object({
      status: z.literal('denied'),
      reason: z.string(),
      toolCall: AgentToolCallResponseSchema,
    })
    .meta({ id: schemaId });

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

const AgentSearchAssetsToolResponseSchema = z
  .discriminatedUnion('status', [
    approvalRequiredResponse('AgentSearchAssetsToolApprovalRequiredResponse'),
    deniedResponse('AgentSearchAssetsToolDeniedResponse'),
    z
      .object({
        status: z.literal('success'),
        toolCall: AgentToolCallResponseSchema,
        assets: z.array(AgentAssetMetadataSchema),
        nextPage: z.string().nullable(),
      })
      .meta({ id: 'AgentSearchAssetsToolSuccessResponse' }),
  ])
  .meta({ id: 'AgentSearchAssetsToolResponseDto' });

const AgentReadAssetPreviewsToolResponseSchema = z
  .discriminatedUnion('status', [
    approvalRequiredResponse('AgentReadAssetPreviewsToolApprovalRequiredResponse'),
    deniedResponse('AgentReadAssetPreviewsToolDeniedResponse'),
    z
      .object({
        status: z.literal('success'),
        toolCall: AgentToolCallResponseSchema,
        previews: z.array(AgentAssetMediaReferenceSchema),
      })
      .meta({ id: 'AgentReadAssetPreviewsToolSuccessResponse' }),
  ])
  .meta({ id: 'AgentReadAssetPreviewsToolResponseDto' });

const AgentReadAssetOriginalsToolResponseSchema = z
  .discriminatedUnion('status', [
    approvalRequiredResponse('AgentReadAssetOriginalsToolApprovalRequiredResponse'),
    deniedResponse('AgentReadAssetOriginalsToolDeniedResponse'),
    z
      .object({
        status: z.literal('success'),
        toolCall: AgentToolCallResponseSchema,
        originals: z.array(AgentAssetMediaReferenceSchema),
      })
      .meta({ id: 'AgentReadAssetOriginalsToolSuccessResponse' }),
  ])
  .meta({ id: 'AgentReadAssetOriginalsToolResponseDto' });

const AgentListAlbumsToolResponseSchema = z
  .discriminatedUnion('status', [
    approvalRequiredResponse('AgentListAlbumsToolApprovalRequiredResponse'),
    deniedResponse('AgentListAlbumsToolDeniedResponse'),
    z
      .object({
        status: z.literal('success'),
        toolCall: AgentToolCallResponseSchema,
        albums: z.array(AgentAlbumSummarySchema),
      })
      .meta({ id: 'AgentListAlbumsToolSuccessResponse' }),
  ])
  .meta({ id: 'AgentListAlbumsToolResponseDto' });

const AgentReadAlbumToolResponseSchema = z
  .discriminatedUnion('status', [
    approvalRequiredResponse('AgentReadAlbumToolApprovalRequiredResponse'),
    deniedResponse('AgentReadAlbumToolDeniedResponse'),
    z
      .object({
        status: z.literal('success'),
        toolCall: AgentToolCallResponseSchema,
        album: AgentAlbumDetailSchema,
      })
      .meta({ id: 'AgentReadAlbumToolSuccessResponse' }),
  ])
  .meta({ id: 'AgentReadAlbumToolResponseDto' });

const AgentToolCallParamsSchema = z
  .object({
    id: uuid,
    toolCallId: uuid,
  })
  .meta({ id: 'AgentToolCallParamsDto' });

const namedZodDto = <TSchema extends z.ZodType>(schemaName: string, schema: TSchema): ZodDto<TSchema, false> => {
  const dto = createZodDto(schema);
  Object.defineProperty(dto, 'name', { value: schemaName });
  return dto;
};

export class AgentReadAssetMetadataToolRequestDto extends createZodDto(AgentReadAssetMetadataToolRequestSchema) {}
export class AgentSearchAssetsToolRequestDto extends createZodDto(AgentSearchAssetsToolRequestSchema) {}
export class AgentReadAssetPreviewsToolRequestDto extends createZodDto(AgentReadAssetPreviewsToolRequestSchema) {}
export class AgentReadAssetOriginalsToolRequestDto extends createZodDto(AgentReadAssetOriginalsToolRequestSchema) {}
export class AgentListAlbumsToolRequestDto extends createZodDto(AgentListAlbumsToolRequestSchema) {}
export class AgentReadAlbumToolRequestDto extends createZodDto(AgentReadAlbumToolRequestSchema) {}
export class AgentToolApprovalDto extends createZodDto(AgentToolApprovalSchema) {}
export class AgentToolCallResponseDto extends createZodDto(AgentToolCallResponseSchema) {}
export class AgentToolCallParamsDto extends createZodDto(AgentToolCallParamsSchema) {}
export const AgentReadAssetMetadataToolResponseDto = namedZodDto(
  'AgentReadAssetMetadataToolResponseDto',
  AgentReadAssetMetadataToolResponseSchema,
);
export type AgentReadAssetMetadataToolResponseDto = z.output<typeof AgentReadAssetMetadataToolResponseSchema>;
export const AgentSearchAssetsToolResponseDto = namedZodDto(
  'AgentSearchAssetsToolResponseDto',
  AgentSearchAssetsToolResponseSchema,
);
export type AgentSearchAssetsToolResponseDto = z.output<typeof AgentSearchAssetsToolResponseSchema>;
export const AgentReadAssetPreviewsToolResponseDto = namedZodDto(
  'AgentReadAssetPreviewsToolResponseDto',
  AgentReadAssetPreviewsToolResponseSchema,
);
export type AgentReadAssetPreviewsToolResponseDto = z.output<typeof AgentReadAssetPreviewsToolResponseSchema>;
export const AgentReadAssetOriginalsToolResponseDto = namedZodDto(
  'AgentReadAssetOriginalsToolResponseDto',
  AgentReadAssetOriginalsToolResponseSchema,
);
export type AgentReadAssetOriginalsToolResponseDto = z.output<typeof AgentReadAssetOriginalsToolResponseSchema>;
export const AgentListAlbumsToolResponseDto = namedZodDto(
  'AgentListAlbumsToolResponseDto',
  AgentListAlbumsToolResponseSchema,
);
export type AgentListAlbumsToolResponseDto = z.output<typeof AgentListAlbumsToolResponseSchema>;
export const AgentReadAlbumToolResponseDto = namedZodDto(
  'AgentReadAlbumToolResponseDto',
  AgentReadAlbumToolResponseSchema,
);
export type AgentReadAlbumToolResponseDto = z.output<typeof AgentReadAlbumToolResponseSchema>;
