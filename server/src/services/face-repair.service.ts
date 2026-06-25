import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { OnJob } from 'src/decorators';
import { FaceRepairScanParams } from 'src/dtos/face-repair.dto';
import { JobName, JobStatus, QueueName } from 'src/enum';
import { RepairScanRow, ScanInProgressError } from 'src/repositories/face-repair-scan.repository';
import { BaseService } from 'src/services/base.service';
import { RepairReport, summarizeRepairPlan } from 'src/services/face-repair.summary';
import { JobOf } from 'src/types';
import {
  FlagParams,
  ReattributionTally,
  applyDeclineFilters,
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
// In-flight scans whose last heartbeat is older than this are considered lost (worker crash, Redis failure
// between row insert and enqueue) and failed, so they can't block new scans and applies forever.
const STALE_SCAN_TIMEOUT_MS = 30 * 60 * 1000;

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

    const declineMaps = await this.faceRepairDeclineRepository.getDeclineMaps();
    applyDeclineFilters(flaggedByPerson, declineMaps);

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
      await this.faceIdentityRepository.replaceFaceIdentities({
        assetFaceIds: movedIds,
        identityId: identity.id,
        source: 'manual',
      });
      moved += movedIds.length;
      affectedPersonIds.add(from);
      affectedPersonIds.add(to);
    }

    if (affectedPersonIds.size > 0) {
      const repointedIds = await this.faceRepairRepository.reconcileRepresentativeFaces([...affectedPersonIds]);
      // Regenerate thumbnails for persons whose representative face changed — without this the source person's
      // card keeps showing the crop of a face that just moved away (the very artifact this console fixes).
      if (repointedIds.length > 0) {
        await this.jobRepository.queueAll(
          repointedIds.map((id) => ({ name: JobName.PersonGenerateThumbnail, data: { id } })),
        );
      }
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
            personId: p.personId,
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

  async triggerScan(requestedBy: string, overrides?: FaceRepairScanParams): Promise<{ scanId: string }> {
    if (await this.jobRepository.isActive(QueueName.FacialRecognition)) {
      throw new ConflictException('Refusing to scan while facial recognition is active');
    }
    await this.faceRepairScanRepository.failStaleScans(STALE_SCAN_TIMEOUT_MS);
    const { machineLearning } = await this.getConfig({ withCache: true });
    const recognition = machineLearning.facialRecognition;
    const params = {
      maxDistance: overrides?.maxDistance ?? recognition.maxDistance,
      minFaces: overrides?.minFaces ?? recognition.minFaces,
      voteWindow: overrides?.voteWindow ?? DEFAULT_VOTE_WINDOW,
      voteMargin: overrides?.voteMargin ?? DEFAULT_VOTE_MARGIN,
      maxAttributionDistance: overrides?.maxAttributionDistance ?? DEFAULT_MAX_ATTRIBUTION_DISTANCE,
      maxFlaggedFraction: overrides?.maxFlaggedFraction ?? DEFAULT_MAX_FLAGGED_FRACTION,
      largeClusterThreshold: overrides?.largeClusterThreshold ?? DEFAULT_LARGE_CLUSTER_THRESHOLD,
    };
    let scan;
    try {
      scan = await this.faceRepairScanRepository.createScan({ requestedBy, params });
    } catch (error) {
      if (error instanceof ScanInProgressError) {
        throw new ConflictException(error.message);
      }
      throw error; // real DB failures must not masquerade as "scan already in progress"
    }
    await this.jobRepository.queue({ name: JobName.FaceRepairScan, data: { scanId: scan.id } });
    return { scanId: scan.id };
  }

  async getScanDefaults(): Promise<{ maxDistance: number; minFaces: number; maxFlaggedFraction: number }> {
    const { machineLearning } = await this.getConfig({ withCache: true });
    const recognition = machineLearning.facialRecognition;
    return {
      maxDistance: recognition.maxDistance,
      minFaces: recognition.minFaces,
      maxFlaggedFraction: DEFAULT_MAX_FLAGGED_FRACTION,
    };
  }

  async getLatestScanStatus() {
    const scan = await this.faceRepairScanRepository.getLatestScan();
    if (!scan) {
      return null;
    }
    // Refresh display names/thumbnails from the live person table — people get named after a scan and the
    // persisted report is only a snapshot. Keeps the console legible without an expensive full re-scan.
    return this.faceRepairScanRepository.withCurrentNames(scan);
  }

  // The review page and apply must re-plan with the SAME params the dashboard's scan ran with — otherwise a
  // tuned (Advanced) scan shows one face set while review/apply silently compute another. Scan params are
  // fully resolved at trigger time, so stored values win; config/defaults only apply when no scan exists.
  private async resolvePlanParams(latest: RepairScanRow | undefined | null) {
    const stored = latest?.params ?? undefined;
    const { machineLearning } = await this.getConfig({ withCache: true });
    const recognition = machineLearning.facialRecognition;
    return {
      maxDistance: stored?.maxDistance ?? recognition.maxDistance,
      minFaces: stored?.minFaces ?? recognition.minFaces,
      voteWindow: stored?.voteWindow ?? DEFAULT_VOTE_WINDOW,
      voteMargin: stored?.voteMargin ?? DEFAULT_VOTE_MARGIN,
      maxAttributionDistance: stored?.maxAttributionDistance ?? DEFAULT_MAX_ATTRIBUTION_DISTANCE,
      maxFlaggedFraction: stored?.maxFlaggedFraction ?? DEFAULT_MAX_FLAGGED_FRACTION,
    };
  }

  getClusterFaces(
    personId: string,
    options: { excludeFaceIds: string[]; page: number; size: number },
  ): Promise<{ faces: { assetFaceId: string }[]; total: number; hasMore: boolean }> {
    return this.faceRepairRepository.getClusterFacePage(personId, {
      excludeFaceIds: options.excludeFaceIds,
      limit: options.size,
      offset: options.page * options.size,
    });
  }

  async getPersonFlaggedFaces(
    personId: string,
  ): Promise<{ personId: string; flaggedFaces: { assetFaceId: string; suspectedOwnerId: string }[] }> {
    const latest = await this.faceRepairScanRepository.getLatestScan();
    const plan = await this.buildRepairPlan({
      ...(await this.resolvePlanParams(latest)),
      personIds: [personId],
    });
    const flaggedFaces = [...plan.toRepair, ...plan.reviewOnlyFaces].map((f) => ({
      assetFaceId: f.assetFaceId,
      suspectedOwnerId: f.suspectedOwnerId,
    }));
    return { personId, flaggedFaces };
  }

  async createDeclines(input: {
    faces?: { assetFaceId: string; suspectedOwnerId: string }[];
    persons?: { personId: string; suspectedOwnerIds: string[] }[];
    declinedBy: string;
  }): Promise<{ created: number }> {
    const created = await this.faceRepairDeclineRepository.createDeclines(input);
    return { created };
  }

  async listDeclines() {
    const rows = await this.faceRepairDeclineRepository.listDeclines();
    return { declines: rows };
  }

  async removeDeclines(input: {
    ids?: string[];
    faces?: { assetFaceId: string; suspectedOwnerId: string }[];
  }): Promise<{ removed: number }> {
    const removed = await this.faceRepairDeclineRepository.removeDeclines(input);
    return { removed };
  }

  async applyRepair(input: {
    approvedPersonIds: string[];
    excludeFaceIds?: string[];
    manualMove?: { personId: string; destinationPersonId: string; faceIds?: string[]; entireCluster?: boolean };
  }): Promise<RepairExecution> {
    const manualMove = input.manualMove;
    if (manualMove && manualMove.destinationPersonId === manualMove.personId) {
      throw new BadRequestException('Cannot move a cluster into itself');
    }

    const hasManualWork = !!manualMove && (manualMove.entireCluster === true || (manualMove.faceIds?.length ?? 0) > 0);
    const hasFlagged = input.approvedPersonIds.length > 0;
    if (!hasFlagged && !hasManualWork) {
      return { moved: 0, skipped: 0 };
    }

    if (await this.jobRepository.isActive(QueueName.FacialRecognition)) {
      throw new ConflictException('Refusing to apply while facial recognition is active');
    }
    await this.faceRepairScanRepository.failStaleScans(STALE_SCAN_TIMEOUT_MS);
    const latest = await this.faceRepairScanRepository.getLatestScan();
    if (latest && (latest.status === 'pending' || latest.status === 'running')) {
      throw new ConflictException('Refusing to apply while a scan is in progress');
    }

    const toRepair: FlaggedFace[] = [];
    if (hasFlagged) {
      const plan = await this.buildRepairPlan({
        ...(await this.resolvePlanParams(latest)),
        personIds: input.approvedPersonIds,
        approvedPersonIds: input.approvedPersonIds,
      });
      const exclude = new Set(input.excludeFaceIds);
      for (const face of plan.toRepair) {
        if (!exclude.has(face.assetFaceId)) {
          toRepair.push(face);
        }
      }
    }

    if (hasManualWork && manualMove) {
      const manualFaceIds = manualMove.entireCluster
        ? await this.collectClusterFaceIds(manualMove.personId)
        : (manualMove.faceIds ?? []);
      for (const assetFaceId of manualFaceIds) {
        toRepair.push({
          assetFaceId,
          currentPersonId: manualMove.personId,
          suspectedOwnerId: manualMove.destinationPersonId,
        });
      }
    }

    const result = await this.executeRepair({
      toRepair,
      reviewOnlyFaces: [],
      reviewOnlyPersonIds: [],
      unAttributableFaces: [],
      perPerson: [],
    });

    if (result.moved > 0) {
      const personsToDrop = new Set(input.approvedPersonIds);
      if (hasManualWork && manualMove) {
        const remaining = await this.faceRepairRepository.countEligibleFaces({ personId: manualMove.personId });
        if (remaining === 0) {
          personsToDrop.add(manualMove.personId);
          const source = await this.personRepository.getById(manualMove.personId);
          if (source && (!source.name || source.name.trim().length === 0)) {
            await this.personRepository.delete([manualMove.personId]);
          }
        }
      }
      if (personsToDrop.size > 0) {
        await this.faceRepairScanRepository.removePersonsFromLatestScan([...personsToDrop]);
      }
    }

    return result;
  }

  private async collectClusterFaceIds(personId: string): Promise<string[]> {
    const ids: string[] = [];
    for await (const row of this.faceRepairRepository.streamEligibleFaces({ personId })) {
      ids.push(row.assetFaceId);
    }
    return ids;
  }
}
