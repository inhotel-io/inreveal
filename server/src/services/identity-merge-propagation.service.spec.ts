import { JobName, SharedSpaceActivityType } from 'src/enum';
import { IdentityMergePropagationService, MergeProfile } from 'src/services/identity-merge-propagation.service';

const profile = (overrides: Partial<MergeProfile> & Pick<MergeProfile, 'kind' | 'id' | 'identityId'>) =>
  ({
    type: 'person',
    name: overrides.id,
    faceCount: 1,
    ...overrides,
  }) as MergeProfile;

const makeService = (profiles: MergeProfile[]) => {
  const faceIdentityRepository = {
    ensurePersonIdentity: vi.fn((personId: string) => {
      const profile = profiles.find((profile) => profile.kind === 'person' && profile.id === personId);
      if (!profile) {
        throw new Error('Person not found');
      }

      profile.identityId ??= `identity-for-${personId}`;
      return { id: profile.identityId, type: profile.type };
    }),
    getMergePropagationProfiles: vi.fn(
      (
        input: { mode: 'profiles'; personIds: string[] } | { mode: 'identities'; identityIds: string[] },
      ): MergeProfile[] => {
        if (input.mode === 'profiles') {
          const personIds = new Set(input.personIds);
          return profiles.filter((profile) => profile.kind === 'person' && personIds.has(profile.id));
        }

        const identityIds = new Set(input.identityIds);
        return profiles.filter((profile) => profile.identityId && identityIds.has(profile.identityId));
      },
    ),
  };

  const sut = new IdentityMergePropagationService({
    databaseRepository: {} as never,
    faceIdentityRepository: faceIdentityRepository as never,
    jobRepository: {} as never,
    logger: {} as never,
    personRepository: {} as never,
    sharedSpaceRepository: {} as never,
  });

  return { sut, faceIdentityRepository };
};

