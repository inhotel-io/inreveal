import { createZodDto, type ZodDto } from 'nestjs-zod';
import {
  AgentChoiceRefSchema,
  AgentSearchSourceRefSchema,
  getAgentChoiceRefKind,
} from 'src/dtos/agent-asset-source.dto';
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
const DEFAULT_SEARCH_LIMIT = 100;
const MAX_SEARCH_SAMPLE_SIZE = 25;
const MAX_SELECTION_METADATA_SAMPLE_SIZE = 25;
const DEFAULT_SELECTION_METADATA_SAMPLE_SIZE = 10;
const MAX_USER_LOOKUP_LIMIT = 20;
const MAX_RESOLVE_FILTER_NAMES_PER_KIND = 20;
const MAX_RESOLVE_FILTER_NAME_LENGTH = 120;
const DEFAULT_SEARCH_MODE = 'metadata';
const DEFAULT_SEARCH_ORDER = 'desc';
const DEFAULT_SEARCH_PAGE = 1;
const searchTextModes = new Set(['smart', 'description', 'ocr', 'filename']);
const uuid = z.uuidv4();
const summary = z.string().trim().min(1).max(1000);
const AgentToolApprovalDecisionSchema = z.enum(AgentToolApprovalDecision).meta({ id: 'AgentToolApprovalDecision' });
const AgentToolCallStatusSchema = z.enum(AgentToolCallStatus).meta({ id: 'AgentToolCallStatus' });
const AgentToolDataClassSchema = z.enum(AgentToolDataClass).meta({ id: 'AgentToolDataClass' });
const AgentToolNameSchema = z.enum(AgentToolName).meta({ id: 'AgentToolName' });
const AgentSearchAssetsModeSchema = z
  .enum(['metadata', 'smart', 'description', 'ocr', 'filename'])
  .meta({ id: 'AgentSearchAssetsMode' });
const AgentSearchAssetsOrderSchema = z.enum(['asc', 'desc', 'relevance']).meta({ id: 'AgentSearchAssetsOrder' });
const AgentSearchAssetsRequestDetailSchema = z
  .enum(['ids', 'handle', 'summary', 'metadata'])
  .meta({ id: 'AgentSearchAssetsRequestDetail' });
const AgentSearchAssetsResponseDetailSchema = z
  .enum(['handle', 'summary', 'metadata'])
  .meta({ id: 'AgentSearchAssetsDetail' });
const AgentAssetMetadataFieldValues = [
  'type',
  'dates',
  'location',
  'camera',
  'tags',
  'rating',
  'filename',
  'favorite',
  'visibility',
] as const;
const AgentSearchAssetsFieldSchema = z.enum(AgentAssetMetadataFieldValues).meta({ id: 'AgentSearchAssetsField' });
const AgentAssetMetadataDetailSchema = z
  .enum(['basic', 'descriptive', 'technical', 'allSafe'])
  .meta({ id: 'AgentAssetMetadataDetail' });
const AgentAssetMetadataFieldSchema = z.enum(AgentAssetMetadataFieldValues).meta({ id: 'AgentAssetMetadataField' });
const DEFAULT_SELECTION_METADATA_FIELDS = [
  'type',
  'dates',
  'location',
  'camera',
  'tags',
  'rating',
  'filename',
  'favorite',
  'visibility',
] as const satisfies readonly z.output<typeof AgentAssetMetadataFieldSchema>[];
const resolverNameList = z
  .array(z.string().trim().min(1).max(MAX_RESOLVE_FILTER_NAME_LENGTH))
  .min(1)
  .max(MAX_RESOLVE_FILTER_NAMES_PER_KIND);

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

