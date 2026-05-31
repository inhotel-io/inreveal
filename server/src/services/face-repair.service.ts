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

@Injectable()
export class FaceRepairService extends BaseService {
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
