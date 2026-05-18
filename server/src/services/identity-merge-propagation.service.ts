import { BadRequestException, Injectable } from '@nestjs/common';
import { JobName, SharedSpaceActivityType } from 'src/enum';
import { DatabaseRepository } from 'src/repositories/database.repository';
import { FaceIdentityRepository } from 'src/repositories/face-identity.repository';
import { JobRepository } from 'src/repositories/job.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { PersonRepository } from 'src/repositories/person.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';

export type MergeProfileKind = 'person' | 'space-person';

export type MergeProfile = {
  kind: MergeProfileKind;
  id: string;
  ownerId?: string;
  spaceId?: string;
  identityId: string | null;
  type: string;
  name: string;
  faceCount: number;
};

export type ProfileMergeStep = {
  targetPersonId: string;
  sourcePersonIds: string[];
};

export type PersonalProfileMergeStep = ProfileMergeStep & { ownerId: string };
export type SpaceProfileMergeStep = ProfileMergeStep & { spaceId: string };

export type MergePropagationActivityPayload = {
  originScope: MergeProfileKind;
  actorUserId: string;
  activityRole: 'initiating' | 'propagated';
  originatingSpaceId: string | null;
  targetProfileId: string;
  sourceProfileIds: string[];
  targetIdentityId: string;
  sourceIdentityIds: string[];
  affectedPersonalProfileMergeCount: number;
  affectedSharedSpaceProfileMergeCount: number;
  affectedSpaceIds: string[];
};

export type MergePropagationActivityEvent = {
  spaceId: string;
  userId: string;
  type: SharedSpaceActivityType.PersonMerge;
  data: MergePropagationActivityPayload;
};

export type MergePropagationFollowUpJob =
  | { name: JobName.SharedSpacePersonMetadataBackfill; data: { identityId: string } }
  | { name: JobName.SharedSpacePersonDedup; data: { spaceId: string } }
  | { name: JobName.PersonGenerateThumbnail; data: { id: string } }
  | { name: JobName.FileDelete; data: { files: string[] } };

export type IdentityMergePropagationPlan = {
  actorUserId: string;
  origin: {
    type: MergeProfileKind;
    targetProfileId: string;
    sourceProfileIds: string[];
    ownerId?: string;
    spaceId?: string;
  };
  targetIdentityId: string;
  sourceIdentityIds: string[];
  personalProfileMerges: PersonalProfileMergeStep[];
  spaceProfileMerges: SpaceProfileMergeStep[];
  profileIdentityUpdates: Array<{ kind: MergeProfileKind; profileId: string; identityId: string }>;
  affectedOwnerIds: string[];
  affectedSpaceIds: string[];
  followUpJobs: MergePropagationFollowUpJob[];
  activityEvents: MergePropagationActivityEvent[];
};

type IdentityMergePropagationDependencies = {
  databaseRepository: DatabaseRepository;
  faceIdentityRepository: FaceIdentityRepository;
  jobRepository: JobRepository;
  logger: LoggingRepository;
  personRepository: PersonRepository;
  sharedSpaceRepository: SharedSpaceRepository;
};

@Injectable()
export class IdentityMergePropagationService {
  constructor(private deps: IdentityMergePropagationDependencies) {}