const AgentReadAssetMetadataToolRequestSchema = z
  .strictObject({
    assetIds: z.array(uuid).min(1).max(MAX_ASSET_IDS_PER_TOOL_CALL).optional(),
    detail: AgentAssetMetadataDetailSchema.optional(),
    fields: z.array(AgentAssetMetadataFieldSchema).min(1).max(20).optional(),
    toolCallId: uuid.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.assetIds && value.toolCallId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either assetIds or toolCallId, not both',
      });
    }

    if ((value.detail || value.fields) && value.toolCallId) {
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

    if (value.detail && value.fields) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Use either detail or fields, not both',
      });
    }

    if (value.assetIds && new Set(value.assetIds).size !== value.assetIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assetIds'],
        message: 'assetIds must be unique',
      });
    }

    if (value.fields && new Set(value.fields).size !== value.fields.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fields'],
        message: 'fields must be unique',
      });
    }
  })
  .transform((value) => {
    if (value.toolCallId) {
      return value;
    }

    return value.fields ? value : { ...value, detail: value.detail ?? 'basic' };
  })
  .meta({ id: 'AgentReadAssetMetadataToolRequestDto' });

const AgentReadSelectionMetadataToolRequestSchema = z
  .strictObject({
    selectionHandleId: uuid.optional(),
    fields: z.array(AgentAssetMetadataFieldSchema).min(1).max(20).optional(),
    sampleSize: z.number().int().min(0).max(MAX_SELECTION_METADATA_SAMPLE_SIZE).optional(),
    toolCallId: uuid.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.selectionHandleId && value.toolCallId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either selectionHandleId or toolCallId, not both',
      });
    }

    if ((value.fields || value.sampleSize !== undefined) && value.toolCallId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either selectionHandleId or toolCallId, not both',
      });
    }

    if (!value.selectionHandleId && !value.toolCallId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide selectionHandleId for a new tool request or toolCallId for an approved request',
      });
    }

    if (value.fields && new Set(value.fields).size !== value.fields.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'fields must be unique' });
    }
  })
  .transform((value) => {
    if (value.toolCallId) {
      return value;
    }

    return {
      ...value,
      fields: value.fields ?? [...DEFAULT_SELECTION_METADATA_FIELDS],
      sampleSize: value.sampleSize ?? DEFAULT_SELECTION_METADATA_SAMPLE_SIZE,
    };
  })
  .meta({ id: 'AgentReadSelectionMetadataToolRequestDto' });

const AgentReadAssetPreviewsToolRequestSchema = assetIdRequest(
  'AgentReadAssetPreviewsToolRequestDto',
  'Provide assetIds for a new tool request or toolCallId for an approved request',
);

const AgentReadAssetOriginalsToolRequestSchema = assetIdRequest(
  'AgentReadAssetOriginalsToolRequestDto',
  'Provide assetIds for a new tool request or toolCallId for an approved request',
);

const AgentSearchAssetsFilterFields = {
  takenAfter: isoDatetimeToDate.optional(),
  takenBefore: isoDatetimeToDate.optional(),
  createdAfter: isoDatetimeToDate.optional(),
  createdBefore: isoDatetimeToDate.optional(),
  updatedAfter: isoDatetimeToDate.optional(),
  updatedBefore: isoDatetimeToDate.optional(),
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
  tagMatchAny: z.boolean().optional(),
  albumIds: z.array(uuid).optional(),
  albumMatchAny: z.boolean().optional(),
  personIds: z.array(uuid).optional(),
  personMatchAny: z.boolean().optional(),
  spaceId: uuid.optional(),
  spacePersonIds: z.array(uuid).optional(),
  withSharedSpaces: z.boolean().optional(),
  visibility: AssetVisibilitySchema.optional(),
};

const validateSearchAssetsFilterCrossFields = (
  value: Pick<
    z.output<z.ZodObject<typeof AgentSearchAssetsFilterFields>>,
    'spaceId' | 'spacePersonIds' | 'withSharedSpaces'
  >,
  ctx: z.RefinementCtx,
) => {
  if (value.spacePersonIds?.length && !value.spaceId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['spacePersonIds'],
      message: 'spacePersonIds requires spaceId',
    });
  }

  if (value.spaceId && value.withSharedSpaces) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['withSharedSpaces'],
      message: 'Cannot use both spaceId and withSharedSpaces',
    });
  }
};

