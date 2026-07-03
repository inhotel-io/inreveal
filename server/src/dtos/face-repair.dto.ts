import { createZodDto } from 'nestjs-zod';
import z from 'zod';

export const FaceRepairRequestSchema = z
  .object({
    dryRun: z.boolean().default(true),
    ownerId: z.uuidv4().optional(),
    personId: z.uuidv4().optional(),
    maxDistance: z.number().gt(0).max(2).optional(),
    minFaces: z.number().int().min(1).optional(),
    voteWindow: z.number().int().min(1).optional(),
    voteMargin: z.number().int().min(0).optional(),
    maxAttributionDistance: z.number().gt(0).max(2).optional(),
    maxFlaggedFraction: z.number().min(0).max(1).optional(),
  })
  .meta({ id: 'FaceRepairRequestDto' });

export class FaceRepairRequestDto extends createZodDto(FaceRepairRequestSchema) {}

const SuspectedOwnerSchema = z.object({ ownerPersonId: z.string(), count: z.number() });
const PersonSchema = z.object({
  personId: z.string(),
  eligible: z.number(),
  flagged: z.number(),
  flaggedFraction: z.number(),
  reviewOnly: z.boolean(),
  suspectedOwners: z.array(SuspectedOwnerSchema),
});

export const FaceRepairResponseSchema = z
  .object({
    dryRun: z.boolean(),
    mutated: z.boolean(),
    executed: z.object({ moved: z.number(), skipped: z.number() }).optional(),
    report: z.object({
      totals: z.object({
        eligibleFaces: z.number(),
        flaggedFaces: z.number(),
        toRepair: z.number(),
        reviewOnlyFaces: z.number(),
        reviewOnlyPersons: z.number(),
        affectedPersons: z.number(),
        reviewOnlyByReason: z.object({ overCap: z.number(), badTarget: z.number(), unAttributable: z.number() }),
      }),
      persons: z.array(PersonSchema),
    }),
  })
  .meta({ id: 'FaceRepairResponseDto' });

export class FaceRepairResponseDto extends createZodDto(FaceRepairResponseSchema) {}

export const FaceRepairScanTriggerResponseSchema = z
  .object({ scanId: z.string() })
  .meta({ id: 'FaceRepairScanTriggerResponseDto' });
export class FaceRepairScanTriggerResponseDto extends createZodDto(FaceRepairScanTriggerResponseSchema) {}

export const FaceRepairScanParamsSchema = z.object({
  maxDistance: z.number().gt(0).max(2).optional(),
  minFaces: z.number().int().min(1).optional(),
  voteWindow: z.number().int().min(1).optional(),
  voteMargin: z.number().int().min(0).optional(),
  maxAttributionDistance: z.number().gt(0).max(2).optional(),
  maxFlaggedFraction: z.number().min(0).max(1).optional(),
  largeClusterThreshold: z.number().int().min(1).optional(),
});
export type FaceRepairScanParams = z.infer<typeof FaceRepairScanParamsSchema>;

export const FaceRepairScanTriggerRequestSchema = z
  .object({ params: FaceRepairScanParamsSchema.optional() })
  .meta({ id: 'FaceRepairScanTriggerRequestDto' });
export class FaceRepairScanTriggerRequestDto extends createZodDto(FaceRepairScanTriggerRequestSchema) {}

export const FaceRepairScanDefaultsSchema = z
  .object({
    maxDistance: z.number(),
    minFaces: z.number().int(),
    maxFlaggedFraction: z.number(),
  })
  .meta({ id: 'FaceRepairScanDefaultsDto' });
export class FaceRepairScanDefaultsDto extends createZodDto(FaceRepairScanDefaultsSchema) {}

const ScanSuspectedOwnerSchema = z.object({
  ownerPersonId: z.string(),
  ownerName: z.string().nullable(),
  thumbnailFaceId: z.string().nullable(),
  count: z.number(),
});
const ScanPersonSchema = z.object({
  personId: z.string(),
  ownerId: z.string(),
  personName: z.string().nullable(),
  faceCount: z.number(),
  thumbnailFaceId: z.string().nullable(),
  eligible: z.number(),
  flagged: z.number(),
  flaggedFraction: z.number(),
  suspectedOwners: z.array(ScanSuspectedOwnerSchema),
  recommendation: z.enum(['confident', 'review-first']),
  reviewReasons: z.array(z.string()),
});
export const FaceRepairScanStatusSchema = z
  .object({
    id: z.string(),
    status: z.enum(['pending', 'running', 'completed', 'failed']),
    progress: z.object({ scanned: z.number(), total: z.number() }).nullable(),
    totals: z
      .object({
        eligibleFaces: z.number(),
        flaggedFaces: z.number(),
        toRepair: z.number(),
        reviewOnlyFaces: z.number(),
        reviewOnlyPersons: z.number(),
        affectedPersons: z.number(),
        reviewOnlyByReason: z.object({ overCap: z.number(), badTarget: z.number(), unAttributable: z.number() }),
      })
      .nullable(),
    persons: z.array(ScanPersonSchema),
    error: z.string().nullable(),
    startedAt: z.string().meta({ format: 'date-time' }).nullable(),
    finishedAt: z.string().meta({ format: 'date-time' }).nullable(),
    createdAt: z.string().meta({ format: 'date-time' }),
  })
  .meta({ id: 'FaceRepairScanStatusDto' });
export class FaceRepairScanStatusDto extends createZodDto(FaceRepairScanStatusSchema) {}

const FaceRepairManualMoveSchema = z.object({
  personId: z.uuidv4(),
  destinationPersonId: z.uuidv4(),
  faceIds: z.array(z.uuidv4()).optional(),
  entireCluster: z.boolean().optional(),
});

