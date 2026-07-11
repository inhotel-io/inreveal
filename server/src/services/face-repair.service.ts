import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { OnJob } from 'src/decorators';
import { FaceRepairResolveRequest, FaceRepairResolveResponse, FaceRepairScanParams } from 'src/dtos/face-repair.dto';
import { JobName, JobStatus, QueueName } from 'src/enum';
import { ScanInProgressError } from 'src/repositories/face-repair-scan.repository';
import { OwnerPersonRow } from 'src/repositories/face-repair.repository';
import { BaseService } from 'src/services/base.service';
import { RepairReport, summarizeRepairPlan } from 'src/services/face-repair.summary';
import { JobOf } from 'src/types';
import {
  FlagParams,
  ReattributionTally,
  applyDeclineFilters,
  classifyFlaggedPerson,
  decideReattribution,
  findOverlappingIds,
  findUnresolvableIds,
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
// Page size for the move-to-chosen-person picker's owner-scoped people search (admin-scale, not tunable).
const OWNER_PEOPLE_PAGE_SIZE = 20;

const SCAN_PROGRESS_INTERVAL = 200;
// Keyset page size for the eligible-face scan (B6: paged, not a single streaming cursor) and the number of
// per-face ANN searches run concurrently within a page (B2: the scan was strictly serial — one round-trip per
// face with the DB core idle in between). 8 stays comfortably under the pg pool cap (max 10) with headroom for
// the page query and any concurrent work.
const SCAN_PAGE_SIZE = 500;
const SCAN_SEARCH_CONCURRENCY = 8;

// Map over items with a bounded number of concurrent workers, preserving input order in the result. Small local
// helper (no p-limit dependency) used to fan out the scan's per-face vector searches.
async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const runWorker = async () => {
    for (let index = next++; index < items.length; index = next++) {
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}
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

      // Wrap the re-attribution and its identity relink in one transaction (A1). Without this a crash between
      // the two writes leaves a face on `to` still carrying `from`'s identity, which a later FaceIdentityBackfill
      // can resolve back to `from` and silently revert the approved move. One transaction makes the pair atomic.
      const movedIds = await this.databaseRepository.transaction(async (trx) => {
        const ids = await this.faceRepairRepository.reattributeFaces(from, to, faceIds, trx);
        if (ids.length > 0) {
          const identity = await this.faceIdentityRepository.ensurePersonIdentity(to, trx);
          await this.faceIdentityRepository.replaceFaceIdentities(
            { assetFaceIds: ids, identityId: identity.id, source: 'manual' },
            trx,
          );
        }
        return ids;
      });
      skipped += faceIds.length - movedIds.length;
      if (movedIds.length === 0) {
        continue;
      }
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
    personIds?: string[];
    maxDistance: number;
    voteWindow: number;
  }): AsyncIterableIterator<ReattributionCandidate> {
    // Keyset-paginate the eligible set (B6) and fan the per-face ANN searches out with bounded concurrency (B2)
    // rather than streaming a single cursor and awaiting one search at a time. Each page releases its DB
    // connection before the searches run, and the searches within a page run ~SCAN_SEARCH_CONCURRENCY at a time.
    let afterId: string | undefined;
    for (;;) {
      const page = await this.faceRepairRepository.getEligibleFacePage({
        ownerId: options.ownerId,
        personId: options.personId,
        personIds: options.personIds,
        afterId,
        limit: SCAN_PAGE_SIZE,
      });
      if (page.length === 0) {
        return;
      }
      const candidates = await mapWithConcurrency(page, SCAN_SEARCH_CONCURRENCY, async (face) => {
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
        return {
          assetFaceId: face.assetFaceId,
          currentPersonId: face.personId,
          ...tallyReattribution(face.personId, neighbors),
        };
      });
      for (const candidate of candidates) {
        yield candidate;
      }
      afterId = page.at(-1)!.assetFaceId;
      if (page.length < SCAN_PAGE_SIZE) {
        return;
      }
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

      // Step 10: persist flagged faces then mark scan completed
      await this.faceRepairScanRepository.replaceScanFlaggedFaces(
        scanId,
        allFlaggedFaces.map((f) => ({
          assetFaceId: f.assetFaceId,
          personId: f.currentPersonId,
          suspectedOwnerId: f.suspectedOwnerId,
        })),
      );
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
    if (!latest) {
      return { personId, flaggedFaces: [] };
    }
    const stored = await this.faceRepairScanRepository.getScanFlaggedFaces(latest.id, personId);
    const declineMaps = await this.faceRepairDeclineRepository.getDeclineMaps({
      personIds: [personId],
      assetFaceIds: stored.map((s) => s.assetFaceId),
    });
    const byPerson = new Map([
      [
        personId,
        stored.map((s) => ({
          assetFaceId: s.assetFaceId,
          currentPersonId: personId,
          suspectedOwnerId: s.suspectedOwnerId,
        })),
      ],
    ]);
    applyDeclineFilters(byPerson, declineMaps);
    const flaggedFaces = (byPerson.get(personId) ?? []).map((f) => ({
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
    if (hasFlagged && latest) {
      // Consume the already-persisted flagged-face snapshot from the reviewed scan instead of recomputing the
      // plan via one per-face ANN query in the request (B1: that exceeded reverse-proxy/gateway timeouts at
      // scale). Reading `latest.id`'s stored rows also means apply acts on the exact set the admin reviewed —
      // getPersonFlaggedFaces reads the same rows — rather than re-planning against whatever scan happens to be
      // latest, closing the M1 governance gap. The read's still-on-person eligibility join keeps it safe: a face
      // moved off its cluster since the scan is silently dropped, and executeRepair re-checks at write time.
      const stored = await this.faceRepairScanRepository.getScanFlaggedFacesForPersons(
        latest.id,
        input.approvedPersonIds,
      );
      const declineMaps = await this.faceRepairDeclineRepository.getDeclineMaps({
        personIds: input.approvedPersonIds,
        assetFaceIds: stored.map((s) => s.assetFaceId),
      });
      const byPerson = new Map<string, FlaggedFace[]>();
      for (const face of stored) {
        const list = byPerson.get(face.personId) ?? [];
        list.push({
          assetFaceId: face.assetFaceId,
          currentPersonId: face.personId,
          suspectedOwnerId: face.suspectedOwnerId,
        });
        byPerson.set(face.personId, list);
      }
      // Respect declines made after the scan (during review): same filtering the review page applies at read.
      applyDeclineFilters(byPerson, declineMaps);
      const exclude = new Set(input.excludeFaceIds);
      for (const faces of byPerson.values()) {
        for (const face of faces) {
          if (!exclude.has(face.assetFaceId)) {
            toRepair.push(face);
          }
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
          // Only delete a truly empty source: countEligibleFaces ignores hidden/Manual faces, so gate the delete
          // on countAllFaces to avoid orphaning survivors via the FK's onDelete: SET NULL (A2). It still leaves
          // the (drained) person in personsToDrop so the console snapshot no longer surfaces it.
          if (source && (!source.name || source.name.trim().length === 0)) {
            const remainingAll = await this.faceRepairRepository.countAllFaces(manualMove.personId);
            if (remainingAll === 0) {
              await this.personRepository.delete([manualMove.personId]);
            }
          }
        }
      }
      if (personsToDrop.size > 0) {
        await this.faceRepairScanRepository.removePersonsFromLatestScan([...personsToDrop]);
      }
    }

    return result;
  }

  // Slice 1 of the full per-face resolution (docs/plans/2026-07-10-face-cleanup-full-resolution-design.md):
  // replaces the 2-state `apply` for a single reviewed person. Slice 2 wires the `stay` (soft-decline) bucket
  // on top of Slice 1's move-to-owner path; Slice 3 wires `lock` (durable, owner-agnostic confirm) on the same
  // raw-snapshot membership check. `detach` is still validated (disjoint buckets + snapshot membership) but
  // remains always empty until Slice 5 lands.
  async resolveFaces(input: FaceRepairResolveRequest, resolvedBy: string): Promise<FaceRepairResolveResponse> {
    const { personId, moveToPerson, stay, lock, detach } = input;
    const moveFaceIds = moveToPerson.flatMap((group) => group.faceIds);

    // E16/M19: an empty resolve (nothing to move/stay/lock/detach, and no entireCluster) must be rejected
    // outright rather than silently falling through to an unconditional drain — a plain 400, no side effects.
    // Pure input validation, so it runs before the person is ever touched (concurrency guards included).
    if (
      moveFaceIds.length === 0 &&
      stay.length === 0 &&
      lock.length === 0 &&
      detach.length === 0 &&
      !input.entireCluster
    ) {
      throw new BadRequestException('Resolve request has no faces to act on');
    }

    // Guards reused verbatim from applyRepair (C5), before any snapshot read.
    if (await this.jobRepository.isActive(QueueName.FacialRecognition)) {
      throw new ConflictException('Refusing to apply while facial recognition is active');
    }
    await this.faceRepairScanRepository.failStaleScans(STALE_SCAN_TIMEOUT_MS);
    const latest = await this.faceRepairScanRepository.getLatestScan();
    if (latest && (latest.status === 'pending' || latest.status === 'running')) {
      throw new ConflictException('Refusing to apply while a scan is in progress');
    }

    // E7: a face may resolve only one way in a single request. moveToPerson's groups flatten to one bucket;
    // `stay` is real from this slice on, `lock`/`detach` are still always [] until Slices 3/5 populate them —
    // the check already covers all four buckets so those slices don't need to revisit it.
    const overlapping = findOverlappingIds([moveFaceIds, stay, lock, detach]);
    if (overlapping.length > 0) {
      throw new BadRequestException('A face cannot be resolved more than one way in the same request');
    }

    // Slice 4 (M12/M20, E11/E18): every requested moveToPerson destination must exist and be owned by the
    // SAME user as the reviewed cluster — validated before any snapshot read or mutation, so a stale
    // (deleted/merged since the scan) or cross-owner destination 400s the whole resolve rather than
    // partially committing. The picker only ever lists the cluster owner's own people, but the server
    // independently re-validates: a destination can go stale between scan and resolve, and this also covers
    // any client that bypasses the picker.
    if (moveToPerson.length > 0) {
      const reviewedPerson = await this.personRepository.getById(personId);
      if (!reviewedPerson) {
        throw new BadRequestException('Reviewed person not found');
      }
      const destinationIds = new Set(moveToPerson.map((group) => group.destinationPersonId));
      for (const destinationId of destinationIds) {
        const destination = await this.personRepository.getById(destinationId);
        if (!destination) {
          throw new BadRequestException(`Destination person ${destinationId} does not exist`);
        }
        if (destination.ownerId !== reviewedPerson.ownerId) {
          throw new BadRequestException(`Destination person ${destinationId} is owned by a different user`);
        }
      }
    }

    // Read this person's stored flagged-face snapshot (per-face suspected owner) and apply the same
    // declined-since-scan filtering the review page and applyRepair both use.
    const stored = latest
      ? await this.faceRepairScanRepository.getScanFlaggedFacesForPersons(latest.id, [personId])
      : [];
    // Raw snapshot membership (E15/M14) — a face that was genuinely never flagged for this person has no
    // suspected owner and no keep/lock/detach meaning, and is rejected. This is intentionally NOT
    // decline-filtered: a face already declined toward its stored suspected owner is still a legitimate
    // re-stay target (M22/E20, idempotent via `createDeclines`'s ON CONFLICT DO NOTHING) — only moveToPerson
    // needs the decline-filtered view below, to silently skip rather than re-apply a declined pairing.
    const flaggedIds = new Set(stored.map((face) => face.assetFaceId));
    const snapshotOwnerByFace = new Map(stored.map((face) => [face.assetFaceId, face.suspectedOwnerId]));
    const declineMaps = await this.faceRepairDeclineRepository.getDeclineMaps({
      personIds: [personId],
      assetFaceIds: stored.map((face) => face.assetFaceId),
    });
    const byPerson = new Map<string, FlaggedFace[]>([
      [
        personId,
        stored.map((face) => ({
          assetFaceId: face.assetFaceId,
          currentPersonId: face.personId,
          suspectedOwnerId: face.suspectedOwnerId,
        })),
      ],
    ]);
    applyDeclineFilters(byPerson, declineMaps);
    const resolvable = new Set((byPerson.get(personId) ?? []).map((face) => face.assetFaceId));

    // stay/lock/detach (E15) act only on this person's raw flagged snapshot.
    const unresolvable = findUnresolvableIds([...stay, ...lock, ...detach], flaggedIds);
    if (unresolvable.length > 0) {
      throw new BadRequestException('Some faces are not in the flagged snapshot for this person');
    }

    // moveToPerson: a requested face no longer flagged here — moved off since the scan, or declined since
    // (E1/M9) — is silently skipped rather than rejected; executeRepair's own still-on-source re-check at
    // write time covers any remaining race between this read and the write.
    const toRepair: FlaggedFace[] = [];
    let preSkipped = 0;
    for (const group of moveToPerson) {
      for (const assetFaceId of group.faceIds) {
        if (resolvable.has(assetFaceId)) {
          toRepair.push({ assetFaceId, currentPersonId: personId, suspectedOwnerId: group.destinationPersonId });
        } else {
          preSkipped++;
        }
      }
    }

    const result = await this.executeRepair({
      toRepair,
      reviewOnlyFaces: [],
      reviewOnlyPersonIds: [],
      unAttributableFaces: [],
      perPerson: [],
    });

    // Soft-stay (M4, state 3): write a durable decline against each stayed face's OWN stored suspected owner
    // (never one shared owner — a mixed cluster can point faces at different owners). `createDeclines` is
    // idempotent via its `(assetFaceId, suspectedOwnerId)` ON CONFLICT DO NOTHING, so re-staying an
    // already-declined pairing is a no-op here (M22/E20) rather than a unique-violation.
    const declined =
      stay.length > 0
        ? await this.faceRepairDeclineRepository.createDeclines({
            faces: stay.map((assetFaceId) => ({
              assetFaceId,
              suspectedOwnerId: snapshotOwnerByFace.get(assetFaceId)!,
            })),
            declinedBy: resolvedBy,
          })
        : 0;

    // Confirm/lock (Slice 3, state 4): durably, owner-agnostically lock each `lock`-bucket face to this
    // reviewed person. `insertLocks` is idempotent via the plain unique index on assetFaceId — re-locking an
    // already-locked face (even one whose flaggedIds membership above passed via a stale/declined snapshot row)
    // is a silent no-op, never a unique-violation.
    const locked = lock.length > 0 ? await this.faceRepairLockRepository.insertLocks(lock, personId, resolvedBy) : 0;

    // Empty-unnamed cleanup, reused from applyRepair's manual-move cleanup (A2): only delete a source with
    // ZERO remaining faces of any kind, and only when it was never named.
    const remaining = await this.faceRepairRepository.countEligibleFaces({ personId });
    if (remaining === 0) {
      const source = await this.personRepository.getById(personId);
      if (source && (!source.name || source.name.trim().length === 0)) {
        const remainingAll = await this.faceRepairRepository.countAllFaces(personId);
        if (remainingAll === 0) {
          await this.personRepository.delete([personId]);
        }
      }
    }

    // Drop-on-any-resolution (C5, E13): unlike applyRepair's `moved > 0` gate, a committed resolve always
    // drains the person from the console immediately, even when every flagged face was kept/stayed (zero
    // moves) — the M11 stay-only case, with `lock` still to come in Slice 3. moveToPerson destinations only
    // ever gain faces from this call, so there is no destination to additionally drain this slice.
    await this.faceRepairScanRepository.removePersonsFromLatestScan([personId]);

    return {
      moved: result.moved,
      declined,
      locked,
      detached: 0,
      skipped: result.skipped + preSkipped,
    };
  }

  // Owner-scoped people search for the move-to-chosen-person picker (Slice 4, M17). `ownerId` comes from the
  // route (the reviewed cluster's owner), never from the calling admin — Immich's own `getAllPeople` is
  // self-scoped and cannot serve an admin browsing another user's people.
  async searchOwnerPeople(
    ownerId: string,
    options: { query?: string; page: number },
  ): Promise<{ people: OwnerPersonRow[]; total: number; hasMore: boolean }> {
    return this.faceRepairRepository.searchOwnerPeople(ownerId, {
      query: options.query,
      page: options.page,
      size: OWNER_PEOPLE_PAGE_SIZE,
    });
  }

  // Create a new person under `ownerId` for the move-to-chosen-person picker's "Create new person" row
  // (Slice 4, M18). The returned id is immediately usable as a `moveToPerson[].destinationPersonId` for a
  // face owned by the same user — it passes the cross-owner guard above by construction.
  async createOwnerPerson(ownerId: string, name: string): Promise<{ id: string }> {
    const person = await this.personRepository.create({ ownerId, name });
    return { id: person.id };
  }

  private async collectClusterFaceIds(personId: string): Promise<string[]> {
    const ids: string[] = [];
    for await (const row of this.faceRepairRepository.streamEligibleFaces({ personId })) {
      ids.push(row.assetFaceId);
    }
    return ids;
  }
}
