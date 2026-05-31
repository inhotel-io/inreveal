import { Kysely } from 'kysely';
import { FaceRepairRepository } from 'src/repositories/face-repair.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { PersonRepository } from 'src/repositories/person.repository';
import { SearchRepository } from 'src/repositories/search.repository';
import { DB } from 'src/schema';
import { FaceRepairService, FlaggedFace, ReattributionCandidate } from 'src/services/face-repair.service';
import { newMediumService } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

let defaultDatabase: Kysely<DB>;

// Two clusters on disjoint embedding axes are maximally dissimilar (cosine distance ~1.0), standing in
// for two genuinely different people. newEmbedding() can't be used here: its all-positive random
// components leave two independent vectors ~0.75 similar.
const axisEmbedding = (axis: 'first' | 'second') => {
  const values = Array.from({ length: 512 }, (_, index) => {
    const inFirstHalf = index < 256;
    return (axis === 'first' ? inFirstHalf : !inFirstHalf) ? 1 : 0;
  });
  return '[' + values.join(',') + ']';
};

// A "relative" embedding that is close but not identical to axisEmbedding('first'):
// 140 ones in [0,139] (first half overlap) + 116 ones in [256,371] (second half).
// Both vectors have 256 ones, so |A|=|B|=sqrt(256).
// dot product = 140 → cos_sim = 140/256 ≈ 0.547 → cos_distance ≈ 0.453.
// 0.453 is beyond the floor (0.35) but within maxDistance (0.6) — close neighbors, not identical.
const relativeAxisEmbedding = () => {
  const values = Array.from({ length: 512 }, (_, i) => (i < 140 || (i >= 256 && i < 372) ? 1 : 0));
  return '[' + values.join(',') + ']';
};

const setup = (db?: Kysely<DB>) => {
  return newMediumService(FaceRepairService, {
    database: db || defaultDatabase,
    real: [FaceRepairRepository, SearchRepository, PersonRepository],
    mock: [LoggingRepository],
  });
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

const buildCluster = async (
  ctx: ReturnType<typeof setup>['ctx'],
  ownerId: string,
  embedding: string,
  faceCount: number,
) => {
  const { person } = await ctx.newPerson({ ownerId });
  const faceIds: string[] = [];
  for (let index = 0; index < faceCount; index++) {
    const { asset } = await ctx.newAsset({ ownerId });
    const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: person.id });
    await ctx.database.insertInto('face_search').values({ faceId: assetFace.id, embedding }).execute();
    faceIds.push(assetFace.id);
  }
  return { person, faceIds };
};

describe('FaceRepairService.findReattributionCandidates', () => {
  it('reports leaked faces with topOtherPersonId pointing to the true owner', async () => {
    const { sut, ctx } = setup();
    const { user } = await ctx.newUser();

    // Karina-main: many faces on 'first' axis
    const { person: karina, faceIds: karinaFaceIds } = await buildCluster(ctx, user.id, axisEmbedding('first'), 10);

    // Alexia: a few leaked 'first'-axis faces wrongly assigned to her
    const { person: alexia } = await ctx.newPerson({ ownerId: user.id });
    const leakedFaceIds: string[] = [];
    for (let index = 0; index < 3; index++) {
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: alexia.id });
      await ctx.database
        .insertInto('face_search')
        .values({ faceId: assetFace.id, embedding: axisEmbedding('first') })
        .execute();
      leakedFaceIds.push(assetFace.id);
    }

    const candidates: ReattributionCandidate[] = [];
    for await (const c of sut.findReattributionCandidates({ ownerId: user.id, maxDistance: 0.6, voteWindow: 50 })) {
      candidates.push(c);
    }

    // Each leaked face (on Alexia) should report Karina as topOtherPersonId
    for (const leakedId of leakedFaceIds) {
      const candidate = candidates.find((c) => c.assetFaceId === leakedId);
      expect(candidate).toBeDefined();
      expect(candidate!.currentPersonId).toBe(alexia.id);
      expect(candidate!.topOtherPersonId).toBe(karina.id);
      expect(candidate!.topOtherCount).toBeGreaterThan(0);
    }

    // Clean Karina faces: Karina's own neighbors dominate (10 own, 3 leaked Alexia)
    const karinaCandidate = candidates.find((c) => c.assetFaceId === karinaFaceIds[0]);
    expect(karinaCandidate).toBeDefined();
    // Karina's own count must be strictly greater than any rival (own-person dominates)
    expect(karinaCandidate!.ownCount).toBeGreaterThan(karinaCandidate!.topOtherCount);
  });

  it('excludes self from neighbors (single-face person has ownCount === 0)', async () => {
    const { sut, ctx } = setup();
    const { user } = await ctx.newUser();

    // A single isolated face on 'second' axis — no neighbors in range
    const { person: isolated } = await ctx.newPerson({ ownerId: user.id });
    const { asset } = await ctx.newAsset({ ownerId: user.id });
    const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: isolated.id });
    await ctx.database
      .insertInto('face_search')
      .values({ faceId: assetFace.id, embedding: axisEmbedding('second') })
      .execute();

    const candidates: ReattributionCandidate[] = [];
    for await (const c of sut.findReattributionCandidates({ ownerId: user.id, maxDistance: 0.6, voteWindow: 50 })) {
      candidates.push(c);
    }

    const candidate = candidates.find((c) => c.assetFaceId === assetFace.id);
    expect(candidate).toBeDefined();
    // Self excluded: no neighbors → ownCount = 0, topOtherPersonId = null
    expect(candidate!.ownCount).toBe(0);
    expect(candidate!.topOtherPersonId).toBeNull();
  });

  it('does not report cross-owner neighbors as topOther', async () => {
    const { sut, ctx } = setup();
    const { user: ownerA } = await ctx.newUser();
    const { user: ownerB } = await ctx.newUser();

    // Owner A has one face on 'first' axis
    const { person: personA } = await ctx.newPerson({ ownerId: ownerA.id });
    const { asset: assetA } = await ctx.newAsset({ ownerId: ownerA.id });
    const { assetFace: faceA } = await ctx.newAssetFace({ assetId: assetA.id, personId: personA.id });
    await ctx.database
      .insertInto('face_search')
      .values({ faceId: faceA.id, embedding: axisEmbedding('first') })
      .execute();

    // Owner B has many faces on 'first' axis (identical embedding — maximally close)
    await buildCluster(ctx, ownerB.id, axisEmbedding('first'), 10);

    const candidates: ReattributionCandidate[] = [];
    for await (const c of sut.findReattributionCandidates({ ownerId: ownerA.id, maxDistance: 0.6, voteWindow: 50 })) {
      candidates.push(c);
    }

    // Owner A's face should not see owner B's person as topOther (cross-owner)
    const candidateA = candidates.find((c) => c.assetFaceId === faceA.id);
    expect(candidateA).toBeDefined();
    expect(candidateA!.topOtherPersonId).toBeNull();
  });
});