const AgentSearchAssetsFiltersSchema = z
  .strictObject(AgentSearchAssetsFilterFields)
  .superRefine(validateSearchAssetsFilterCrossFields)
  .meta({ id: 'AgentSearchAssetsFilters' });

const AgentPartialSearchAssetsFiltersSchema = z
  .strictObject(AgentSearchAssetsFilterFields)
  .partial()
  .superRefine(validateSearchAssetsFilterCrossFields)
  .meta({ id: 'AgentPartialSearchAssetsFilters' });

type AgentSearchAssetsToolRequestOutput = {
  mode?: z.output<typeof AgentSearchAssetsModeSchema>;
  query?: string;
  filters?: z.output<typeof AgentSearchAssetsFiltersSchema>;
  limit?: number;
  page?: number;
  order?: z.output<typeof AgentSearchAssetsOrderSchema>;
  detail?: z.output<typeof AgentSearchAssetsRequestDetailSchema>;
  fields?: z.output<typeof AgentSearchAssetsFieldSchema>[];
  sampleSize?: number;
  createSelectionHandle?: boolean;
  toolCallId?: string;
};

const AgentSearchAssetsToolRequestSchema = z
  .strictObject({
    mode: AgentSearchAssetsModeSchema.optional(),
    query: z.string().trim().min(1).max(500).optional(),
    filters: AgentSearchAssetsFiltersSchema.optional(),
    limit: z.number().int().min(1).max(MAX_TOOL_LIMIT).optional(),
    page: z.number().int().min(1).optional(),
    order: AgentSearchAssetsOrderSchema.optional(),
    detail: AgentSearchAssetsRequestDetailSchema.optional(),
    fields: z.array(AgentSearchAssetsFieldSchema).optional(),
    sampleSize: z.number().int().min(0).max(MAX_SEARCH_SAMPLE_SIZE).optional(),
    createSelectionHandle: z.boolean().optional(),
    toolCallId: uuid.optional(),
  })
  .superRefine((value, ctx) => {
    const mode = value.mode ?? DEFAULT_SEARCH_MODE;
    const hasNewSearchFields =
      value.filters !== undefined ||
      value.limit !== undefined ||
      value.query !== undefined ||
      value.page !== undefined ||
      value.order !== undefined ||
      value.mode !== undefined ||
      value.detail !== undefined ||
      value.fields !== undefined ||
      value.sampleSize !== undefined ||
      value.createSelectionHandle !== undefined;

    if (value.toolCallId && hasNewSearchFields) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either search fields or toolCallId, not both',
      });
    }

    if (mode === 'metadata' && value.query !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['query'],
        message: 'query is only supported for smart, description, ocr, and filename search modes',
      });
    }

    if (searchTextModes.has(mode) && value.query === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['query'],
        message: `${mode} search requires a non-empty query`,
      });
    }
  })
  .transform((value): AgentSearchAssetsToolRequestOutput => {
    if (value.toolCallId) {
      return value;
    }

    const mode = value.mode ?? DEFAULT_SEARCH_MODE;
    const order = value.order ?? (mode === 'smart' ? undefined : DEFAULT_SEARCH_ORDER);
    const request = {
      mode,
      filters: value.filters ?? {},
      limit: value.limit ?? DEFAULT_SEARCH_LIMIT,
      page: value.page ?? DEFAULT_SEARCH_PAGE,
      detail: value.detail ?? 'handle',
      fields: value.fields ?? [],
      ...(value.createSelectionHandle === undefined ? {} : { createSelectionHandle: value.createSelectionHandle }),
      ...(value.sampleSize === undefined ? {} : { sampleSize: value.sampleSize }),
      ...(order === undefined ? {} : { order }),
    };

    return value.query === undefined ? request : { ...request, query: value.query };
  })
  .meta({ id: 'AgentSearchAssetsToolRequestDto' });

