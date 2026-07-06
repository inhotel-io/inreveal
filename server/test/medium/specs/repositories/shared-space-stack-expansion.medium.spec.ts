import { Kysely } from 'kysely';
import { AssetVisibility, TimeBucketSize } from 'src/enum';
import { AssetRepository } from 'src/repositories/asset.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { StackRepository } from 'src/repositories/stack.repository';
import { DB } from 'src/schema';
import { BaseService } from 'src/services/base.service';
import { newMediumService } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

let defaultDatabase: Kysely<DB>;

const setup = (db?: Kysely<DB>) => {
  const { ctx } = newMediumService(BaseService, {
    database: db || defaultDatabase,
    real: [],
    mock: [LoggingRepository],
  });
  return { ctx, sut: ctx.get(SharedSpaceRepository) };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

describe('SharedSpaceRepository.getOwnedStackSiblingIds', () => {
  it('returns all siblings when the seed is the stack cover (E1)', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const { asset: primary } = await ctx.newAsset({ ownerId: user.id });
    const { asset: child1 } = await ctx.newAsset({ ownerId: user.id });
    const { asset: child2 } = await ctx.newAsset({ ownerId: user.id });
    await ctx.newStack({ ownerId: user.id }, [primary.id, child1.id, child2.id]);

    const result = await sut.getOwnedStackSiblingIds(user.id, [primary.id]);

    expect(new Set(result)).toEqual(new Set([primary.id, child1.id, child2.id]));
  });

  it('returns all siblings incl. the primary when the seed is a non-primary frame (E2)', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const { asset: primary } = await ctx.newAsset({ ownerId: user.id });
    const { asset: child1 } = await ctx.newAsset({ ownerId: user.id });
    await ctx.newStack({ ownerId: user.id }, [primary.id, child1.id]);

    const result = await sut.getOwnedStackSiblingIds(user.id, [child1.id]);

    expect(new Set(result)).toEqual(new Set([primary.id, child1.id]));
  });

  it('returns nothing for an asset with no stack (E3)', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const { asset } = await ctx.newAsset({ ownerId: user.id });

    const result = await sut.getOwnedStackSiblingIds(user.id, [asset.id]);

    expect(result).toEqual([]);
  });

  it('does not expand a stack owned by another user (E4)', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: other } = await ctx.newUser();
    const { asset: primary } = await ctx.newAsset({ ownerId: owner.id });
    const { asset: child1 } = await ctx.newAsset({ ownerId: owner.id });
    await ctx.newStack({ ownerId: owner.id }, [primary.id, child1.id]);

    const result = await sut.getOwnedStackSiblingIds(other.id, [primary.id]);

    expect(result).toEqual([]);
  });

  it('excludes Hidden and Locked siblings (E5)', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const { asset: primary } = await ctx.newAsset({ ownerId: user.id });
    const { asset: hidden } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Hidden });
    const { asset: locked } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Locked });
    await ctx.newStack({ ownerId: user.id }, [primary.id, hidden.id, locked.id]);

    const result = await sut.getOwnedStackSiblingIds(user.id, [primary.id]);

    expect(new Set(result)).toEqual(new Set([primary.id]));
  });

  it('includes Archived siblings — archive is space-eligible (E5b)', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const { asset: primary } = await ctx.newAsset({ ownerId: user.id });
    const { asset: archived } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Archive });
    await ctx.newStack({ ownerId: user.id }, [primary.id, archived.id]);

    const result = await sut.getOwnedStackSiblingIds(user.id, [primary.id]);

    expect(new Set(result)).toEqual(new Set([primary.id, archived.id]));
  });

  it('excludes soft-deleted siblings (E6)', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const { asset: primary } = await ctx.newAsset({ ownerId: user.id });
    const { asset: deleted } = await ctx.newAsset({ ownerId: user.id });
    await ctx.newStack({ ownerId: user.id }, [primary.id, deleted.id]);
    await ctx.softDeleteAsset(deleted.id);

    const result = await sut.getOwnedStackSiblingIds(user.id, [primary.id]);

    expect(new Set(result)).toEqual(new Set([primary.id]));
  });

  it('dedupes when two seeds share a stack (E8)', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const { asset: primary } = await ctx.newAsset({ ownerId: user.id });
    const { asset: child1 } = await ctx.newAsset({ ownerId: user.id });
    await ctx.newStack({ ownerId: user.id }, [primary.id, child1.id]);

    const result = await sut.getOwnedStackSiblingIds(user.id, [primary.id, child1.id]);

    expect(result.length).toBe(new Set(result).size);
    expect(new Set(result)).toEqual(new Set([primary.id, child1.id]));
  });

  it('handles a mixed batch of stacked and unstacked seeds (E9)', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const { asset: primary } = await ctx.newAsset({ ownerId: user.id });
    const { asset: child1 } = await ctx.newAsset({ ownerId: user.id });
    const { asset: standalone } = await ctx.newAsset({ ownerId: user.id });
    await ctx.newStack({ ownerId: user.id }, [primary.id, child1.id]);

    const result = await sut.getOwnedStackSiblingIds(user.id, [primary.id, standalone.id]);

    // standalone has no stack → contributes no siblings; the stack expands fully
    expect(new Set(result)).toEqual(new Set([primary.id, child1.id]));
  });

  it('returns [] for empty input (E11)', async () => {
    const { sut } = setup();
    const result = await sut.getOwnedStackSiblingIds('00000000-0000-0000-0000-000000000000', []);
    expect(result).toEqual([]);
  });
});

