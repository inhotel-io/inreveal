import { ConflictException, Injectable } from '@nestjs/common';
import { OnJob } from 'src/decorators';
import { JobName, JobStatus, QueueName } from 'src/enum';
import { BaseService } from 'src/services/base.service';
import { RepairReport, summarizeRepairPlan } from 'src/services/face-repair.summary';
import { JobOf } from 'src/types';
import {
  FlagParams,
  ReattributionTally,
  classifyFlaggedPerson,
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
  unAttributableFaces: { assetFaceId: string; currentPersonId: string }[];
  perPerson: { personId: string; eligible: number; flagged: number; flaggedFraction: number }[];
}

const DEFAULT_VOTE_WINDOW = 200;
const DEFAULT_VOTE_MARGIN = 2;
const DEFAULT_MAX_ATTRIBUTION_DISTANCE = 0.35;
const DEFAULT_MAX_FLAGGED_FRACTION = 0.5;
export const DEFAULT_LARGE_CLUSTER_THRESHOLD = 50;

const SCAN_PROGRESS_INTERVAL = 200;

export interface RunRepairOptions {
  dryRun?: boolean;
  ownerId?: string;
  personId?: string;
  maxDistance?: number;
  minFaces?: number;
  voteWindow?: number;
  voteMargin?: number;
  maxAttributionDistance?: number;
  maxFlaggedFraction?: number;
}

export interface RepairExecution {
  moved: number;
  skipped: number;
}

export interface RunRepairResult {
  dryRun: boolean;
  mutated: boolean;
  report: RepairReport;
  executed?: RepairExecution;
}

export { RepairReport } from 'src/services/face-repair.summary';