const AgentResolveAssetSearchFiltersScopeSchema = z
  .strictObject({
    spaceId: uuid.optional(),
    withSharedSpaces: z.boolean().optional(),
    takenAfter: isoDatetimeToDate.optional(),
    takenBefore: isoDatetimeToDate.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.spaceId && value.withSharedSpaces) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['withSharedSpaces'],
        message: 'Cannot use both scope.spaceId and scope.withSharedSpaces',
      });
    }
  })
  .meta({ id: 'AgentResolveAssetSearchFiltersScope' });

const AgentResolveAssetSearchFiltersToolRequestSchema = z
  .strictObject({
    people: resolverNameList.optional(),
    tags: resolverNameList.optional(),
    albums: resolverNameList.optional(),
    spaces: resolverNameList.optional(),
    cameraMakes: resolverNameList.optional(),
    cameraModels: resolverNameList.optional(),
    lensModels: resolverNameList.optional(),
    scope: AgentResolveAssetSearchFiltersScopeSchema.optional(),
    toolCallId: uuid.optional(),
  })
  .superRefine((value, ctx) => {
    const resolverNameFields = [
      value.people,
      value.tags,
      value.albums,
      value.spaces,
      value.cameraMakes,
      value.cameraModels,
      value.lensModels,
    ];
    const hasResolverNameField = resolverNameFields.some((field) => field !== undefined);
    const hasResolverField = hasResolverNameField || value.scope !== undefined;

    if (value.toolCallId && hasResolverField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either resolver fields or toolCallId, not both',
      });
    }

    if (!value.toolCallId && !hasResolverNameField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide at least one resolver field',
      });
    }
  })
  .meta({ id: 'AgentResolveAssetSearchFiltersToolRequestDto' });

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

const AgentListSpacesToolRequestSchema = z
  .strictObject({
    toolCallId: uuid.optional().describe('Approved tool call id when retrying after user approval'),
  })
  .meta({ id: 'AgentListSpacesToolRequestDto' });

const AgentReadSpaceToolRequestSchema = z
  .strictObject({
    spaceId: uuid.optional().describe('Shared space id to inspect'),
    toolCallId: uuid.optional().describe('Approved tool call id when retrying after user approval'),
  })
  .superRefine((value, ctx) => {
    if (value.spaceId && value.toolCallId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Use either spaceId or toolCallId, not both',
      });
    }

    if (!value.spaceId && !value.toolCallId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide spaceId, or retry an approved tool call with toolCallId',
      });
    }
  })
  .meta({ id: 'AgentReadSpaceToolRequestDto' });

const AgentSearchUsersToolRequestSchema = z
  .strictObject({
    query: z.string().trim().min(1).max(120).optional(),
    limit: z.number().int().min(1).max(MAX_USER_LOOKUP_LIMIT).optional(),
    toolCallId: uuid.optional().describe('Approved tool call id when retrying after user approval'),
  })
  .superRefine((value, ctx) => {
    if (value.toolCallId && (value.query !== undefined || value.limit !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either user search fields or toolCallId, not both',
      });
    }
  })
  .transform((value) => (value.toolCallId ? value : { query: value.query ?? '', limit: value.limit ?? 20 }))
  .meta({ id: 'AgentSearchUsersToolRequestDto' });

export const AgentReadToolRequestSchemas = {
  [AgentToolName.SearchAssets]: AgentSearchAssetsToolRequestSchema,
  [AgentToolName.ReadSelectionMetadata]: AgentReadSelectionMetadataToolRequestSchema,
  [AgentToolName.ResolveAssetSearchFilters]: AgentResolveAssetSearchFiltersToolRequestSchema,
  [AgentToolName.ReadAssetMetadata]: AgentReadAssetMetadataToolRequestSchema,
  [AgentToolName.ReadAssetPreviews]: AgentReadAssetPreviewsToolRequestSchema,
  [AgentToolName.ReadAssetOriginals]: AgentReadAssetOriginalsToolRequestSchema,
  [AgentToolName.ListAlbums]: AgentListAlbumsToolRequestSchema,
  [AgentToolName.ReadAlbum]: AgentReadAlbumToolRequestSchema,
  [AgentToolName.ListSpaces]: AgentListSpacesToolRequestSchema,
  [AgentToolName.ReadSpace]: AgentReadSpaceToolRequestSchema,
  [AgentToolName.SearchUsers]: AgentSearchUsersToolRequestSchema,
} as const;

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

