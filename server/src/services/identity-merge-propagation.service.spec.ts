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
  const transaction = { transaction: true };
  const databaseRepository = {
    transaction: vi.fn((callback: (db: typeof transaction) => Promise<unknown>) => callback(transaction)),
  };
  const personRepository = {
    mergePersonProfile: vi.fn().mockResolvedValue({ deletedThumbnailPath: null }),
    updatePersonIdentity: vi.fn().mockResolvedValue(void 0),
  };
  const faceIdentityRepository = {
    ensurePersonIdentity: vi.fn((personId: string) => {
      const profile = profiles.find((profile) => profile.kind === 'person' && profile.id === personId);
      if (!profile) {
        throw new Error('Person not found');
      }

      profile.identityId ??= `identity-for-${personId}`;
      return { id: profile.identityId, type: profile.type };
    }),
    ensureSpacePersonIdentity: vi.fn((personId: string) => {
      const profile = profiles.find((profile) => profile.kind === 'space-person' && profile.id === personId);
      if (!profile) {
        throw new Error('Space person not found');
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
    linkPersonFaces: vi.fn().mockResolvedValue(void 0),
    mergeIdentitiesAfterProfileResolution: vi.fn().mockResolvedValue(void 0),
  };
  const jobRepository = {
    queue: vi.fn().mockResolvedValue(void 0),
  };
  const sharedSpaceRepository = {
    getPersonById: vi.fn((personId: string) => {
      const person = profiles.find((profile) => profile.kind === 'space-person' && profile.id === personId);
      return person
        ? {
            id: person.id,
            spaceId: person.spaceId,
            identityId: person.identityId,
            type: person.type,
            name: person.name,
            faceCount: person.faceCount,
          }
        : undefined;
    }),
    mergeSpacePersonProfile: vi.fn().mockResolvedValue(void 0),
    updateSpacePersonIdentity: vi.fn().mockResolvedValue(void 0),
    logActivity: vi.fn().mockResolvedValue(void 0),
  };

  const sut = new IdentityMergePropagationService({
    databaseRepository: databaseRepository as never,
    faceIdentityRepository: faceIdentityRepository as never,
    jobRepository: jobRepository as never,
    logger: {} as never,
    personRepository: personRepository as never,
    sharedSpaceRepository: sharedSpaceRepository as never,
  });

  return {
    sut,
    mocks: {
      database: databaseRepository,
      faceIdentity: faceIdentityRepository,
      job: jobRepository,
      person: personRepository,
      sharedSpace: sharedSpaceRepository,
    },
    transaction,
    faceIdentityRepository,
  };
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

  describe('buildSpaceMergePlan', () => {
    it('plans initiating-space merge and personal profile merges for affected owners', async () => {
      const { sut } = makeService([
        profile({ kind: 'space-person', id: 'space-a-x', spaceId: 'space-a', identityId: 'identity-x', faceCount: 10 }),
        profile({ kind: 'space-person', id: 'space-a-y', spaceId: 'space-a', identityId: 'identity-y', faceCount: 4 }),
        profile({ kind: 'person', id: 'owner-1-x', ownerId: 'owner-1', identityId: 'identity-x', faceCount: 8 }),
        profile({ kind: 'person', id: 'owner-1-y', ownerId: 'owner-1', identityId: 'identity-y', faceCount: 2 }),
      ]);

      const plan = await sut.buildSpaceMergePlan({
        actorUserId: 'editor-1',
        spaceId: 'space-a',
        targetPersonId: 'space-a-x',
        sourcePersonIds: ['space-a-y'],
      });

      expect(plan.origin).toEqual({
        type: 'space-person',
        targetProfileId: 'space-a-x',
        sourceProfileIds: ['space-a-y'],
        spaceId: 'space-a',
      });
      expect(plan.targetIdentityId).toBe('identity-x');
      expect(plan.sourceIdentityIds).toEqual(['identity-y']);
      expect(plan.spaceProfileMerges).toEqual([
        { spaceId: 'space-a', targetPersonId: 'space-a-x', sourcePersonIds: ['space-a-y'] },
      ]);
      expect(plan.personalProfileMerges).toEqual([
        { ownerId: 'owner-1', targetPersonId: 'owner-1-x', sourcePersonIds: ['owner-1-y'] },
      ]);
      expect(plan.affectedOwnerIds).toEqual(['owner-1']);
      expect(plan.affectedSpaceIds).toEqual(['space-a']);
    });

    it('plans identity updates for owners with only one affected personal profile', async () => {
      const { sut } = makeService([
        profile({ kind: 'space-person', id: 'space-a-x', spaceId: 'space-a', identityId: 'identity-x', faceCount: 10 }),
        profile({ kind: 'space-person', id: 'space-a-y', spaceId: 'space-a', identityId: 'identity-y', faceCount: 4 }),
        profile({ kind: 'person', id: 'owner-2-y', ownerId: 'owner-2', identityId: 'identity-y', faceCount: 2 }),
      ]);

      const plan = await sut.buildSpaceMergePlan({
        actorUserId: 'editor-1',
        spaceId: 'space-a',
        targetPersonId: 'space-a-x',
        sourcePersonIds: ['space-a-y'],
      });

      expect(plan.personalProfileMerges).toEqual([]);
      expect(plan.profileIdentityUpdates).toContainEqual({
        kind: 'person',
        profileId: 'owner-2-y',
        identityId: 'identity-x',
      });
      expect(plan.affectedOwnerIds).toEqual(['owner-2']);
    });

    it('includes initiating-space activity and propagated activity for other affected spaces', async () => {
      const { sut } = makeService([
        profile({ kind: 'space-person', id: 'space-a-x', spaceId: 'space-a', identityId: 'identity-x', faceCount: 10 }),
        profile({ kind: 'space-person', id: 'space-a-y', spaceId: 'space-a', identityId: 'identity-y', faceCount: 4 }),
        profile({ kind: 'space-person', id: 'space-b-x', spaceId: 'space-b', identityId: 'identity-x', faceCount: 8 }),
        profile({ kind: 'space-person', id: 'space-b-y', spaceId: 'space-b', identityId: 'identity-y', faceCount: 1 }),
      ]);

      const plan = await sut.buildSpaceMergePlan({
        actorUserId: 'editor-1',
        spaceId: 'space-a',
        targetPersonId: 'space-a-x',
        sourcePersonIds: ['space-a-y'],
      });

      expect(plan.spaceProfileMerges).toEqual([
        { spaceId: 'space-a', targetPersonId: 'space-a-x', sourcePersonIds: ['space-a-y'] },
        { spaceId: 'space-b', targetPersonId: 'space-b-x', sourcePersonIds: ['space-b-y'] },
      ]);
      expect(plan.followUpJobs).toEqual([
        { name: JobName.SharedSpacePersonMetadataBackfill, data: { identityId: 'identity-x' } },
        { name: JobName.SharedSpacePersonDedup, data: { spaceId: 'space-a' } },
        { name: JobName.SharedSpacePersonDedup, data: { spaceId: 'space-b' } },
      ]);
      expect(plan.activityEvents).toEqual([
        expect.objectContaining({
          spaceId: 'space-a',
          data: expect.objectContaining({ originScope: 'space-person', activityRole: 'initiating' }),
        }),
        expect.objectContaining({
          spaceId: 'space-b',
          data: expect.objectContaining({ originScope: 'space-person', activityRole: 'propagated' }),
        }),
      ]);
    });

    it('plans propagated merges in every other space with duplicate profiles', async () => {
      const { sut } = makeService([
        profile({ kind: 'space-person', id: 'space-a-x', spaceId: 'space-a', identityId: 'identity-x', faceCount: 10 }),
        profile({ kind: 'space-person', id: 'space-a-y', spaceId: 'space-a', identityId: 'identity-y', faceCount: 4 }),
        profile({ kind: 'space-person', id: 'space-b-x', spaceId: 'space-b', identityId: 'identity-x', faceCount: 8 }),
        profile({ kind: 'space-person', id: 'space-b-y', spaceId: 'space-b', identityId: 'identity-y', faceCount: 1 }),
        profile({ kind: 'space-person', id: 'space-c-y', spaceId: 'space-c', identityId: 'identity-y', faceCount: 2 }),
      ]);

      const plan = await sut.buildSpaceMergePlan({
        actorUserId: 'editor-1',
        spaceId: 'space-a',
        targetPersonId: 'space-a-x',
        sourcePersonIds: ['space-a-y'],
      });

      expect(plan.spaceProfileMerges).toEqual([
        { spaceId: 'space-a', targetPersonId: 'space-a-x', sourcePersonIds: ['space-a-y'] },
        { spaceId: 'space-b', targetPersonId: 'space-b-x', sourcePersonIds: ['space-b-y'] },
      ]);
      expect(plan.profileIdentityUpdates).toContainEqual({
        kind: 'space-person',
        profileId: 'space-c-y',
        identityId: 'identity-x',
      });
      expect(plan.affectedSpaceIds).toEqual(['space-a', 'space-b', 'space-c']);
      expect(plan.followUpJobs).toEqual([
        { name: JobName.SharedSpacePersonMetadataBackfill, data: { identityId: 'identity-x' } },
        { name: JobName.SharedSpacePersonDedup, data: { spaceId: 'space-a' } },
        { name: JobName.SharedSpacePersonDedup, data: { spaceId: 'space-b' } },
        { name: JobName.SharedSpacePersonDedup, data: { spaceId: 'space-c' } },
      ]);
    });

    it('keeps other-space single profiles and updates identity only', async () => {
      const { sut } = makeService([
        profile({ kind: 'space-person', id: 'space-a-x', spaceId: 'space-a', identityId: 'identity-x', faceCount: 10 }),
        profile({ kind: 'space-person', id: 'space-a-y', spaceId: 'space-a', identityId: 'identity-y', faceCount: 4 }),
        profile({ kind: 'space-person', id: 'space-c-y', spaceId: 'space-c', identityId: 'identity-y', faceCount: 2 }),
      ]);

      const plan = await sut.buildSpaceMergePlan({
        actorUserId: 'editor-1',
        spaceId: 'space-a',
        targetPersonId: 'space-a-x',
        sourcePersonIds: ['space-a-y'],
      });

      expect(plan.spaceProfileMerges).toEqual([
        { spaceId: 'space-a', targetPersonId: 'space-a-x', sourcePersonIds: ['space-a-y'] },
      ]);
      expect(plan.profileIdentityUpdates.filter((update) => update.kind === 'space-person')).toEqual([
        { kind: 'space-person', profileId: 'space-c-y', identityId: 'identity-x' },
      ]);
      expect(plan.affectedSpaceIds).toEqual(['space-a', 'space-c']);
    });

    it('deduplicates affected space ids for jobs and activity', async () => {
      const { sut } = makeService([
        profile({ kind: 'space-person', id: 'space-a-x', spaceId: 'space-a', identityId: 'identity-x', faceCount: 10 }),
        profile({ kind: 'space-person', id: 'space-a-y', spaceId: 'space-a', identityId: 'identity-y', faceCount: 4 }),
        profile({ kind: 'space-person', id: 'space-a-z', spaceId: 'space-a', identityId: 'identity-z', faceCount: 2 }),
        profile({ kind: 'space-person', id: 'space-b-x', spaceId: 'space-b', identityId: 'identity-x', faceCount: 8 }),
        profile({ kind: 'space-person', id: 'space-b-y', spaceId: 'space-b', identityId: 'identity-y', faceCount: 1 }),
        profile({ kind: 'space-person', id: 'space-b-z', spaceId: 'space-b', identityId: 'identity-z', faceCount: 3 }),
        profile({ kind: 'space-person', id: 'space-c-y', spaceId: 'space-c', identityId: 'identity-y', faceCount: 2 }),
      ]);

      const plan = await sut.buildSpaceMergePlan({
        actorUserId: 'editor-1',
        spaceId: 'space-a',
        targetPersonId: 'space-a-x',
        sourcePersonIds: ['space-a-y', 'space-a-y', 'space-a-z'],
      });

      expect(plan.origin.sourceProfileIds).toEqual(['space-a-y', 'space-a-z']);
      expect(plan.sourceIdentityIds).toEqual(['identity-y', 'identity-z']);
      expect(plan.affectedSpaceIds).toEqual(['space-a', 'space-b', 'space-c']);
      expect(plan.followUpJobs).toEqual([
        { name: JobName.SharedSpacePersonMetadataBackfill, data: { identityId: 'identity-x' } },
        { name: JobName.SharedSpacePersonDedup, data: { spaceId: 'space-a' } },
        { name: JobName.SharedSpacePersonDedup, data: { spaceId: 'space-b' } },
        { name: JobName.SharedSpacePersonDedup, data: { spaceId: 'space-c' } },
      ]);
      expect(plan.activityEvents.map((event) => event.spaceId)).toEqual(['space-a', 'space-b', 'space-c']);
    });

    it('plans personal propagation and other-space activity without requiring actor membership in other scopes', async () => {
      const { sut, mocks } = makeService([
        profile({ kind: 'space-person', id: 'space-a-x', spaceId: 'space-a', identityId: 'identity-x', faceCount: 10 }),
        profile({ kind: 'space-person', id: 'space-a-y', spaceId: 'space-a', identityId: 'identity-y', faceCount: 4 }),
        profile({ kind: 'person', id: 'owner-2-x', ownerId: 'owner-2', identityId: 'identity-x', faceCount: 5 }),
        profile({ kind: 'person', id: 'owner-2-y', ownerId: 'owner-2', identityId: 'identity-y', faceCount: 3 }),
        profile({ kind: 'space-person', id: 'space-b-x', spaceId: 'space-b', identityId: 'identity-x', faceCount: 6 }),
        profile({ kind: 'space-person', id: 'space-b-y', spaceId: 'space-b', identityId: 'identity-y', faceCount: 1 }),
      ]);

      const plan = await sut.buildSpaceMergePlan({
        actorUserId: 'editor-1',
        spaceId: 'space-a',
        targetPersonId: 'space-a-x',
        sourcePersonIds: ['space-a-y'],
      });

      expect(mocks.sharedSpace.getPersonById.mock.calls.map(([personId]) => personId)).toEqual([
        'space-a-x',
        'space-a-y',
      ]);
      expect(plan.personalProfileMerges).toContainEqual({
        ownerId: 'owner-2',
        targetPersonId: 'owner-2-x',
        sourcePersonIds: ['owner-2-y'],
      });
      expect(plan.spaceProfileMerges).toEqual([
        { spaceId: 'space-a', targetPersonId: 'space-a-x', sourcePersonIds: ['space-a-y'] },
        { spaceId: 'space-b', targetPersonId: 'space-b-x', sourcePersonIds: ['space-b-y'] },
      ]);
      expect(plan.activityEvents.map((event) => event.spaceId)).toEqual(['space-a', 'space-b']);
    });

    it('plans singleton identity updates for other spaces', async () => {
      const { sut } = makeService([
        profile({ kind: 'space-person', id: 'space-a-x', spaceId: 'space-a', identityId: 'identity-x', faceCount: 10 }),
        profile({ kind: 'space-person', id: 'space-a-y', spaceId: 'space-a', identityId: 'identity-y', faceCount: 4 }),
        profile({ kind: 'space-person', id: 'space-b-y', spaceId: 'space-b', identityId: 'identity-y', faceCount: 1 }),
      ]);

      const plan = await sut.buildSpaceMergePlan({
        actorUserId: 'editor-1',
        spaceId: 'space-a',
        targetPersonId: 'space-a-x',
        sourcePersonIds: ['space-a-y'],
      });

      expect(plan.profileIdentityUpdates.filter((update) => update.kind === 'space-person')).toEqual([
        { kind: 'space-person', profileId: 'space-b-y', identityId: 'identity-x' },
      ]);
      expect(plan.activityEvents.map((event) => event.spaceId)).toEqual(['space-a', 'space-b']);
    });
  });

  describe('executePlan for personal-origin propagation', () => {
    it('merges personal profiles before collapsing identities', async () => {
      const { sut, mocks } = makeService([]);

      await sut.executePlan(
        {
          actorUserId: 'owner-1',
          origin: {
            type: 'person',
            targetProfileId: 'person-x',
            sourceProfileIds: ['person-y'],
            ownerId: 'owner-1',
          },
          targetIdentityId: 'identity-x',
          sourceIdentityIds: ['identity-y'],
          personalProfileMerges: [{ ownerId: 'owner-1', targetPersonId: 'person-x', sourcePersonIds: ['person-y'] }],
          spaceProfileMerges: [],
          profileIdentityUpdates: [],
          affectedOwnerIds: ['owner-1'],
          affectedSpaceIds: [],
          followUpJobs: [],
          activityEvents: [],
        },
        { actorUserId: 'owner-1' },
      );

      expect(mocks.person.mergePersonProfile).toHaveBeenCalledWith(
        { sourcePersonId: 'person-y', targetPersonId: 'person-x', targetIdentityId: 'identity-x' },
        expect.anything(),
      );
      expect(mocks.person.mergePersonProfile.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.faceIdentity.mergeIdentitiesAfterProfileResolution.mock.invocationCallOrder[0],
      );
      expect(mocks.faceIdentity.mergeIdentitiesAfterProfileResolution).toHaveBeenCalledWith(
        { targetIdentityId: 'identity-x', sourceIdentityIds: ['identity-y'], source: 'manual' },
        expect.anything(),
      );
    });

    it('links moved personal faces to the target identity with manual source before collapsing identities', async () => {
      const { sut, mocks } = makeService([]);

      await sut.executePlan(
        {
          actorUserId: 'owner-1',
          origin: {
            type: 'person',
            targetProfileId: 'person-x',
            sourceProfileIds: ['person-y'],
            ownerId: 'owner-1',
          },
          targetIdentityId: 'identity-x',
          sourceIdentityIds: ['identity-y'],
          personalProfileMerges: [{ ownerId: 'owner-1', targetPersonId: 'person-x', sourcePersonIds: ['person-y'] }],
          spaceProfileMerges: [],
          profileIdentityUpdates: [],
          affectedOwnerIds: ['owner-1'],
          affectedSpaceIds: [],
          followUpJobs: [],
          activityEvents: [],
        },
        { actorUserId: 'owner-1' },
      );

      expect(mocks.faceIdentity.linkPersonFaces).toHaveBeenCalledWith(
        { personId: 'person-x', identityId: 'identity-x', source: 'manual' },
        expect.anything(),
      );
      expect(mocks.faceIdentity.linkPersonFaces.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.faceIdentity.mergeIdentitiesAfterProfileResolution.mock.invocationCallOrder[0],
      );
    });

    it('merges duplicate space profiles before collapsing identities', async () => {
      const { sut, mocks } = makeService([]);

      await sut.executePlan(
        {
          actorUserId: 'owner-1',
          origin: {
            type: 'person',
            targetProfileId: 'person-x',
            sourceProfileIds: ['person-y'],
            ownerId: 'owner-1',
          },
          targetIdentityId: 'identity-x',
          sourceIdentityIds: ['identity-y'],
          personalProfileMerges: [],
          spaceProfileMerges: [{ spaceId: 'space-a', targetPersonId: 'space-a-x', sourcePersonIds: ['space-a-y'] }],
          profileIdentityUpdates: [],
          affectedOwnerIds: [],
          affectedSpaceIds: ['space-a'],
          followUpJobs: [],
          activityEvents: [],
        },
        { actorUserId: 'owner-1' },
      );

      expect(mocks.sharedSpace.mergeSpacePersonProfile).toHaveBeenCalledWith(
        { sourcePersonId: 'space-a-y', targetPersonId: 'space-a-x' },
        expect.anything(),
      );
      expect(mocks.sharedSpace.mergeSpacePersonProfile.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.faceIdentity.mergeIdentitiesAfterProfileResolution.mock.invocationCallOrder[0],
      );
    });

    it('updates single affected profiles to the target identity without deleting them', async () => {
      const { sut, mocks } = makeService([]);

      await sut.executePlan(
        {
          actorUserId: 'owner-1',
          origin: {
            type: 'person',
            targetProfileId: 'person-x',
            sourceProfileIds: ['person-y'],
            ownerId: 'owner-1',
          },
          targetIdentityId: 'identity-x',
          sourceIdentityIds: ['identity-y'],
          personalProfileMerges: [],
          spaceProfileMerges: [],
          profileIdentityUpdates: [
            { kind: 'person', profileId: 'person-z', identityId: 'identity-x' },
            { kind: 'space-person', profileId: 'space-a-y', identityId: 'identity-x' },
          ],
          affectedOwnerIds: ['owner-2'],
          affectedSpaceIds: ['space-a'],
          followUpJobs: [],
          activityEvents: [],
        },
        { actorUserId: 'owner-1' },
      );

      expect(mocks.person.updatePersonIdentity).toHaveBeenCalledWith(
        { personId: 'person-z', identityId: 'identity-x' },
        expect.anything(),
      );
      expect(mocks.sharedSpace.updateSpacePersonIdentity).toHaveBeenCalledWith(
        { personId: 'space-a-y', identityId: 'identity-x' },
        expect.anything(),
      );
      expect(mocks.person.mergePersonProfile).not.toHaveBeenCalled();
      expect(mocks.sharedSpace.mergeSpacePersonProfile).not.toHaveBeenCalled();
    });

    it('queues metadata backfill and shared-space dedup for affected spaces once', async () => {
      const { sut, mocks } = makeService([]);

      await sut.executePlan(
        {
          actorUserId: 'owner-1',
          origin: {
            type: 'person',
            targetProfileId: 'person-x',
            sourceProfileIds: ['person-y'],
            ownerId: 'owner-1',
          },
          targetIdentityId: 'identity-x',
          sourceIdentityIds: ['identity-y'],
          personalProfileMerges: [],
          spaceProfileMerges: [],
          profileIdentityUpdates: [],
          affectedOwnerIds: [],
          affectedSpaceIds: ['space-a', 'space-b'],
          followUpJobs: [
            { name: JobName.SharedSpacePersonMetadataBackfill, data: { identityId: 'identity-x' } },
            { name: JobName.SharedSpacePersonDedup, data: { spaceId: 'space-a' } },
            { name: JobName.SharedSpacePersonDedup, data: { spaceId: 'space-a' } },
            { name: JobName.SharedSpacePersonDedup, data: { spaceId: 'space-b' } },
          ],
          activityEvents: [],
        },
        { actorUserId: 'owner-1' },
      );

      expect(mocks.job.queue).toHaveBeenCalledTimes(3);
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.SharedSpacePersonMetadataBackfill,
        data: { identityId: 'identity-x' },
      });
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.SharedSpacePersonDedup,
        data: { spaceId: 'space-a' },
      });
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.SharedSpacePersonDedup,
        data: { spaceId: 'space-b' },
      });
    });

    it('runs DB mutations inside one transaction and passes the transaction to every mutation helper', async () => {
      const { sut, mocks, transaction } = makeService([]);

      await sut.executePlan(
        {
          actorUserId: 'owner-1',
          origin: {
            type: 'person',
            targetProfileId: 'person-x',
            sourceProfileIds: ['person-y'],
            ownerId: 'owner-1',
          },
          targetIdentityId: 'identity-x',
          sourceIdentityIds: ['identity-y'],
          personalProfileMerges: [{ ownerId: 'owner-1', targetPersonId: 'person-x', sourcePersonIds: ['person-y'] }],
          spaceProfileMerges: [{ spaceId: 'space-a', targetPersonId: 'space-a-x', sourcePersonIds: ['space-a-y'] }],
          profileIdentityUpdates: [
            { kind: 'person', profileId: 'person-z', identityId: 'identity-x' },
            { kind: 'space-person', profileId: 'space-a-z', identityId: 'identity-x' },
          ],
          affectedOwnerIds: ['owner-1'],
          affectedSpaceIds: ['space-a'],
          followUpJobs: [],
          activityEvents: [
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
                affectedSharedSpaceProfileMergeCount: 1,
                affectedSpaceIds: ['space-a'],
              },
            },
          ],
        },
        { actorUserId: 'owner-1' },
      );

      expect(mocks.database.transaction).toHaveBeenCalledTimes(1);
      expect(mocks.person.mergePersonProfile).toHaveBeenCalledWith(expect.anything(), transaction);
      expect(mocks.faceIdentity.linkPersonFaces).toHaveBeenCalledWith(expect.anything(), transaction);
      expect(mocks.sharedSpace.mergeSpacePersonProfile).toHaveBeenCalledWith(expect.anything(), transaction);
      expect(mocks.person.updatePersonIdentity).toHaveBeenCalledWith(expect.anything(), transaction);
      expect(mocks.sharedSpace.updateSpacePersonIdentity).toHaveBeenCalledWith(expect.anything(), transaction);
      expect(mocks.faceIdentity.mergeIdentitiesAfterProfileResolution).toHaveBeenCalledWith(
        expect.anything(),
        transaction,
      );
      expect(mocks.sharedSpace.logActivity).toHaveBeenCalledWith(expect.anything(), transaction);
    });

    it('does not queue follow-up jobs when identity collapse fails', async () => {
      const { sut, mocks } = makeService([]);

      mocks.faceIdentity.mergeIdentitiesAfterProfileResolution.mockRejectedValueOnce(new Error('collapse failed'));

      await expect(
        sut.executePlan(
          {
            actorUserId: 'owner-1',
            origin: {
              type: 'person',
              targetProfileId: 'person-x',
              sourceProfileIds: ['person-y'],
              ownerId: 'owner-1',
            },
            targetIdentityId: 'identity-x',
            sourceIdentityIds: ['identity-y'],
            personalProfileMerges: [{ ownerId: 'owner-1', targetPersonId: 'person-x', sourcePersonIds: ['person-y'] }],
            spaceProfileMerges: [],
            profileIdentityUpdates: [],
            affectedOwnerIds: ['owner-1'],
            affectedSpaceIds: ['space-a'],
            followUpJobs: [{ name: JobName.SharedSpacePersonMetadataBackfill, data: { identityId: 'identity-x' } }],
            activityEvents: [],
          },
          { actorUserId: 'owner-1' },
        ),
      ).rejects.toThrow('collapse failed');

      expect(mocks.database.transaction).toHaveBeenCalledTimes(1);
      expect(mocks.job.queue).not.toHaveBeenCalled();
    });
  });

  describe('activity fanout', () => {
    it('writes initiating activity for the origin space and propagated activity for every affected other space', async () => {
      const { sut, mocks } = makeService([
        profile({ kind: 'space-person', id: 'space-a-x', spaceId: 'space-a', identityId: 'identity-x', faceCount: 10 }),
        profile({ kind: 'space-person', id: 'space-a-y', spaceId: 'space-a', identityId: 'identity-y', faceCount: 4 }),
        profile({ kind: 'space-person', id: 'space-b-x', spaceId: 'space-b', identityId: 'identity-x', faceCount: 8 }),
        profile({ kind: 'space-person', id: 'space-b-y', spaceId: 'space-b', identityId: 'identity-y', faceCount: 1 }),
        profile({ kind: 'space-person', id: 'space-c-y', spaceId: 'space-c', identityId: 'identity-y', faceCount: 2 }),
      ]);

      const plan = await sut.buildSpaceMergePlan({
        actorUserId: 'editor-1',
        spaceId: 'space-a',
        targetPersonId: 'space-a-x',
        sourcePersonIds: ['space-a-y'],
      });
      await sut.executePlan(plan, { actorUserId: 'editor-1' });

      expect(mocks.sharedSpace.logActivity).toHaveBeenCalledTimes(3);
      expect(mocks.sharedSpace.logActivity).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          spaceId: 'space-a',
          data: expect.objectContaining({
            originScope: 'space-person',
            activityRole: 'initiating',
            originatingSpaceId: 'space-a',
            targetIdentityId: 'identity-x',
            sourceIdentityIds: ['identity-y'],
            affectedSpaceIds: ['space-a', 'space-b', 'space-c'],
          }),
        }),
        expect.anything(),
      );
      expect(mocks.sharedSpace.logActivity).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          spaceId: 'space-b',
          data: expect.objectContaining({
            originScope: 'space-person',
            activityRole: 'propagated',
            originatingSpaceId: 'space-a',
            targetIdentityId: 'identity-x',
            sourceIdentityIds: ['identity-y'],
            affectedSpaceIds: ['space-a', 'space-b', 'space-c'],
          }),
        }),
        expect.anything(),
      );
      expect(mocks.sharedSpace.logActivity).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          spaceId: 'space-c',
          data: expect.objectContaining({
            originScope: 'space-person',
            activityRole: 'propagated',
            originatingSpaceId: 'space-a',
            targetIdentityId: 'identity-x',
            sourceIdentityIds: ['identity-y'],
            affectedSpaceIds: ['space-a', 'space-b', 'space-c'],
          }),
        }),
        expect.anything(),
      );
    });

    it('does not write duplicate activity when duplicate source ids are provided', async () => {
      const { sut, mocks } = makeService([
        profile({ kind: 'space-person', id: 'space-a-x', spaceId: 'space-a', identityId: 'identity-x', faceCount: 10 }),
        profile({ kind: 'space-person', id: 'space-a-y', spaceId: 'space-a', identityId: 'identity-y', faceCount: 4 }),
        profile({ kind: 'space-person', id: 'space-b-y', spaceId: 'space-b', identityId: 'identity-y', faceCount: 2 }),
      ]);

      const plan = await sut.buildSpaceMergePlan({
        actorUserId: 'editor-1',
        spaceId: 'space-a',
        targetPersonId: 'space-a-x',
        sourcePersonIds: ['space-a-y', 'space-a-y'],
      });
      await sut.executePlan(plan, { actorUserId: 'editor-1' });

      expect(plan.origin.sourceProfileIds).toEqual(['space-a-y']);
      expect(mocks.sharedSpace.logActivity).toHaveBeenCalledTimes(2);
      expect(mocks.sharedSpace.logActivity.mock.calls.map(([event]) => event.spaceId)).toEqual(['space-a', 'space-b']);
    });
  });
});
