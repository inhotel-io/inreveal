import {
  FaceRepairApplyRequestSchema,
  FaceRepairClusterFacesRequestSchema,
  FaceRepairDeclineRemoveRequestSchema,
  FaceRepairResolveRequestSchema,
  FaceRepairScanTriggerRequestSchema,
} from 'src/dtos/face-repair.dto';
import { describe, expect, it } from 'vitest';

// face_repair_decline.id is a UUID v7 (@PrimaryGeneratedUuidV7Column). The remove DTO must accept it —
// validating with z.uuidv4() rejected v7 ids with a 400, which broke "Undo" on the declined page.
const UUID_V7 = '01890000-0000-7000-8000-000000000001';
const UUID_V4 = '00000000-0000-4000-a000-000000000001';

describe('FaceRepairDeclineRemoveRequestSchema', () => {
  it('accepts a v7 row id (regression for the declined-page Undo 400)', () => {
    const result = FaceRepairDeclineRemoveRequestSchema.safeParse({ ids: [UUID_V7] });
    expect(result.success).toBe(true);
  });

  it('still accepts v4 ids', () => {
    expect(FaceRepairDeclineRemoveRequestSchema.safeParse({ ids: [UUID_V4] }).success).toBe(true);
  });

  it('accepts removal by face natural key', () => {
    const result = FaceRepairDeclineRemoveRequestSchema.safeParse({
      faces: [{ assetFaceId: UUID_V4, suspectedOwnerId: UUID_V4 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty ids array', () => {
    expect(FaceRepairDeclineRemoveRequestSchema.safeParse({ ids: [] }).success).toBe(false);
  });

  it('rejects a non-uuid id', () => {
    expect(FaceRepairDeclineRemoveRequestSchema.safeParse({ ids: ['not-a-uuid'] }).success).toBe(false);
  });
});

describe('FaceRepairScanTriggerRequestSchema', () => {
  it('accepts an empty body (quick-path Re-scan)', () => {
    expect(FaceRepairScanTriggerRequestSchema.safeParse({}).success).toBe(true);
  });

  it('accepts the curated params', () => {
    const r = FaceRepairScanTriggerRequestSchema.safeParse({
      params: { maxDistance: 0.45, minFaces: 4, maxFlaggedFraction: 0.3 },
    });
    expect(r.success).toBe(true);
  });

  it('accepts the non-curated params too (full optional set; future raw panel)', () => {
    const r = FaceRepairScanTriggerRequestSchema.safeParse({
      params: { voteWindow: 100, voteMargin: 0, maxAttributionDistance: 0.4, largeClusterThreshold: 80 },
    });
    expect(r.success).toBe(true);
  });

  it('rejects maxDistance above 2', () => {
    expect(FaceRepairScanTriggerRequestSchema.safeParse({ params: { maxDistance: 2.5 } }).success).toBe(false);
  });

  it('rejects maxFlaggedFraction above 1', () => {
    expect(FaceRepairScanTriggerRequestSchema.safeParse({ params: { maxFlaggedFraction: 1.5 } }).success).toBe(false);
  });

  it('rejects minFaces below 1', () => {
    expect(FaceRepairScanTriggerRequestSchema.safeParse({ params: { minFaces: 0 } }).success).toBe(false);
  });

  it('rejects maxDistance at or below 0', () => {
    expect(FaceRepairScanTriggerRequestSchema.safeParse({ params: { maxDistance: 0 } }).success).toBe(false);
  });

  it('rejects maxAttributionDistance at or below 0', () => {
    expect(FaceRepairScanTriggerRequestSchema.safeParse({ params: { maxAttributionDistance: 0 } }).success).toBe(false);
  });
});

describe('FaceRepairApplyRequestSchema', () => {
  const UUID_A = '00000000-0000-4000-a000-000000000001';
  const UUID_B = '00000000-0000-4000-a000-000000000002';
  const UUID_C = '00000000-0000-4000-a000-000000000003';

  it('accepts the legacy flagged-only apply (non-empty approvedPersonIds, no manualMove)', () => {
    expect(FaceRepairApplyRequestSchema.safeParse({ approvedPersonIds: [UUID_A] }).success).toBe(true);
  });

  it('accepts an entire-cluster apply: empty approvedPersonIds WITH manualMove', () => {
    const result = FaceRepairApplyRequestSchema.safeParse({
      approvedPersonIds: [],
      manualMove: { personId: UUID_A, destinationPersonId: UUID_B, entireCluster: true },
    });
    expect(result.success).toBe(true);
  });

  it('defaults approvedPersonIds to [] when omitted but manualMove is present', () => {
    const result = FaceRepairApplyRequestSchema.safeParse({
      manualMove: { personId: UUID_A, destinationPersonId: UUID_B, faceIds: [UUID_C] },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.approvedPersonIds).toEqual([]);
    }
  });

  it('rejects a request that would do nothing: empty approvedPersonIds AND no manualMove', () => {
    expect(FaceRepairApplyRequestSchema.safeParse({ approvedPersonIds: [] }).success).toBe(false);
    expect(FaceRepairApplyRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a manualMove missing destinationPersonId (E17)', () => {
    const result = FaceRepairApplyRequestSchema.safeParse({
      approvedPersonIds: [],
      manualMove: { personId: UUID_A, entireCluster: true },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a manualMove with a non-array faceIds', () => {
    const result = FaceRepairApplyRequestSchema.safeParse({
      manualMove: { personId: UUID_A, destinationPersonId: UUID_B, faceIds: 'nope' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid in approvedPersonIds', () => {
    expect(FaceRepairApplyRequestSchema.safeParse({ approvedPersonIds: ['not-a-uuid'] }).success).toBe(false);
  });
});

describe('FaceRepairResolveRequestSchema', () => {
  const PERSON_ID = '00000000-0000-4000-a000-000000000001';
  const OWNER_A = '00000000-0000-4000-a000-000000000002';
  const OWNER_B = '00000000-0000-4000-a000-000000000003';
  const FACE_1 = '00000000-0000-4000-a000-000000000004';
  const FACE_2 = '00000000-0000-4000-a000-000000000005';
  const FACE_3 = '00000000-0000-4000-a000-000000000006';

  it('accepts owner move groups and defaults stay/lock/detach to []', () => {
    const result = FaceRepairResolveRequestSchema.safeParse({
      personId: PERSON_ID,
      moveToPerson: [
        { destinationPersonId: OWNER_A, faceIds: [FACE_1, FACE_2] },
        { destinationPersonId: OWNER_B, faceIds: [FACE_3] },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stay).toEqual([]);
      expect(result.data.lock).toEqual([]);
      expect(result.data.detach).toEqual([]);
    }
  });

  it('accepts an empty body beyond personId (defaults every bucket to [])', () => {
    const result = FaceRepairResolveRequestSchema.safeParse({ personId: PERSON_ID });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.moveToPerson).toEqual([]);
    }
  });

  it('rejects a non-uuid faceId in a moveToPerson group', () => {
    const result = FaceRepairResolveRequestSchema.safeParse({
      personId: PERSON_ID,
      moveToPerson: [{ destinationPersonId: OWNER_A, faceIds: ['not-a-uuid'] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid personId', () => {
    expect(FaceRepairResolveRequestSchema.safeParse({ personId: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects a moveToPerson group with an empty faceIds array', () => {
    const result = FaceRepairResolveRequestSchema.safeParse({
      personId: PERSON_ID,
      moveToPerson: [{ destinationPersonId: OWNER_A, faceIds: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid id in stay/lock/detach', () => {
    expect(FaceRepairResolveRequestSchema.safeParse({ personId: PERSON_ID, stay: ['not-a-uuid'] }).success).toBe(false);
    expect(FaceRepairResolveRequestSchema.safeParse({ personId: PERSON_ID, lock: ['not-a-uuid'] }).success).toBe(false);
    expect(FaceRepairResolveRequestSchema.safeParse({ personId: PERSON_ID, detach: ['not-a-uuid'] }).success).toBe(
      false,
    );
  });
});

describe('FaceRepairClusterFacesRequestSchema', () => {
  const UUID = '00000000-0000-4000-a000-000000000001';

  it('accepts a valid page/size and defaults excludeFaceIds to []', () => {
    const result = FaceRepairClusterFacesRequestSchema.safeParse({ page: 0, size: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.excludeFaceIds).toEqual([]);
    }
  });

  it('accepts excludeFaceIds and the boundary size of 200', () => {
    expect(FaceRepairClusterFacesRequestSchema.safeParse({ excludeFaceIds: [UUID], page: 3, size: 200 }).success).toBe(
      true,
    );
  });

  it('rejects size below 1 (E14)', () => {
    expect(FaceRepairClusterFacesRequestSchema.safeParse({ page: 0, size: 0 }).success).toBe(false);
  });

  it('rejects size above 200 (E14)', () => {
    expect(FaceRepairClusterFacesRequestSchema.safeParse({ page: 0, size: 201 }).success).toBe(false);
  });

  it('rejects a negative page (E14)', () => {
    expect(FaceRepairClusterFacesRequestSchema.safeParse({ page: -1, size: 50 }).success).toBe(false);
  });

  it('rejects a non-integer size', () => {
    expect(FaceRepairClusterFacesRequestSchema.safeParse({ page: 0, size: 1.5 }).success).toBe(false);
  });
});