const AgentToolResultSizeSchema = z
  .object({
    returnedItems: z.number().int().min(0),
    hasMore: z.boolean(),
    nextPage: z.string().nullable(),
    estimatedBytes: z.number().int().min(0).nullable(),
    truncated: z.boolean(),
    omittedFields: z.array(z.string().trim().min(1)).max(50),
  })
  .meta({ id: 'AgentToolResultSize' });

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
    resultSize: AgentToolResultSizeSchema.optional(),
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

const AgentAssetMetadataResultFields = {
  id: uuid,
  type: AssetTypeSchema.optional(),
  originalFileName: z.string().optional(),
  localDateTime: isoDatetimeToDate.optional(),
  fileCreatedAt: isoDatetimeToDate.optional(),
  fileModifiedAt: isoDatetimeToDate.optional(),
  isFavorite: z.boolean().optional(),
  visibility: AssetVisibilitySchema.optional(),
  exifInfo: AgentAssetMetadataExifSchema.partial().nullable().optional(),
  tags: z.array(AgentAssetMetadataTagSchema).optional(),
};

const AgentAssetMetadataResultSchema = z
  .object(AgentAssetMetadataResultFields)
  .meta({ id: 'AgentAssetMetadataResult' });

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

const AgentSpaceMemberSummarySchema = z
  .object({
    userId: uuid,
    name: z.string(),
    role: z.string(),
    avatarColor: z.string().nullable(),
    profileImagePath: z.string().nullable(),
  })
  .meta({ id: 'AgentSpaceMemberSummary' });

const AgentSpaceSummarySchema = z
  .object({
    id: uuid,
    name: z.string(),
    description: z.string().nullable(),
    color: z.string(),
    createdById: uuid,
    assetCount: z.number().int().min(0),
    memberCount: z.number().int().min(0),
    thumbnailAssetId: uuid.nullable(),
    recentAssetIds: z.array(uuid),
  })
  .meta({ id: 'AgentSpaceSummary' });

const AgentSpaceDetailSchema = AgentSpaceSummarySchema.extend({
  members: z.array(AgentSpaceMemberSummarySchema),
  assetIds: z.array(uuid),
  assetIdsReturned: z.number().int().min(0),
  assetIdsTruncated: z.boolean(),
}).meta({ id: 'AgentSpaceDetail' });

const AgentUserLookupResultSchema = z
  .object({
    userId: uuid,
    name: z.string(),
    email: z.string().nullable(),
    avatarColor: z.string().nullable(),
    profileImagePath: z.string().nullable(),
  })
  .meta({ id: 'AgentUserLookupResult' });

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
    summary,
    detail: AgentAssetMetadataDetailSchema.optional(),
    fields: z.array(AgentAssetMetadataFieldSchema),
    resultSize: AgentToolResultSizeSchema,
    assets: z.array(AgentAssetMetadataResultSchema),
  })
  .meta({ id: 'AgentReadAssetMetadataToolSuccessResponse' });

const AgentReadAssetMetadataToolResponseSchema = z
  .discriminatedUnion('status', [
    AgentReadAssetMetadataToolApprovalRequiredResponseSchema,
    AgentReadAssetMetadataToolDeniedResponseSchema,
    AgentReadAssetMetadataToolSuccessResponseSchema,
  ])
  .meta({ id: 'AgentReadAssetMetadataToolResponseDto' });

const AgentSearchAssetsSelectionHandleSchema = z
  .object({
    id: uuid,
    sourceRef: AgentSearchSourceRefSchema,
    assetCount: z.number().int().min(0),
    sourceToolCallId: uuid.nullable(),
    expiresAt: isoDatetimeToDate,
  })
  .meta({ id: 'AgentSearchAssetsSelectionHandle' });

