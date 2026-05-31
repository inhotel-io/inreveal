import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/services/base.service';
import {
  FlagDecision,
  FlagParams,
  ReattributionTally,
  decideReattribution,
  tallyReattribution,
} from 'src/utils/face-repair';

export interface ReattributionCandidate extends ReattributionTally {
  assetFaceId: string;
  currentPersonId: string;
}

export interface FlaggedFace {
  assetFaceId: string;
  currentPersonId: string;
  suspectedOwnerId: string;
}

export type ReviewOnlyReason = 'over-cap' | 'bad-target';

export interface RepairPlan {
  toRepair: FlaggedFace[];
  reviewOnlyFaces: (FlaggedFace & { reason: ReviewOnlyReason })[];
  reviewOnlyPersonIds: string[];
  perPerson: { personId: string; eligible: number; flagged: number; flaggedFraction: number }[];
}

@Injectable()
export class FaceRepairService extends BaseService {
  async buildRepairPlan(
    options: {
      ownerId?: string;
      personId?: string;
      maxDistance: number;
      voteWindow: number;
      maxFlaggedFraction: number;
    } & FlagParams,
  ): Promise<RepairPlan> {
    const eligibleByPerson = new Map<string, number>();
    const flaggedByPerson = new Map<string, FlaggedFace[]>();

    for await (const candidate of this.findReattributionCandidates(options)) {
      eligibleByPerson.set(candidate.currentPersonId, (eligibleByPerson.get(candidate.currentPersonId) ?? 0) + 1);
      const decision = decideReattribution(candidate, options);
      if (decision.flagged && decision.suspectedOwnerId) {
        const list = flaggedByPerson.get(candidate.currentPersonId) ?? [];
        list.push({
          assetFaceId: candidate.assetFaceId,
          currentPersonId: candidate.currentPersonId,
          suspectedOwnerId: decision.suspectedOwnerId,
        });
        flaggedByPerson.set(candidate.currentPersonId, list);
      }
    }

    const reviewOnlyPersonIds = new Set<string>();
    for (const [personId, eligible] of eligibleByPerson) {
      const flagged = flaggedByPerson.get(personId)?.length ?? 0;
      if (eligible > 0 && flagged / eligible > options.maxFlaggedFraction) {
        reviewOnlyPersonIds.add(personId);
      }
    }

    const toRepair: FlaggedFace[] = [];
    const reviewOnlyFaces: (FlaggedFace & { reason: ReviewOnlyReason })[] = [];
    for (const [personId, faces] of flaggedByPerson) {
      if (reviewOnlyPersonIds.has(personId)) {
        for (const face of faces) {
          reviewOnlyFaces.push({ ...face, reason: 'over-cap' });
        }
        continue;
      }
      for (const face of faces) {
        if (reviewOnlyPersonIds.has(face.suspectedOwnerId)) {
          reviewOnlyFaces.push({ ...face, reason: 'bad-target' });
        } else {
          toRepair.push(face);
        }
      }
    }

    const perPerson = [...eligibleByPerson].map(([personId, eligible]) => {
      const flagged = flaggedByPerson.get(personId)?.length ?? 0;
      return { personId, eligible, flagged, flaggedFraction: eligible > 0 ? flagged / eligible : 0 };
    });

    return { toRepair, reviewOnlyFaces, reviewOnlyPersonIds: [...reviewOnlyPersonIds], perPerson };
  }

  async *findFlaggedFaces(
    options: { ownerId?: string; personId?: string; maxDistance: number; voteWindow: number } & FlagParams,
  ): AsyncIterableIterator<FlaggedFace> {
    for await (const candidate of this.findReattributionCandidates(options)) {
      const decision: FlagDecision = decideReattribution(candidate, options);
      if (decision.flagged && decision.suspectedOwnerId) {
        yield {
          assetFaceId: candidate.assetFaceId,
          currentPersonId: candidate.currentPersonId,
          suspectedOwnerId: decision.suspectedOwnerId,
        };
      }
    }
  }

  async *findReattributionCandidates(options: {
    ownerId?: string;
    personId?: string;
    maxDistance: number;
    voteWindow: number;
  }): AsyncIterableIterator<ReattributionCandidate> {
    for await (const face of this.faceRepairRepository.streamEligibleFaces(options)) {
      const matches = await this.searchRepository.searchFaces({
        userIds: [face.ownerId],
        embedding: face.embedding,
        maxDistance: options.maxDistance,
        numResults: options.voteWindow,
        hasPerson: true,
      });
      // searchFaces includes the query face itself — drop it by id.
      const neighbors = matches
        .filter((match) => match.id !== face.assetFaceId)
        .map((match) => ({ assetFaceId: match.id, personId: match.personId, distance: match.distance }));
      yield {
        assetFaceId: face.assetFaceId,
        currentPersonId: face.personId,
        ...tallyReattribution(face.personId, neighbors),
      };
    }
  }
}