const addWholeStack = async (ctx: any, sut: SharedSpaceRepository, spaceId: string, userId: string, seedId: string) => {
  const siblings = await sut.getOwnedStackSiblingIds(userId, [seedId]);
  const expanded = [...new Set([seedId, ...siblings])];
  return sut.addAssets(expanded.map((assetId) => ({ spaceId, assetId, addedById: userId })));
};

const bucketCount = async (ctx: any, spaceId: string) => {
  const buckets = await ctx.get(AssetRepository).getTimeBuckets({
    spaceId,
    visibility: AssetVisibility.Timeline,
    bucketSize: TimeBucketSize.Year,
    withStacked: true,
  });
  return buckets.reduce((sum: number, b: { count: number }) => sum + b.count, 0);
};

describe('stack-in-space composition (E10/E13)', () => {
  it('collapses to one cover after the whole stack is added (E1/E13)', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: user.id, faceRecognitionEnabled: false });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: user.id, role: 'owner' });
    const { asset: primary } = await ctx.newAsset({ ownerId: user.id });
    const { asset: child1 } = await ctx.newAsset({ ownerId: user.id });
    const { asset: child2 } = await ctx.newAsset({ ownerId: user.id });
    await ctx.newStack({ ownerId: user.id }, [primary.id, child1.id, child2.id]);

    await addWholeStack(ctx, sut, space.id, user.id, primary.id);

    expect(await sut.getAssetCount(space.id)).toBe(3);
    await expect(bucketCount(ctx, space.id)).resolves.toBe(1);
  });

  it('keeps the stack visible after promoting a different primary (E13)', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: user.id, faceRecognitionEnabled: false });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: user.id, role: 'owner' });
    const { asset: primary } = await ctx.newAsset({ ownerId: user.id });
    const { asset: child1 } = await ctx.newAsset({ ownerId: user.id });
    const { stack } = await ctx.newStack({ ownerId: user.id }, [primary.id, child1.id]);

    await addWholeStack(ctx, sut, space.id, user.id, primary.id);
    await ctx.get(StackRepository).update(stack.id, { id: stack.id, primaryAssetId: child1.id });

    await expect(bucketCount(ctx, space.id)).resolves.toBe(1);
  });

  it('is idempotent on re-add (E10)', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: user.id, faceRecognitionEnabled: false });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: user.id, role: 'owner' });
    const { asset: primary } = await ctx.newAsset({ ownerId: user.id });
    const { asset: child1 } = await ctx.newAsset({ ownerId: user.id });
    await ctx.newStack({ ownerId: user.id }, [primary.id, child1.id]);

    await addWholeStack(ctx, sut, space.id, user.id, primary.id);
    const secondInsert = await addWholeStack(ctx, sut, space.id, user.id, primary.id);

    expect(secondInsert).toHaveLength(0);
    expect(await sut.getAssetCount(space.id)).toBe(2);
  });
});