@Injectable()
export class FaceRepairService extends BaseService {
  async buildRepairPlan(
    options: {
      ownerId?: string;
      personId?: string;
      personIds?: string[];
      approvedPersonIds?: string[];
      maxDistance: number;
      voteWindow: number;
      maxFlaggedFraction: number;
      onProgress?: (scanned: number) => Promise<void> | void;
    } & FlagParams,
  ): Promise<RepairPlan> {
    const eligibleByPerson = new Map<string, number>();
    const flaggedByPerson = new Map<string, FlaggedFace[]>();
    const unAttributableFaces: { assetFaceId: string; currentPersonId: string }[] = [];

    let scanned = 0;
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
      } else if (
        !decision.flagged &&
        candidate.ownCount < options.minFaces &&
        candidate.topOtherPersonId !== null &&
        candidate.topOtherNearest !== null &&
        candidate.topOtherNearest <= options.maxAttributionDistance
      ) {
        unAttributableFaces.push({ assetFaceId: candidate.assetFaceId, currentPersonId: candidate.currentPersonId });
      }
      scanned++;
      await options.onProgress?.(scanned);
    }

    const reviewOnlyPersonIds = new Set<string>();
    for (const [personId, eligible] of eligibleByPerson) {
      const flagged = flaggedByPerson.get(personId)?.length ?? 0;
      if (eligible > 0 && flagged / eligible > options.maxFlaggedFraction) {
        reviewOnlyPersonIds.add(personId);
      }
    }

    const approved = new Set(options.approvedPersonIds);
    const toRepair: FlaggedFace[] = [];
    const reviewOnlyFaces: (FlaggedFace & { reason: ReviewOnlyReason })[] = [];
    for (const [personId, faces] of flaggedByPerson) {
      if (approved.has(personId)) {
        for (const face of faces) {
          toRepair.push(face); // approved: exempt from over-cap AND bad-target
        }
        continue;
      }
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

    return { toRepair, reviewOnlyFaces, reviewOnlyPersonIds: [...reviewOnlyPersonIds], unAttributableFaces, perPerson };
  }

  // Directly re-attribute each flagged face to its detector-determined suspected owner, with a `manual`
  // identity link. This is the durable, intent-faithful move: it writes the destination the admin approved
  // (recognition never overrides a manual face, so it cannot boomerang back), and never re-queues
  // FacialRecognition (whose nearest-neighbour re-clustering routed unassigned faces straight back to the
  // original wrong person on contaminated clusters). A suspected owner deleted/merged since the scan is
  // skipped (never written), so a stale destination can never corrupt the apply.
  async executeRepair(plan: RepairPlan): Promise<RepairExecution> {
    // Group by (source person → destination owner) so the write-time re-check (still-on-source) holds per route.
    const routes = new Map<string, { from: string; to: string; faceIds: string[] }>();
    for (const face of plan.toRepair) {
      const key = `${face.currentPersonId}|${face.suspectedOwnerId}`;
      const route = routes.get(key) ?? { from: face.currentPersonId, to: face.suspectedOwnerId, faceIds: [] };
      route.faceIds.push(face.assetFaceId);
      routes.set(key, route);
    }

    let moved = 0;
    let skipped = 0;
    const affectedPersonIds = new Set<string>();
    const ownerExists = new Map<string, boolean>();

    for (const { from, to, faceIds } of routes.values()) {
      let exists = ownerExists.get(to);
      if (exists === undefined) {
        exists = !!(await this.personRepository.getById(to));
        ownerExists.set(to, exists);
      }
      if (!exists) {
        skipped += faceIds.length;
        continue;
      }

      const movedIds = await this.faceRepairRepository.reattributeFaces(from, to, faceIds);
      skipped += faceIds.length - movedIds.length;
      if (movedIds.length === 0) {
        continue;
      }

      const identity = await this.faceIdentityRepository.ensurePersonIdentity(to);
      for (const assetFaceId of movedIds) {
        await this.faceIdentityRepository.replaceFaceIdentity({
          assetFaceId,
          identityId: identity.id,
          source: 'manual',
        });
      }
      moved += movedIds.length;
      affectedPersonIds.add(from);
      affectedPersonIds.add(to);
    }

    if (affectedPersonIds.size > 0) {
      await this.faceRepairRepository.reconcileRepresentativeFaces([...affectedPersonIds]);
    }

    return { moved, skipped };
  }

  async runRepair(options: RunRepairOptions = {}): Promise<RunRepairResult> {
    const { machineLearning } = await this.getConfig({ withCache: true });
    const recognition = machineLearning.facialRecognition;
    const dryRun = options.dryRun ?? true;

    const planOptions = {
      ownerId: options.ownerId,
      personId: options.personId,
      maxDistance: options.maxDistance ?? recognition.maxDistance,
      minFaces: options.minFaces ?? recognition.minFaces,
      voteWindow: options.voteWindow ?? DEFAULT_VOTE_WINDOW,
      voteMargin: options.voteMargin ?? DEFAULT_VOTE_MARGIN,
      maxAttributionDistance: options.maxAttributionDistance ?? DEFAULT_MAX_ATTRIBUTION_DISTANCE,
      maxFlaggedFraction: options.maxFlaggedFraction ?? DEFAULT_MAX_FLAGGED_FRACTION,
    };

    const plan = await this.buildRepairPlan(planOptions);

    let executed: RepairExecution | undefined;
    if (!dryRun) {
      if (await this.jobRepository.isActive(QueueName.FacialRecognition)) {
        throw new Error('Refusing to run face re-attribution repair while facial recognition is active');
      }
      executed = await this.executeRepair(plan);
    }

    return { dryRun, mutated: !dryRun, report: summarizeRepairPlan(plan), executed };
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

  async runScan(scanId: string): Promise<void> {
    await this.faceRepairScanRepository.updateScanProgress(scanId, { status: 'running', startedAt: new Date() });

    try {
      // Step 2: read stored scan params; fall back to config defaults if none
      const storedScan = await this.faceRepairScanRepository.getScanById(scanId);
      const { machineLearning } = await this.getConfig({ withCache: true });
      const recognition = machineLearning.facialRecognition;

      const storedParams = storedScan?.params as
        | {
            ownerId?: string;
            maxDistance?: number;
            minFaces?: number;
            voteWindow?: number;
            voteMargin?: number;
            maxAttributionDistance?: number;
            maxFlaggedFraction?: number;
            largeClusterThreshold?: number;
          }
        | undefined;

      const ownerId = storedParams?.ownerId;
      const maxDistance = storedParams?.maxDistance ?? recognition.maxDistance;
      const minFaces = storedParams?.minFaces ?? recognition.minFaces;
      const voteWindow = storedParams?.voteWindow ?? DEFAULT_VOTE_WINDOW;
      const voteMargin = storedParams?.voteMargin ?? DEFAULT_VOTE_MARGIN;
      const maxAttributionDistance = storedParams?.maxAttributionDistance ?? DEFAULT_MAX_ATTRIBUTION_DISTANCE;
      const maxFlaggedFraction = storedParams?.maxFlaggedFraction ?? DEFAULT_MAX_FLAGGED_FRACTION;
      const largeClusterThreshold = storedParams?.largeClusterThreshold ?? DEFAULT_LARGE_CLUSTER_THRESHOLD;

      // Step 3: count eligible faces for progress tracking
      const total = await this.faceRepairRepository.countEligibleFaces({ ownerId });

      // Step 4: build plan with progress callback (throttled every SCAN_PROGRESS_INTERVAL + final update)
      let lastReported = 0;
      const onProgress = async (scanned: number) => {
        if (scanned - lastReported >= SCAN_PROGRESS_INTERVAL || scanned >= total) {
          lastReported = scanned;
          await this.faceRepairScanRepository.updateScanProgress(scanId, { progress: { scanned, total } });
        }
      };

      const plan = await this.buildRepairPlan({
        ownerId,
        maxDistance,
        voteWindow,
        minFaces,
        voteMargin,
        maxAttributionDistance,
        maxFlaggedFraction,
        onProgress,
      });

      // Final progress update after stream ends (fires even when total candidates < SCAN_PROGRESS_INTERVAL)
      const streamedCount = plan.perPerson.reduce((sum, p) => sum + p.eligible, 0);
      if (streamedCount !== lastReported) {
        await this.faceRepairScanRepository.updateScanProgress(scanId, {
          progress: { scanned: streamedCount, total },
        });
      }

      // Step 5: reviewOnlyPersonIds set
      const reviewOnlyPersonIds = new Set(plan.reviewOnlyPersonIds);

      // Step 6: group flagged faces by person to build suspectedOwnerIds per flagged person
      const allFlaggedFaces = [...plan.toRepair, ...plan.reviewOnlyFaces];
      const suspectedOwnersByPerson = new Map<string, string[]>();
      for (const face of allFlaggedFaces) {
        const owners = suspectedOwnersByPerson.get(face.currentPersonId) ?? [];
        owners.push(face.suspectedOwnerId);
        suspectedOwnersByPerson.set(face.currentPersonId, owners);
      }

      const enrichInput = plan.perPerson
        .filter((p) => p.flagged > 0)
        .map((p) => ({
          personId: p.personId,
          eligible: p.eligible,
          flagged: p.flagged,
          flaggedFraction: p.flaggedFraction,
          suspectedOwnerIds: suspectedOwnersByPerson.get(p.personId) ?? [],
        }));

      // Step 7: enrich with person metadata
      const enriched = await this.faceRepairScanRepository.enrichReportPersons(enrichInput);

      // Step 8: classify each flagged person and overwrite placeholder recommendation/reviewReasons
      for (const p of enriched) {
        const decision = classifyFlaggedPerson(
          {
            personName: p.personName,
            faceCount: p.faceCount,
            suspectedOwnerIds: p.suspectedOwners.map((o) => o.ownerPersonId),
          },
          { reviewOnlyPersonIds, largeClusterThreshold },
        );
        p.recommendation = decision.recommendation;
        p.reviewReasons = decision.reviewReasons;
      }

      // Step 9: compute totals
      const { totals } = summarizeRepairPlan(plan);

      // Step 10: persist completed scan
      await this.faceRepairScanRepository.completeScan(scanId, { totals, persons: enriched });

      // Step 11: prune old scans
      await this.faceRepairScanRepository.pruneSupersededScans();
    } catch (error) {
      await this.faceRepairScanRepository.failScan(scanId, String(error));
      throw error;
    }
  }

  @OnJob({ name: JobName.FaceRepairScan, queue: QueueName.BackgroundTask })
  async handleFaceRepairScan({ scanId }: JobOf<JobName.FaceRepairScan>): Promise<JobStatus> {
    await this.runScan(scanId);
    return JobStatus.Success;
  }

  async triggerScan(requestedBy: string): Promise<{ scanId: string }> {
    if (await this.jobRepository.isActive(QueueName.FacialRecognition)) {
      throw new ConflictException('Refusing to scan while facial recognition is active');
    }
    const { machineLearning } = await this.getConfig({ withCache: true });
    const recognition = machineLearning.facialRecognition;
    const params = {
      maxDistance: recognition.maxDistance,
      minFaces: recognition.minFaces,
      voteWindow: DEFAULT_VOTE_WINDOW,
      voteMargin: DEFAULT_VOTE_MARGIN,
      maxAttributionDistance: DEFAULT_MAX_ATTRIBUTION_DISTANCE,
      maxFlaggedFraction: DEFAULT_MAX_FLAGGED_FRACTION,
      largeClusterThreshold: DEFAULT_LARGE_CLUSTER_THRESHOLD,
    };
    let scan;
    try {
      scan = await this.faceRepairScanRepository.createScan({ requestedBy, params });
    } catch {
      throw new ConflictException('A face-repair scan is already in progress');
    }
    await this.jobRepository.queue({ name: JobName.FaceRepairScan, data: { scanId: scan.id } });
    return { scanId: scan.id };
  }

  async getLatestScanStatus() {
    return (await this.faceRepairScanRepository.getLatestScan()) ?? null;
  }

  async getPersonFlaggedFaces(
    personId: string,
  ): Promise<{ personId: string; flaggedFaces: { assetFaceId: string; suspectedOwnerId: string }[] }> {
    const { machineLearning } = await this.getConfig({ withCache: true });
    const recognition = machineLearning.facialRecognition;
    const plan = await this.buildRepairPlan({
      maxDistance: recognition.maxDistance,
      minFaces: recognition.minFaces,
      voteWindow: DEFAULT_VOTE_WINDOW,
      voteMargin: DEFAULT_VOTE_MARGIN,
      maxAttributionDistance: DEFAULT_MAX_ATTRIBUTION_DISTANCE,
      maxFlaggedFraction: DEFAULT_MAX_FLAGGED_FRACTION,
      personIds: [personId],
    });
    const flaggedFaces = [...plan.toRepair, ...plan.reviewOnlyFaces].map((f) => ({
      assetFaceId: f.assetFaceId,
      suspectedOwnerId: f.suspectedOwnerId,
    }));
    return { personId, flaggedFaces };
  }

  async applyRepair(input: { approvedPersonIds: string[]; excludeFaceIds?: string[] }): Promise<RepairExecution> {
    if (input.approvedPersonIds.length === 0) {
      return { moved: 0, skipped: 0 };
    }
    if (await this.jobRepository.isActive(QueueName.FacialRecognition)) {
      throw new ConflictException('Refusing to apply while facial recognition is active');
    }
    const latest = await this.faceRepairScanRepository.getLatestScan();
    if (latest && (latest.status === 'pending' || latest.status === 'running')) {
      throw new ConflictException('Refusing to apply while a scan is in progress');
    }
    const { machineLearning } = await this.getConfig({ withCache: true });
    const recognition = machineLearning.facialRecognition;
    const plan = await this.buildRepairPlan({
      maxDistance: recognition.maxDistance,
      minFaces: recognition.minFaces,
      voteWindow: DEFAULT_VOTE_WINDOW,
      voteMargin: DEFAULT_VOTE_MARGIN,
      maxAttributionDistance: DEFAULT_MAX_ATTRIBUTION_DISTANCE,
      maxFlaggedFraction: DEFAULT_MAX_FLAGGED_FRACTION,
      personIds: input.approvedPersonIds,
      approvedPersonIds: input.approvedPersonIds,
    });
    const exclude = new Set(input.excludeFaceIds);
    const scopedPlan = { ...plan, toRepair: plan.toRepair.filter((face) => !exclude.has(face.assetFaceId)) };
    const result = await this.executeRepair(scopedPlan);

    // Drop the resolved persons from the latest scan snapshot so the console reflects the change immediately
    // (the persisted report is a point-in-time snapshot; without this the applied rows reappear on refetch).
    if (result.moved > 0) {
      await this.faceRepairScanRepository.removePersonsFromLatestScan(input.approvedPersonIds);
    }

    return result;
  }
}
