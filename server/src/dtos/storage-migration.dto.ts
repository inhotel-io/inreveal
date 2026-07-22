import { createZodDto } from 'nestjs-zod';
import z from 'zod';

const StorageMigrationDirectionSchema = z.enum(['toS3', 'toDisk']).meta({ id: 'StorageMigrationDirection' });

const StorageMigrationFileTypesSchema = z
  .object({
    originals: z.boolean().default(true).describe('Include original files'),
    thumbnails: z.boolean().default(true).describe('Include thumbnail files'),
    previews: z.boolean().default(true).describe('Include preview files'),
    fullsize: z.boolean().default(true).describe('Include full-size files'),
    encodedVideos: z.boolean().default(true).describe('Include encoded video files'),
    sidecars: z.boolean().default(true).describe('Include sidecar files'),
    personThumbnails: z.boolean().default(true).describe('Include person thumbnail files'),
    profileImages: z.boolean().default(true).describe('Include profile image files'),
  })
  .meta({ id: 'StorageMigrationFileTypesDto' });

const StorageMigrationStartSchema = z
  .object({
    direction: StorageMigrationDirectionSchema.describe('Migration direction'),
    deleteSource: z.boolean().default(false).describe('Delete source files after migration'),
    fileTypes: StorageMigrationFileTypesSchema.describe('File types to migrate'),
    concurrency: z.int().min(1).max(20).default(5).describe('Concurrency level'),
  })
  .meta({ id: 'StorageMigrationStartDto' });

const StorageMigrationEstimateQuerySchema = z
  .object({
    direction: StorageMigrationDirectionSchema.describe('Migration direction'),
  })
  .meta({ id: 'StorageMigrationEstimateQueryDto' });

const StorageMigrationBatchParamSchema = z
  .object({
    batchId: z.uuidv4().describe('Batch ID'),
  })
  .meta({ id: 'StorageMigrationBatchParamDto' });

const StorageMigrationFileCountsSchema = z
  .object({
    originals: z.int().describe('Number of original files'),
    thumbnails: z.int().describe('Number of thumbnail files'),
    previews: z.int().describe('Number of preview files'),
    fullsize: z.int().describe('Number of full-size files'),
    encodedVideos: z.int().describe('Number of encoded video files'),
    sidecars: z.int().describe('Number of sidecar files'),
    personThumbnails: z.int().describe('Number of person thumbnail files'),
    profileImages: z.int().describe('Number of profile image files'),
    total: z.int().describe('Total number of files'),
  })
  .meta({ id: 'StorageMigrationFileCountsDto' });

const StorageMigrationEstimateResponseSchema = z
  .object({
    direction: StorageMigrationDirectionSchema.describe('Migration direction'),
    fileCounts: StorageMigrationFileCountsSchema.describe('Number of files that would be migrated, by type'),
    estimatedSizeBytes: z.int().describe('Approximate size of the original files that would be migrated, in bytes'),
  })
  .meta({ id: 'StorageMigrationEstimateResponseDto' });

const StorageMigrationStartResponseSchema = z
  .object({
    batchId: z.uuidv4().describe('Batch ID of the started migration, used to roll it back'),
  })
  .meta({ id: 'StorageMigrationStartResponseDto' });

const StorageMigrationStatusResponseSchema = z
  .object({
    isActive: z.boolean().describe('Whether a migration is currently running'),
    active: z.int().describe('Number of active jobs'),
    completed: z.int().describe('Number of completed jobs'),
    failed: z.int().describe('Number of failed jobs'),
    delayed: z.int().describe('Number of delayed jobs'),
    waiting: z.int().describe('Number of waiting jobs'),
    paused: z.int().describe('Number of paused jobs'),
  })
  .meta({ id: 'StorageMigrationStatusResponseDto' });

const StorageMigrationRollbackResponseSchema = z
  .object({
    rolledBack: z.int().describe('Number of entries that were rolled back'),
    failed: z.int().describe('Number of entries that could not be rolled back'),
    total: z.int().describe('Total number of entries in the batch'),
  })
  .meta({ id: 'StorageMigrationRollbackResponseDto' });

export class StorageMigrationFileTypesDto extends createZodDto(StorageMigrationFileTypesSchema) {}
export class StorageMigrationStartDto extends createZodDto(StorageMigrationStartSchema) {}
export class StorageMigrationEstimateQueryDto extends createZodDto(StorageMigrationEstimateQuerySchema) {}
export class StorageMigrationBatchParamDto extends createZodDto(StorageMigrationBatchParamSchema) {}
export class StorageMigrationFileCountsDto extends createZodDto(StorageMigrationFileCountsSchema) {}
export class StorageMigrationEstimateResponseDto extends createZodDto(StorageMigrationEstimateResponseSchema) {}
export class StorageMigrationStartResponseDto extends createZodDto(StorageMigrationStartResponseSchema) {}
export class StorageMigrationStatusResponseDto extends createZodDto(StorageMigrationStatusResponseSchema) {}
export class StorageMigrationRollbackResponseDto extends createZodDto(StorageMigrationRollbackResponseSchema) {}