const AgentSearchAssetsSampleItemSchema = z
  .object({
    itemRef: z.string().regex(/^item:\d{3,}$/),
    type: AssetTypeSchema.optional(),
    originalFileName: z.string().optional(),
    localDateTime: isoDatetimeToDate.optional(),
    fileCreatedAt: isoDatetimeToDate.optional(),
    fileModifiedAt: isoDatetimeToDate.optional(),
    isFavorite: z.boolean().optional(),
    visibility: AssetVisibilitySchema.optional(),
    exifInfo: AgentAssetMetadataExifSchema.partial().nullable().optional(),
    tags: z.array(AgentAssetMetadataTagSchema.omit({ id: true })).optional(),
  })
  .meta({ id: 'AgentSearchAssetsSampleItem' });

const AgentSearchAssetsSampleSchema = z
  .object({
    sampleSize: z.number().int().min(0).max(MAX_SEARCH_SAMPLE_SIZE),
    items: z.array(AgentSearchAssetsSampleItemSchema).max(MAX_SEARCH_SAMPLE_SIZE),
  })
  .meta({ id: 'AgentSearchAssetsSample' });

const AgentReadSelectionMetadataCountsSchema = z
  .object({
    assets: z.number().int().min(0),
    sampled: z.number().int().min(0).max(MAX_SELECTION_METADATA_SAMPLE_SIZE),
  })
  .meta({ id: 'AgentReadSelectionMetadataCounts' });

const AgentReadSelectionMetadataToolResponseSchema = z
  .discriminatedUnion('status', [
    approvalRequiredResponse('AgentReadSelectionMetadataToolApprovalRequiredResponse'),
    deniedResponse('AgentReadSelectionMetadataToolDeniedResponse'),
    z
      .strictObject({
        status: z.literal('success'),
        toolCall: AgentToolCallResponseSchema,
        summary,
        selectionHandle: AgentSearchAssetsSelectionHandleSchema,
        fields: z.array(AgentAssetMetadataFieldSchema),
        counts: AgentReadSelectionMetadataCountsSchema,
        sample: AgentSearchAssetsSampleSchema.optional(),
        resultSize: AgentToolResultSizeSchema,
      })
      .meta({ id: 'AgentReadSelectionMetadataToolSuccessResponse' }),
  ])
  .meta({ id: 'AgentReadSelectionMetadataToolResponseDto' });

const AgentSearchAssetsToolResponseSchema = z
  .discriminatedUnion('status', [
    approvalRequiredResponse('AgentSearchAssetsToolApprovalRequiredResponse'),
    deniedResponse('AgentSearchAssetsToolDeniedResponse'),
    z
      .strictObject({
        status: z.literal('success'),
        toolCall: AgentToolCallResponseSchema,
        summary,
        detail: AgentSearchAssetsResponseDetailSchema,
        selectionHandle: AgentSearchAssetsSelectionHandleSchema,
        sample: AgentSearchAssetsSampleSchema.optional(),
        returnedCount: z.number().int().min(0),
        hasMore: z.boolean(),
        nextPage: z.string().nullable(),
        resultSize: AgentToolResultSizeSchema,
        totalCount: z.number().int().min(0).optional(),
        approximateTotal: z.number().int().min(0).optional(),
      })
      .meta({ id: 'AgentSearchAssetsToolSuccessResponse' }),
  ])
  .meta({ id: 'AgentSearchAssetsToolResponseDto' });

export const AgentResolvedAssetSearchFilterChoiceSchema = z
  .object({
    id: uuid.optional(),
    choiceRef: AgentChoiceRefSchema.optional(),
    value: z.string(),
    label: z.string(),
    searchFilter: AgentPartialSearchAssetsFiltersSchema.optional(),
  })
  .meta({ id: 'AgentResolvedAssetSearchFilterChoice' });

