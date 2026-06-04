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
    executed: z.object({ unassigned: z.number(), requeued: z.number() }).optional(),
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
    startedAt: z.date().nullable(),
    finishedAt: z.date().nullable(),
    createdAt: z.date(),
  })
  .meta({ id: 'FaceRepairScanStatusDto' });
export class FaceRepairScanStatusDto extends createZodDto(FaceRepairScanStatusSchema) {}