  async buildPersonalMergePlan(input: {
    actorUserId: string;
    targetPersonId: string;
    sourcePersonIds: string[];
  }): Promise<IdentityMergePropagationPlan> {
    const sourcePersonIds = [...new Set(input.sourcePersonIds)].filter((id) => id !== input.targetPersonId);
    const originPersonIds = [input.targetPersonId, ...sourcePersonIds];
    const originProfiles = await this.deps.faceIdentityRepository.getMergePropagationProfiles({
      personIds: originPersonIds,
    });
    const originProfilesById = new Map(originProfiles.map((profile) => [profile.id, profile as MergeProfile]));

    const targetProfile = originProfilesById.get(input.targetPersonId);
    if (!targetProfile || targetProfile.kind !== 'person' || targetProfile.ownerId !== input.actorUserId) {
      throw new BadRequestException('Target person not found');
    }

    const sourceProfiles = sourcePersonIds.map((sourcePersonId) => {
      const sourceProfile = originProfilesById.get(sourcePersonId);
      if (!sourceProfile || sourceProfile.kind !== 'person' || sourceProfile.ownerId !== targetProfile.ownerId) {
        throw new BadRequestException('Source person not found');
      }

      if (sourceProfile.type !== targetProfile.type) {
        throw new BadRequestException('Cannot merge people of different types');
      }

      return sourceProfile;
    });

    const ensuredOriginProfiles = await this.ensureOriginIdentities([targetProfile, ...sourceProfiles]);
    const ensuredTargetProfile = ensuredOriginProfiles[0];
    const ensuredSourceProfiles = ensuredOriginProfiles.slice(1);
    const targetIdentityId = ensuredTargetProfile.identityId;
    if (!targetIdentityId) {
      throw new BadRequestException('Target person identity not found');
    }

    const sourceIdentityIds = [
      ...new Set(
        ensuredSourceProfiles
          .map((profile) => profile.identityId)
          .filter((identityId): identityId is string => !!identityId && identityId !== targetIdentityId),
      ),
    ];
    const planIdentityIds = [targetIdentityId, ...sourceIdentityIds];
    const attachedProfiles = (await this.deps.faceIdentityRepository.getMergePropagationProfiles({
      identityIds: planIdentityIds,
    })) as MergeProfile[];

    const personalGroups = this.groupProfiles(attachedProfiles, 'person');
    const spaceGroups = this.groupProfiles(attachedProfiles, 'space-person');
    const personalProfileMerges: PersonalProfileMergeStep[] = [];
    const spaceProfileMerges: SpaceProfileMergeStep[] = [];
    const profileIdentityUpdates: IdentityMergePropagationPlan['profileIdentityUpdates'] = [];
    const affectedOwnerIds = new Set<string>();
    const affectedSpaceIds = new Set<string>();

    for (const [ownerId, profiles] of [...personalGroups.entries()].toSorted(([a], [b]) => a.localeCompare(b))) {
      const survivor = this.chooseSurvivor(profiles, {
        targetIdentityId,
        initiatingTargetProfileId: ownerId === targetProfile.ownerId ? ensuredTargetProfile.id : undefined,
      });
      const sources = this.sortMergeSources(profiles.filter((profile) => profile.id !== survivor.id));

      if (sources.length > 0) {
        personalProfileMerges.push({
          ownerId,
          targetPersonId: survivor.id,
          sourcePersonIds: sources.map(({ id }) => id),
        });
        affectedOwnerIds.add(ownerId);
      } else if (survivor.identityId !== targetIdentityId) {
        profileIdentityUpdates.push({ kind: 'person', profileId: survivor.id, identityId: targetIdentityId });
        affectedOwnerIds.add(ownerId);
      }
    }

    for (const [spaceId, profiles] of [...spaceGroups.entries()].toSorted(([a], [b]) => a.localeCompare(b))) {
      const survivor = this.chooseSurvivor(profiles, { targetIdentityId });
      const sources = this.sortMergeSources(profiles.filter((profile) => profile.id !== survivor.id));

      if (sources.length > 0) {
        spaceProfileMerges.push({ spaceId, targetPersonId: survivor.id, sourcePersonIds: sources.map(({ id }) => id) });
        affectedSpaceIds.add(spaceId);
      } else if (survivor.identityId !== targetIdentityId) {
        profileIdentityUpdates.push({ kind: 'space-person', profileId: survivor.id, identityId: targetIdentityId });
        affectedSpaceIds.add(spaceId);
      }
    }

    const sortedAffectedOwnerIds = [...affectedOwnerIds].toSorted();
    const sortedAffectedSpaceIds = [...affectedSpaceIds].toSorted();
    const payload: MergePropagationActivityPayload = {
      originScope: 'person',
      actorUserId: input.actorUserId,
      activityRole: 'propagated',
      originatingSpaceId: null,
      targetProfileId: ensuredTargetProfile.id,
      sourceProfileIds: sourcePersonIds,
      targetIdentityId,
      sourceIdentityIds,
      affectedPersonalProfileMergeCount: personalProfileMerges.length,
      affectedSharedSpaceProfileMergeCount: spaceProfileMerges.length,
      affectedSpaceIds: sortedAffectedSpaceIds,
    };

    return {
      actorUserId: input.actorUserId,
      origin: {
        type: 'person',
        targetProfileId: ensuredTargetProfile.id,
        sourceProfileIds: sourcePersonIds,
        ownerId: ensuredTargetProfile.ownerId,
      },
      targetIdentityId,
      sourceIdentityIds,
      personalProfileMerges,
      spaceProfileMerges,
      profileIdentityUpdates,
      affectedOwnerIds: sortedAffectedOwnerIds,
      affectedSpaceIds: sortedAffectedSpaceIds,
      followUpJobs: [
        { name: JobName.SharedSpacePersonMetadataBackfill, data: { identityId: targetIdentityId } },
        ...sortedAffectedSpaceIds.map(
          (spaceId): MergePropagationFollowUpJob => ({ name: JobName.SharedSpacePersonDedup, data: { spaceId } }),
        ),
      ],
      activityEvents: sortedAffectedSpaceIds.map((spaceId) => ({
        spaceId,
        userId: input.actorUserId,
        type: SharedSpaceActivityType.PersonMerge,
        data: payload,
      })),
    };
  }

  private async ensureOriginIdentities(profiles: MergeProfile[]): Promise<MergeProfile[]> {
    const ensured: MergeProfile[] = [];

    for (const profile of profiles) {
      const identity = await this.deps.faceIdentityRepository.ensurePersonIdentity(profile.id);
      ensured.push({ ...profile, identityId: identity.id });
    }

    return ensured;
  }

  private groupProfiles(profiles: MergeProfile[], kind: 'person'): Map<string, MergeProfile[]>;
  private groupProfiles(profiles: MergeProfile[], kind: 'space-person'): Map<string, MergeProfile[]>;
  private groupProfiles(profiles: MergeProfile[], kind: MergeProfileKind): Map<string, MergeProfile[]> {
    const groups = new Map<string, MergeProfile[]>();

    for (const profile of profiles) {
      if (profile.kind !== kind) {
        continue;
      }

      const groupId = profile.kind === 'person' ? profile.ownerId : profile.spaceId;
      if (!groupId) {
        continue;
      }

      const group = groups.get(groupId) ?? [];
      group.push(profile);
      groups.set(groupId, group);
    }

    return groups;
  }

  private chooseSurvivor(
    profiles: MergeProfile[],
    options: { targetIdentityId: string; initiatingTargetProfileId?: string },
  ): MergeProfile {
    const initiatingTarget = profiles.find((profile) => profile.id === options.initiatingTargetProfileId);
    if (initiatingTarget) {
      return initiatingTarget;
    }

    const targetIdentityProfile = this.sortMergeSources(
      profiles.filter((profile) => profile.identityId === options.targetIdentityId),
    )[0];
    if (targetIdentityProfile) {
      return targetIdentityProfile;
    }

    return this.sortMergeSources(profiles)[0];
  }

  private sortMergeSources(profiles: MergeProfile[]): MergeProfile[] {
    return profiles.toSorted((a, b) => b.faceCount - a.faceCount || a.id.localeCompare(b.id));
  }
}