export const AgentResolvedAssetSearchFilterResultSchema = z
  .object({
    kind: z.enum(['person', 'tag', 'album', 'space', 'cameraMake', 'cameraModel', 'lensModel']),
    query: z.string(),
    status: z.enum(['matched', 'ambiguous', 'not_found']),
    value: z.string().optional(),
    id: uuid.optional(),
    searchFilter: AgentPartialSearchAssetsFiltersSchema.optional(),
    choices: z.array(AgentResolvedAssetSearchFilterChoiceSchema),
    message: z.string(),
  })
  .superRefine((result, ctx) => {
    for (const [index, choice] of result.choices.entries()) {
      if (choice.choiceRef && getAgentChoiceRefKind(choice.choiceRef) !== result.kind) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['choices', index, 'choiceRef'],
          message: 'choiceRef kind must match result kind',
        });
      }
    }
  })
  .meta({ id: 'AgentResolvedAssetSearchFilterResult' });

const AgentResolveAssetSearchFiltersToolResponseSchema = z
  .discriminatedUnion('status', [
    approvalRequiredResponse('AgentResolveAssetSearchFiltersToolApprovalRequiredResponse'),
    deniedResponse('AgentResolveAssetSearchFiltersToolDeniedResponse'),
    z
      .object({
        status: z.literal('success'),
        toolCall: AgentToolCallResponseSchema,
        resolvedFilters: AgentSearchAssetsFiltersSchema,
        resultSize: AgentToolResultSizeSchema,
        results: z.array(AgentResolvedAssetSearchFilterResultSchema),
      })
      .meta({ id: 'AgentResolveAssetSearchFiltersToolSuccessResponse' }),
  ])
  .meta({ id: 'AgentResolveAssetSearchFiltersToolResponseDto' });

const AgentReadAssetPreviewsToolResponseSchema = z
  .discriminatedUnion('status', [
    approvalRequiredResponse('AgentReadAssetPreviewsToolApprovalRequiredResponse'),
    deniedResponse('AgentReadAssetPreviewsToolDeniedResponse'),
    z
      .object({
        status: z.literal('success'),
        toolCall: AgentToolCallResponseSchema,
        resultSize: AgentToolResultSizeSchema,
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
        resultSize: AgentToolResultSizeSchema,
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
        resultSize: AgentToolResultSizeSchema,
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
        resultSize: AgentToolResultSizeSchema,
        album: AgentAlbumDetailSchema,
      })
      .meta({ id: 'AgentReadAlbumToolSuccessResponse' }),
  ])
  .meta({ id: 'AgentReadAlbumToolResponseDto' });

const AgentListSpacesToolResponseSchema = z
  .discriminatedUnion('status', [
    approvalRequiredResponse('AgentListSpacesToolApprovalRequiredResponse'),
    deniedResponse('AgentListSpacesToolDeniedResponse'),
    z
      .object({
        status: z.literal('success'),
        toolCall: AgentToolCallResponseSchema,
        resultSize: AgentToolResultSizeSchema,
        spaces: z.array(AgentSpaceSummarySchema),
      })
      .meta({ id: 'AgentListSpacesToolSuccessResponse' }),
  ])
  .meta({ id: 'AgentListSpacesToolResponseDto' });

const AgentReadSpaceToolResponseSchema = z
  .discriminatedUnion('status', [
    approvalRequiredResponse('AgentReadSpaceToolApprovalRequiredResponse'),
    deniedResponse('AgentReadSpaceToolDeniedResponse'),
    z
      .object({
        status: z.literal('success'),
        toolCall: AgentToolCallResponseSchema,
        resultSize: AgentToolResultSizeSchema,
        space: AgentSpaceDetailSchema,
      })
      .meta({ id: 'AgentReadSpaceToolSuccessResponse' }),
  ])
  .meta({ id: 'AgentReadSpaceToolResponseDto' });