// Shared params for all findFlaggedFaces tests — maxAttributionDistance floor at 0.35, so
// relativeAxisEmbedding (~0.453 away from 'first') is beyond the floor and won't trigger it.
const flagParams = { maxDistance: 0.6, voteWindow: 50, minFaces: 3, voteMargin: 2, maxAttributionDistance: 0.35 };

describe('FaceRepairService.findFlaggedFaces', () => {
  it('co-located mass leak: flags ALL leaked faces (the regression case)', async () => {
    const { sut, ctx } = setup();
    const { user } = await ctx.newUser();

    // Karina-main: 10 faces with axisEmbedding('first')
    const { person: karina } = await buildCluster(ctx, user.id, axisEmbedding('first'), 10);

    // Alexia: 5 leaked faces with identical axisEmbedding('first') — co-located contamination
    const { person: alexia } = await ctx.newPerson({ ownerId: user.id });
    const leakedFaceIds: string[] = [];
    for (let index = 0; index < 5; index++) {
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: alexia.id });
      await ctx.database
        .insertInto('face_search')
        .values({ faceId: assetFace.id, embedding: axisEmbedding('first') })
        .execute();
      leakedFaceIds.push(assetFace.id);
    }

    const flagged: FlaggedFace[] = [];
    for await (const f of sut.findFlaggedFaces({ ownerId: user.id, ...flagParams })) {
      flagged.push(f);
    }

    // All 5 leaked faces must be flagged pointing to karina — the absolute floor (Karina nearest ~0) beats
    // the 0.35 threshold regardless of ownNearest; the relative guard that suppressed these is NOT used.
    const leakedFlagged = flagged.filter((f) => leakedFaceIds.includes(f.assetFaceId));
    expect(leakedFlagged).toHaveLength(5);
    for (const f of leakedFlagged) {
      expect(f.currentPersonId).toBe(alexia.id);
      expect(f.suspectedOwnerId).toBe(karina.id);
    }
  });

  it('floor family guard: similar-but-beyond-floor people are not cross-flagged', async () => {
    const { sut, ctx } = setup();
    const { user } = await ctx.newUser();

    // personA: 4 faces on axisEmbedding('first')
    const { person: _personA, faceIds: aFaceIds } = await buildCluster(ctx, user.id, axisEmbedding('first'), 4);
    // personB: 12 faces on relativeAxisEmbedding (~0.453 from 'first' — beyond floor 0.35)
    const { person: _personB, faceIds: bFaceIds } = await buildCluster(ctx, user.id, relativeAxisEmbedding(), 12);

    const flagged: FlaggedFace[] = [];
    for await (const f of sut.findFlaggedFaces({ ownerId: user.id, ...flagParams })) {
      flagged.push(f);
    }

    // B out-votes A in terms of count, but B's nearest to any A face is ~0.453 > 0.35 floor → no A face flags
    const aFlagged = flagged.filter((f) => aFaceIds.includes(f.assetFaceId));
    expect(aFlagged).toHaveLength(0);

    // A is even farther from B (same distance), and A has fewer votes → no B face flags either
    const bFlagged = flagged.filter((f) => bFaceIds.includes(f.assetFaceId));
    expect(bFlagged).toHaveLength(0);
  });

  it('clean cluster: lone unrelated person is not flagged', async () => {
    const { sut, ctx } = setup();
    const { user } = await ctx.newUser();

    const { faceIds: loneFaceIds } = await buildCluster(ctx, user.id, axisEmbedding('second'), 5);

    const flagged: FlaggedFace[] = [];
    for await (const f of sut.findFlaggedFaces({ ownerId: user.id, ...flagParams })) {
      flagged.push(f);
    }

    const loneFlagged = flagged.filter((f) => loneFaceIds.includes(f.assetFaceId));
    expect(loneFlagged).toHaveLength(0);
  });
});