describe('IdentityMergePropagationService', () => {
  describe('buildPersonalMergePlan', () => {
    it('plans personal merge propagation into duplicate space people across multiple spaces', async () => {
      const target = {
        kind: 'person',
        id: 'person-x',
        ownerId: 'owner-1',
        identityId: 'identity-x',
        type: 'person',
        name: 'X',
        faceCount: 10,
      } satisfies MergeProfile;
      const source = {
        kind: 'person',
        id: 'person-y',
        ownerId: 'owner-1',
        identityId: 'identity-y',
        type: 'person',
        name: 'Y',
        faceCount: 4,
      } satisfies MergeProfile;
      const spaceAX = {
        kind: 'space-person',
        id: 'space-a-x',
        spaceId: 'space-a',
        identityId: 'identity-x',
        type: 'person',
        name: 'X',
        faceCount: 3,
      } satisfies MergeProfile;
      const spaceAY = {
        kind: 'space-person',
        id: 'space-a-y',
        spaceId: 'space-a',
        identityId: 'identity-y',
        type: 'person',
        name: 'Y',
        faceCount: 2,
      } satisfies MergeProfile;
      const spaceBX = {
        kind: 'space-person',
        id: 'space-b-x',
        spaceId: 'space-b',
        identityId: 'identity-x',
        type: 'person',
        name: 'X',
        faceCount: 8,
      } satisfies MergeProfile;
      const spaceBY = {
        kind: 'space-person',
        id: 'space-b-y',
        spaceId: 'space-b',
        identityId: 'identity-y',
        type: 'person',
        name: 'Y',
        faceCount: 1,
      } satisfies MergeProfile;
      const { sut } = makeService([target, source, spaceAX, spaceAY, spaceBX, spaceBY]);

      const plan = await sut.buildPersonalMergePlan({
        actorUserId: 'owner-1',
        targetPersonId: 'person-x',
        sourcePersonIds: ['person-y'],
      });

      expect(plan.actorUserId).toBe('owner-1');
      expect(plan.origin).toEqual({
        type: 'person',
        targetProfileId: 'person-x',
        sourceProfileIds: ['person-y'],
        ownerId: 'owner-1',
      });
      expect(plan.targetIdentityId).toBe('identity-x');
      expect(plan.sourceIdentityIds).toEqual(['identity-y']);
      expect(plan.personalProfileMerges).toEqual([
        { ownerId: 'owner-1', targetPersonId: 'person-x', sourcePersonIds: ['person-y'] },
      ]);
      expect(plan.spaceProfileMerges).toEqual([
        { spaceId: 'space-a', targetPersonId: 'space-a-x', sourcePersonIds: ['space-a-y'] },
        { spaceId: 'space-b', targetPersonId: 'space-b-x', sourcePersonIds: ['space-b-y'] },
      ]);
      expect(plan.affectedSpaceIds).toEqual(['space-a', 'space-b']);
      expect(plan.followUpJobs).toEqual([
        { name: JobName.SharedSpacePersonMetadataBackfill, data: { identityId: 'identity-x' } },
        { name: JobName.SharedSpacePersonDedup, data: { spaceId: 'space-a' } },
        { name: JobName.SharedSpacePersonDedup, data: { spaceId: 'space-b' } },
      ]);
      expect(plan.activityEvents).toEqual([
        expect.objectContaining({ spaceId: 'space-a', userId: 'owner-1', type: SharedSpaceActivityType.PersonMerge }),
        expect.objectContaining({ spaceId: 'space-b', userId: 'owner-1', type: SharedSpaceActivityType.PersonMerge }),
      ]);
    });

    it('keeps a single affected space profile and updates it to the target identity', async () => {
      const { sut } = makeService([
        profile({ kind: 'person', id: 'person-x', ownerId: 'owner-1', identityId: 'identity-x', faceCount: 10 }),
        profile({ kind: 'person', id: 'person-y', ownerId: 'owner-1', identityId: 'identity-y', faceCount: 4 }),
        profile({ kind: 'space-person', id: 'space-a-y', spaceId: 'space-a', identityId: 'identity-y' }),
      ]);

      const plan = await sut.buildPersonalMergePlan({
        actorUserId: 'owner-1',
        targetPersonId: 'person-x',
        sourcePersonIds: ['person-y'],
      });

      expect(plan.spaceProfileMerges).toEqual([]);
      expect(plan.profileIdentityUpdates).toEqual([
        { kind: 'space-person', profileId: 'space-a-y', identityId: 'identity-x' },
      ]);
      expect(plan.affectedSpaceIds).toEqual(['space-a']);
    });

    it('uses deterministic survivor fallback outside the initiating scope', async () => {
      const { sut } = makeService([
        profile({ kind: 'person', id: 'person-x', ownerId: 'owner-1', identityId: 'identity-x', faceCount: 10 }),
        profile({ kind: 'person', id: 'person-y', ownerId: 'owner-1', identityId: 'identity-y', faceCount: 4 }),
        profile({ kind: 'person', id: 'person-z', ownerId: 'owner-1', identityId: 'identity-z', faceCount: 5 }),
        profile({ kind: 'person', id: 'owner-2-low', ownerId: 'owner-2', identityId: 'identity-y', faceCount: 1 }),
        profile({ kind: 'person', id: 'owner-2-high', ownerId: 'owner-2', identityId: 'identity-z', faceCount: 9 }),
      ]);

      const plan = await sut.buildPersonalMergePlan({
        actorUserId: 'owner-1',
        targetPersonId: 'person-x',
        sourcePersonIds: ['person-y', 'person-z'],
      });

      expect(plan.personalProfileMerges).toEqual([
        { ownerId: 'owner-1', targetPersonId: 'person-x', sourcePersonIds: ['person-z', 'person-y'] },
        { ownerId: 'owner-2', targetPersonId: 'owner-2-high', sourcePersonIds: ['owner-2-low'] },
      ]);
    });

    it('prefers named survivor candidates over unnamed candidates with equal face counts outside the initiating scope', async () => {
      const { sut } = makeService([
        profile({ kind: 'person', id: 'person-x', ownerId: 'owner-1', identityId: 'identity-x', faceCount: 10 }),
        profile({ kind: 'person', id: 'person-y', ownerId: 'owner-1', identityId: 'identity-y', faceCount: 4 }),
        profile({ kind: 'person', id: 'person-z', ownerId: 'owner-1', identityId: 'identity-z', faceCount: 4 }),
        profile({
          kind: 'person',
          id: 'owner-2-a',
          ownerId: 'owner-2',
          identityId: 'identity-y',
          name: '',
          faceCount: 5,
        }),
        profile({
          kind: 'person',
          id: 'owner-2-b',
          ownerId: 'owner-2',
          identityId: 'identity-z',
          name: 'Named candidate',
          faceCount: 5,
        }),
      ]);

      const plan = await sut.buildPersonalMergePlan({
        actorUserId: 'owner-1',
        targetPersonId: 'person-x',
        sourcePersonIds: ['person-y', 'person-z'],
      });

      expect(plan.personalProfileMerges).toEqual([
        { ownerId: 'owner-1', targetPersonId: 'person-x', sourcePersonIds: ['person-y', 'person-z'] },
        { ownerId: 'owner-2', targetPersonId: 'owner-2-b', sourcePersonIds: ['owner-2-a'] },
      ]);
    });

    it('deduplicates duplicate source ids before planning', async () => {
      const { sut, faceIdentityRepository } = makeService([
        profile({ kind: 'person', id: 'person-x', ownerId: 'owner-1', identityId: 'identity-x' }),
        profile({ kind: 'person', id: 'person-y', ownerId: 'owner-1', identityId: 'identity-y' }),
      ]);

      const plan = await sut.buildPersonalMergePlan({
        actorUserId: 'owner-1',
        targetPersonId: 'person-x',
        sourcePersonIds: ['person-y', 'person-y'],
      });

      expect(plan.origin.sourceProfileIds).toEqual(['person-y']);
      expect(plan.sourceIdentityIds).toEqual(['identity-y']);
      expect(plan.personalProfileMerges).toEqual([
        { ownerId: 'owner-1', targetPersonId: 'person-x', sourcePersonIds: ['person-y'] },
      ]);
      expect(faceIdentityRepository.ensurePersonIdentity).toHaveBeenCalledTimes(2);
    });

    it('ensures origin profiles with missing identities before planning attached profiles', async () => {
      const profiles = [
        profile({ kind: 'person', id: 'person-x', ownerId: 'owner-1', identityId: null, faceCount: 10 }),
        profile({ kind: 'person', id: 'person-y', ownerId: 'owner-1', identityId: null, faceCount: 4 }),
        profile({
          kind: 'space-person',
          id: 'space-a-y',
          spaceId: 'space-a',
          identityId: 'identity-for-person-y',
        }),
      ];
      const { sut, faceIdentityRepository } = makeService(profiles);

      const plan = await sut.buildPersonalMergePlan({
        actorUserId: 'owner-1',
        targetPersonId: 'person-x',
        sourcePersonIds: ['person-y'],
      });

      expect(faceIdentityRepository.ensurePersonIdentity.mock.calls.map(([personId]) => personId)).toEqual([
        'person-x',
        'person-y',
      ]);
      expect(faceIdentityRepository.getMergePropagationProfiles).toHaveBeenNthCalledWith(2, {
        mode: 'identities',
        identityIds: ['identity-for-person-x', 'identity-for-person-y'],
      });
      expect(plan.targetIdentityId).toBe('identity-for-person-x');
      expect(plan.sourceIdentityIds).toEqual(['identity-for-person-y']);
      expect(plan.profileIdentityUpdates).toEqual([
        { kind: 'space-person', profileId: 'space-a-y', identityId: 'identity-for-person-x' },
      ]);
    });

    it('ignores source identity ids already equal to the target identity', async () => {
      const { sut } = makeService([
        profile({ kind: 'person', id: 'person-x', ownerId: 'owner-1', identityId: 'identity-x', faceCount: 10 }),
        profile({ kind: 'person', id: 'person-y', ownerId: 'owner-1', identityId: 'identity-x', faceCount: 4 }),
        profile({ kind: 'person', id: 'person-z', ownerId: 'owner-1', identityId: 'identity-z', faceCount: 2 }),
      ]);

      const plan = await sut.buildPersonalMergePlan({
        actorUserId: 'owner-1',
        targetPersonId: 'person-x',
        sourcePersonIds: ['person-y', 'person-z'],
      });

      expect(plan.sourceIdentityIds).toEqual(['identity-z']);
      expect(plan.personalProfileMerges).toEqual([
        { ownerId: 'owner-1', targetPersonId: 'person-x', sourcePersonIds: ['person-y', 'person-z'] },
      ]);
    });

    it('rejects missing initiating target or source profiles before execution', async () => {
      const { sut } = makeService([
        profile({ kind: 'person', id: 'person-x', ownerId: 'owner-1', identityId: 'identity-x' }),
      ]);

      await expect(
        sut.buildPersonalMergePlan({
          actorUserId: 'owner-1',
          targetPersonId: 'person-x',
          sourcePersonIds: ['person-y'],
        }),
      ).rejects.toThrow('Source person not found');
    });

    it('rejects mixed person and pet identities before execution', async () => {
      const { sut } = makeService([
        profile({ kind: 'person', id: 'person-x', ownerId: 'owner-1', identityId: 'identity-x', type: 'person' }),
        profile({ kind: 'person', id: 'person-y', ownerId: 'owner-1', identityId: 'identity-y', type: 'pet' }),
      ]);

      await expect(
        sut.buildPersonalMergePlan({
          actorUserId: 'owner-1',
          targetPersonId: 'person-x',
          sourcePersonIds: ['person-y'],
        }),
      ).rejects.toThrow('Cannot merge people of different types');
    });

    it('includes actor, follow-up jobs, and propagated activity events in the plan', async () => {
      const { sut } = makeService([
        profile({ kind: 'person', id: 'person-x', ownerId: 'owner-1', identityId: 'identity-x', faceCount: 10 }),
        profile({ kind: 'person', id: 'person-y', ownerId: 'owner-1', identityId: 'identity-y', faceCount: 4 }),
        profile({ kind: 'space-person', id: 'space-a-y', spaceId: 'space-a', identityId: 'identity-y' }),
      ]);

      const plan = await sut.buildPersonalMergePlan({
        actorUserId: 'owner-1',
        targetPersonId: 'person-x',
        sourcePersonIds: ['person-y'],
      });

      expect(plan.actorUserId).toBe('owner-1');
      expect(plan.followUpJobs).toEqual([
        { name: JobName.SharedSpacePersonMetadataBackfill, data: { identityId: 'identity-x' } },
        { name: JobName.SharedSpacePersonDedup, data: { spaceId: 'space-a' } },
      ]);
      expect(plan.activityEvents).toEqual([
        {
          spaceId: 'space-a',
          userId: 'owner-1',
          type: SharedSpaceActivityType.PersonMerge,
          data: {
            originScope: 'person',
            actorUserId: 'owner-1',
            activityRole: 'propagated',
            originatingSpaceId: null,
            targetProfileId: 'person-x',
            sourceProfileIds: ['person-y'],
            targetIdentityId: 'identity-x',
            sourceIdentityIds: ['identity-y'],
            affectedPersonalProfileMergeCount: 1,
            affectedSharedSpaceProfileMergeCount: 0,
            affectedSpaceIds: ['space-a'],
          },
        },
      ]);
    });
  });
});
