import { FaceRepairDeclineRemoveRequestSchema } from 'src/dtos/face-repair.dto';
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