const AgentSearchUsersToolResponseSchema = z
  .discriminatedUnion('status', [
    approvalRequiredResponse('AgentSearchUsersToolApprovalRequiredResponse'),
    deniedResponse('AgentSearchUsersToolDeniedResponse'),
    z
      .object({
        status: z.literal('success'),
        toolCall: AgentToolCallResponseSchema,
        resultSize: AgentToolResultSizeSchema,
        users: z.array(AgentUserLookupResultSchema),
      })
      .meta({ id: 'AgentSearchUsersToolSuccessResponse' }),
  ])
  .meta({ id: 'AgentSearchUsersToolResponseDto' });

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
export class AgentReadSelectionMetadataToolRequestDto extends createZodDto(
  AgentReadSelectionMetadataToolRequestSchema,
) {}
export class AgentSearchAssetsToolRequestDto extends createZodDto(AgentSearchAssetsToolRequestSchema) {}
export class AgentResolveAssetSearchFiltersToolRequestDto extends createZodDto(
  AgentResolveAssetSearchFiltersToolRequestSchema,
) {}
export class AgentReadAssetPreviewsToolRequestDto extends createZodDto(AgentReadAssetPreviewsToolRequestSchema) {}
export class AgentReadAssetOriginalsToolRequestDto extends createZodDto(AgentReadAssetOriginalsToolRequestSchema) {}
export class AgentListAlbumsToolRequestDto extends createZodDto(AgentListAlbumsToolRequestSchema) {}
export class AgentReadAlbumToolRequestDto extends createZodDto(AgentReadAlbumToolRequestSchema) {}
export class AgentListSpacesToolRequestDto extends createZodDto(AgentListSpacesToolRequestSchema) {}
export class AgentReadSpaceToolRequestDto extends createZodDto(AgentReadSpaceToolRequestSchema) {}
export class AgentSearchUsersToolRequestDto extends createZodDto(AgentSearchUsersToolRequestSchema) {}
export class AgentToolApprovalDto extends createZodDto(AgentToolApprovalSchema) {}
export class AgentToolCallResponseDto extends createZodDto(AgentToolCallResponseSchema) {}
export class AgentToolCallParamsDto extends createZodDto(AgentToolCallParamsSchema) {}
export const AgentReadAssetMetadataToolResponseDto = namedZodDto(
  'AgentReadAssetMetadataToolResponseDto',
  AgentReadAssetMetadataToolResponseSchema,
);
export type AgentReadAssetMetadataToolResponseDto = z.output<typeof AgentReadAssetMetadataToolResponseSchema>;
export const AgentReadSelectionMetadataToolResponseDto = namedZodDto(
  'AgentReadSelectionMetadataToolResponseDto',
  AgentReadSelectionMetadataToolResponseSchema,
);
export type AgentReadSelectionMetadataToolResponseDto = z.output<
  typeof AgentReadSelectionMetadataToolResponseSchema
>;
export const AgentSearchAssetsToolResponseDto = namedZodDto(
  'AgentSearchAssetsToolResponseDto',
  AgentSearchAssetsToolResponseSchema,
);
export type AgentSearchAssetsToolResponseDto = z.output<typeof AgentSearchAssetsToolResponseSchema>;
export const AgentResolveAssetSearchFiltersToolResponseDto = namedZodDto(
  'AgentResolveAssetSearchFiltersToolResponseDto',
  AgentResolveAssetSearchFiltersToolResponseSchema,
);
export type AgentResolveAssetSearchFiltersToolResponseDto = z.output<
  typeof AgentResolveAssetSearchFiltersToolResponseSchema
>;
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
export const AgentListSpacesToolResponseDto = namedZodDto(
  'AgentListSpacesToolResponseDto',
  AgentListSpacesToolResponseSchema,
);
export type AgentListSpacesToolResponseDto = z.output<typeof AgentListSpacesToolResponseSchema>;
export const AgentReadSpaceToolResponseDto = namedZodDto(
  'AgentReadSpaceToolResponseDto',
  AgentReadSpaceToolResponseSchema,
);
export type AgentReadSpaceToolResponseDto = z.output<typeof AgentReadSpaceToolResponseSchema>;
export const AgentSearchUsersToolResponseDto = namedZodDto(
  'AgentSearchUsersToolResponseDto',
  AgentSearchUsersToolResponseSchema,
);
export type AgentSearchUsersToolResponseDto = z.output<typeof AgentSearchUsersToolResponseSchema>;