export const FaceRepairApplyRequestSchema = z
  .object({
    approvedPersonIds: z.array(z.uuidv4()).default([]),
    excludeFaceIds: z.array(z.uuidv4()).optional(),
    manualMove: FaceRepairManualMoveSchema.optional(),
  })
  .refine((value) => value.approvedPersonIds.length > 0 || value.manualMove !== undefined, {
    error: 'approvedPersonIds must be non-empty unless manualMove is provided',
    path: ['approvedPersonIds'],
  })
  .meta({ id: 'FaceRepairApplyRequestDto' });
export class FaceRepairApplyRequestDto extends createZodDto(FaceRepairApplyRequestSchema) {}

export const FaceRepairApplyResponseSchema = z
  .object({ moved: z.number(), skipped: z.number() })
  .meta({ id: 'FaceRepairApplyResponseDto' });
export class FaceRepairApplyResponseDto extends createZodDto(FaceRepairApplyResponseSchema) {}

const FlaggedFaceSchema = z.object({ assetFaceId: z.string(), suspectedOwnerId: z.string() });
export const FaceRepairPersonFacesSchema = z
  .object({ personId: z.string(), flaggedFaces: z.array(FlaggedFaceSchema) })
  .meta({ id: 'FaceRepairPersonFacesDto' });
export class FaceRepairPersonFacesDto extends createZodDto(FaceRepairPersonFacesSchema) {}

const FaceDeclineSchema = z.object({ assetFaceId: z.uuidv4(), suspectedOwnerId: z.uuidv4() });
const PersonDeclineSchema = z.object({ personId: z.uuidv4(), suspectedOwnerIds: z.array(z.uuidv4()) });

export const FaceRepairDeclineRequestSchema = z
  .object({
    faces: z.array(FaceDeclineSchema).optional(),
    persons: z.array(PersonDeclineSchema).optional(),
  })
  .meta({ id: 'FaceRepairDeclineRequestDto' });
export class FaceRepairDeclineRequestDto extends createZodDto(FaceRepairDeclineRequestSchema) {}

export const FaceRepairDeclineCreatedSchema = z
  .object({ created: z.number() })
  .meta({ id: 'FaceRepairDeclineCreatedDto' });
export class FaceRepairDeclineCreatedDto extends createZodDto(FaceRepairDeclineCreatedSchema) {}

const DeclineItemSchema = z.object({
  id: z.string(),
  // Plain string, NOT z.enum: an inline `z.enum(['face','person'])` here generates an anonymous `Type` enum in
  // the SDK, which joins oazapfts's numbered `Type`/`Type2`/... pool and RENUMBERS existing anonymous enums —
  // silently repointing unrelated consumers (e.g. web's `Type2 as ScopedPersonProfileType`) to the wrong enum.
  // The value is always 'face' | 'person'; the web reads it via a local cast.
  type: z.string(),
  assetFaceId: z.string().nullable(),
  suspectedOwnerId: z.string().nullable(),
  suspectedOwnerName: z.string().nullable(),
  suspectedOwnerThumbnailFaceId: z.string().nullable(),
  personId: z.string().nullable(),
  personName: z.string().nullable(),
  personThumbnailFaceId: z.string().nullable(),
  createdAt: z.string().meta({ format: 'date-time' }),
});
export const FaceRepairDeclineListSchema = z
  .object({ declines: z.array(DeclineItemSchema) })
  .meta({ id: 'FaceRepairDeclineListDto' });
export class FaceRepairDeclineListDto extends createZodDto(FaceRepairDeclineListSchema) {}

export const FaceRepairDeclineRemoveRequestSchema = z
  .object({
    // z.uuid() (version-agnostic), NOT z.uuidv4(): face_repair_decline.id is a UUID **v7**
    // (@PrimaryGeneratedUuidV7Column). z.uuidv4() enforces the version nibble == 4 and rejects v7 ids
    // with a 400 — which broke "Undo" on the declined page. z.uuid() accepts any RFC 9562 version.
    ids: z.array(z.uuid()).min(1).optional(),
    // Remove face declines by their natural key. Lets the review screen undo a just-made per-face decline
    // without first re-fetching the (server-generated) row id. assetFaceId/suspectedOwnerId are v4 entity ids.
    faces: z.array(FaceDeclineSchema).min(1).optional(),
  })
  .meta({ id: 'FaceRepairDeclineRemoveRequestDto' });
export class FaceRepairDeclineRemoveRequestDto extends createZodDto(FaceRepairDeclineRemoveRequestSchema) {}

export const FaceRepairDeclineRemovedSchema = z
  .object({ removed: z.number() })
  .meta({ id: 'FaceRepairDeclineRemovedDto' });
export class FaceRepairDeclineRemovedDto extends createZodDto(FaceRepairDeclineRemovedSchema) {}

export const FaceRepairClusterFacesRequestSchema = z
  .object({
    excludeFaceIds: z.array(z.uuidv4()).default([]),
    page: z.number().int().min(0),
    size: z.number().int().min(1).max(200),
  })
  .meta({ id: 'FaceRepairClusterFacesRequestDto' });
export class FaceRepairClusterFacesRequestDto extends createZodDto(FaceRepairClusterFacesRequestSchema) {}

export const FaceRepairClusterFacesResponseSchema = z
  .object({
    faces: z.array(z.object({ assetFaceId: z.string() })),
    total: z.number(),
    hasMore: z.boolean(),
  })
  .meta({ id: 'FaceRepairClusterFacesResponseDto' });
export class FaceRepairClusterFacesResponseDto extends createZodDto(FaceRepairClusterFacesResponseSchema) {}
