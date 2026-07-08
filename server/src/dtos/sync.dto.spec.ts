import { SyncStreamDto } from 'src/dtos/sync.dto';
import { SyncRequestType } from 'src/enum';

describe('SyncStreamDto', () => {
  it('accepts an array of known request types unchanged', () => {
    const result = SyncStreamDto.schema.safeParse({
      types: [SyncRequestType.UsersV1, SyncRequestType.AlbumsV1],
    });
    expect(result.success).toBe(true);
    expect(result.data?.types).toEqual([SyncRequestType.UsersV1, SyncRequestType.AlbumsV1]);
  });

  it('drops an unknown request type but keeps the known ones (no rejection)', () => {
    const result = SyncStreamDto.schema.safeParse({
      types: [SyncRequestType.UsersV1, 'TotallyNotARealType', SyncRequestType.AlbumsV1],
    });
    expect(result.success).toBe(true);
    expect(result.data?.types).toEqual([SyncRequestType.UsersV1, SyncRequestType.AlbumsV1]);
  });

  it('drops a future fork-only type this server does not recognise (skew safety)', () => {
    const result = SyncStreamDto.schema.safeParse({ types: [SyncRequestType.UsersV1, 'SomeFutureTypeV9'] });
    expect(result.success).toBe(true);
    expect(result.data?.types).toEqual([SyncRequestType.UsersV1]);
  });

  it('parses an all-unknown array to an empty types list (no 400)', () => {
    const result = SyncStreamDto.schema.safeParse({ types: ['nope', 'still-nope'] });
    expect(result.success).toBe(true);
    expect(result.data?.types).toEqual([]);
  });

  it('still REJECTS a non-array types field (structural error is not masked)', () => {
    const result = SyncStreamDto.schema.safeParse({ types: 'UsersV1' });
    expect(result.success).toBe(false);
  });

  it('still REJECTS a missing types field', () => {
    const result = SyncStreamDto.schema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('preserves the reset flag alongside filtered types', () => {
    const result = SyncStreamDto.schema.safeParse({ types: [SyncRequestType.UsersV1, 'x'], reset: true });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ types: [SyncRequestType.UsersV1], reset: true });
  });
});
