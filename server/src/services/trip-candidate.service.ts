import { DateTime } from 'luxon';
import { AssetRepository, MemoryLocationCluster } from 'src/repositories/asset.repository';

export type TripCandidateConfidence = 'high' | 'medium' | 'low';

export interface TripCandidateRequest {
  ownerId: string;
  targetDate?: Date;
  lookbackDays?: number;
  baselineDays?: number;
  maxCandidates?: number;
}

export interface TripCandidateSource {
  kind: 'tripCandidate';
  dedupeKey: string;
  takenAfter: Date;
  takenBefore: Date;
  places: Array<{ country: string; state?: string | null; city?: string | null }>;
  placeLabels: string[];
}

export interface TripCandidate {
  dedupeKey: string;
  title: string;
  subtitle: string;
  countries: string[];
  states: string[];
  cities: string[];
  takenAfter: Date;
  takenBefore: Date;
  assetCount: number;
  albumAssetCount: number;
  excludedDuplicateCount: number;
  dayCount: number;
  score: number;
  confidence: TripCandidateConfidence;
  source: TripCandidateSource;
  placeKey: string;
  placeLabel: string;
}

export class TripCandidateService {
  private static readonly HOME_DOMINANCE_RATIO = 1.25;

  constructor(private assetRepository: Pick<AssetRepository, 'getMemoryLocationClusters'>) {}

  async findRecentTripCandidates({
    ownerId,
    targetDate,
    lookbackDays = 30,
    baselineDays = 90,
    maxCandidates = 3,
  }: TripCandidateRequest): Promise<TripCandidate[]> {
    const target = DateTime.fromJSDate(targetDate ?? new Date(), { zone: 'utc' }).endOf('day');
    const recentFrom = target.minus({ days: lookbackDays }).startOf('day');
    const baselineFrom = recentFrom.minus({ days: baselineDays });
    const baselineTo = recentFrom.minus({ days: 1 }).endOf('day');

    const [baseline, recent] = await Promise.all([
      this.assetRepository.getMemoryLocationClusters(ownerId, {
        takenAfter: baselineFrom.toJSDate(),
        takenBefore: baselineTo.toJSDate(),
      }),
      this.assetRepository.getMemoryLocationClusters(ownerId, {
        takenAfter: recentFrom.toJSDate(),
        takenBefore: target.toJSDate(),
      }),
    ]);

    const home = this.resolveHomeBaseline(baseline);
    const candidates = recent
      .filter((item) => this.isQualifyingTrip(item))
      .filter((item) => !home.cluster || home.ambiguous || this.isAwayFromHome(item, home.cluster))
      .map((item) => this.toTripCandidate(item, home.ambiguous ? 'low' : 'high'))
      .toSorted((left, right) => right.score - left.score);

    return candidates.slice(0, maxCandidates);
  }

  private resolveHomeBaseline(baseline: MemoryLocationCluster[]) {
    const [home, runnerUp] = baseline;
    const ambiguous =
      !home?.country ||
      (!!runnerUp &&
        runnerUp.country !== home.country &&
        runnerUp.assetCount >= home.assetCount / TripCandidateService.HOME_DOMINANCE_RATIO);

    return { cluster: home?.country ? home : undefined, ambiguous };
  }

  private isQualifyingTrip(item: MemoryLocationCluster) {
    return !!item.country && item.assetCount >= 7 && item.dayCount >= 2;
  }

  private isAwayFromHome(item: MemoryLocationCluster, home: MemoryLocationCluster) {
    if (item.country !== home.country) {
      return true;
    }

    return !!home.city && !!item.city && item.city !== home.city;
  }

  private toTripCandidate(item: MemoryLocationCluster, confidence: TripCandidateConfidence): TripCandidate {
    const country = item.country!;
    const city = item.city ?? null;
    const placeKey = `${country}:${city ?? ''}`.toLowerCase();
    const placeLabel = city ? `${city}, ${country}` : country;
    const firstDate = DateTime.fromJSDate(item.firstDate, { zone: 'utc' }).toFormat('yyyy-MM-dd');
    const lastDate = DateTime.fromJSDate(item.lastDate, { zone: 'utc' }).toFormat('yyyy-MM-dd');
    const dedupeKey = `trip:${placeKey}:${firstDate}:${lastDate}`;
    const baseScore = 50 + item.dayCount * 5 + Math.min(item.assetCount, 20);
    const score = confidence === 'low' ? Math.max(1, baseScore - 20) : baseScore;

    return {
      dedupeKey,
      title: `Recent trip to ${placeLabel}`,
      subtitle: `${item.assetCount} photos over ${item.dayCount} days`,
      countries: [country],
      states: [],
      cities: city ? [city] : [],
      takenAfter: item.firstDate,
      takenBefore: item.lastDate,
      assetCount: item.assetCount,
      albumAssetCount: item.assetCount,
      excludedDuplicateCount: 0,
      dayCount: item.dayCount,
      score,
      confidence,
      source: {
        kind: 'tripCandidate',
        dedupeKey,
        takenAfter: item.firstDate,
        takenBefore: item.lastDate,
        places: [{ country, city }],
        placeLabels: [placeLabel],
      },
      placeKey,
      placeLabel,
    };
  }
}
