import { DateTime } from 'luxon';
import { AssetOrderWithRandom, MemoryType } from 'src/enum';
import { AssetRepository, MemoryAsset } from 'src/repositories/asset.repository';
import { MemoryRepository } from 'src/repositories/memory.repository';
import { MemoryRule, MemoryRuleCandidate, MemoryRuleContext } from 'src/services/memory-rules/memory-rule.interface';
import { TripCandidateService } from 'src/services/trip-candidate.service';

export class RecentTripMemoryRule implements MemoryRule {
  readonly id = 'recent_trip';
  private static readonly BURST_WINDOW_MS = 2 * 60 * 1000;
  private static readonly SMALL_TRIP_MAX = 6;

  constructor(
    private assetRepository: Pick<AssetRepository, 'getMemoryLocationClusters' | 'getMemoryAssetsForLocation'>,
    private memoryRepository: Pick<MemoryRepository, 'search'>,
    private tripCandidateService = new TripCandidateService(assetRepository),
  ) {}

  async evaluate({ ownerId, target }: MemoryRuleContext): Promise<MemoryRuleCandidate[]> {
    const recentFrom = target.minus({ days: 30 }).startOf('day');
    const recentTo = target.endOf('day');

    const [tripCandidates, recentRuleMemories] = await Promise.all([
      this.tripCandidateService.findRecentTripCandidates({
        ownerId,
        targetDate: target.startOf('day').toJSDate(),
        lookbackDays: 30,
        maxCandidates: 3,
      }),
      this.memoryRepository.search(ownerId, {
        type: MemoryType.Rule,
        size: 20,
        order: AssetOrderWithRandom.Desc,
      }),
    ]);

    const candidate = tripCandidates.find((item) => item.confidence === 'high');
    if (!candidate) {
      return [];
    }

    const place = candidate.source.places[0];
    if (!place?.country) {
      return [];
    }

    const isCoolingDown = recentRuleMemories.some((memory) => {
      const data = memory.data as Record<string, unknown>;
      if (data.ruleId !== this.id) {
        return false;
      }

      const context = data.context as Record<string, unknown> | undefined;
      const seenPlaceKey = typeof context?.placeKey === 'string' ? context.placeKey : undefined;
      return seenPlaceKey === candidate.placeKey && DateTime.fromJSDate(memory.memoryAt) >= target.minus({ days: 30 });
    });

    if (isCoolingDown) {
      return [];
    }

    const locationAssets = await this.assetRepository.getMemoryAssetsForLocation(ownerId, {
      country: place.country,
      city: place.city ?? null,
      takenAfter: recentFrom.toJSDate(),
      takenBefore: recentTo.toJSDate(),
    });
    const assetIds = this.curateTripAssets(locationAssets);

    const dedupeDay = target.toFormat('yyyy-MM-dd');

    return [
      {
        ruleId: this.id,
        dedupeKey: `recent_trip:${candidate.placeKey}:${dedupeDay}`,
        title: candidate.title,
        subtitle: candidate.subtitle,
        score: candidate.score,
        assetIds,
        memoryAt: target,
        context: {
          placeKey: candidate.placeKey,
          placeLabel: candidate.placeLabel,
          country: place.country,
          city: place.city,
          assetCount: candidate.assetCount,
          dayCount: candidate.dayCount,
          tripWindowStart: candidate.takenAfter.toISOString(),
          tripWindowEnd: candidate.takenBefore.toISOString(),
        },
      },
    ];
  }

  private curateTripAssets(assets: MemoryAsset[]): string[] {
    const representatives = this.collapseBurstAssets(assets);
    if (representatives.length <= RecentTripMemoryRule.SMALL_TRIP_MAX) {
      return representatives.map(({ id }) => id);
    }

    const dayBuckets = this.groupAssetsByDay(representatives);
    const targetSize = this.getTripTargetSize(dayBuckets.length, representatives.length);
    const selected = this.pickDayCoverage(dayBuckets, targetSize);
    const selectedIds = new Set(selected.map(({ id }) => id));

    if (selected.length < targetSize) {
      const remaining = representatives.filter(({ id }) => !selectedIds.has(id));
      selected.push(...this.pickEvenlySpaced(remaining, targetSize - selected.length));
    }

    return [...selected]
      .toSorted((left, right) => left.localDateTime.getTime() - right.localDateTime.getTime())
      .map(({ id }) => id);
  }

  private collapseBurstAssets(assets: MemoryAsset[]): MemoryAsset[] {
    const representatives: MemoryAsset[] = [];
    let previous: MemoryAsset | undefined;

    for (const asset of assets) {
      if (
        !previous ||
        asset.localDateTime.getTime() - previous.localDateTime.getTime() > RecentTripMemoryRule.BURST_WINDOW_MS
      ) {
        representatives.push(asset);
      }
      previous = asset;
    }

    return representatives;
  }

  private groupAssetsByDay(assets: MemoryAsset[]): MemoryAsset[][] {
    const byDay = new Map<string, MemoryAsset[]>();

    for (const asset of assets) {
      const dayKey = DateTime.fromJSDate(asset.localDateTime, { zone: 'utc' }).toISODate();
      const dayAssets = byDay.get(dayKey!) ?? [];
      dayAssets.push(asset);
      byDay.set(dayKey!, dayAssets);
    }

    return [...byDay.values()];
  }

  private getTripTargetSize(dayCount: number, representativeCount: number) {
    if (representativeCount <= RecentTripMemoryRule.SMALL_TRIP_MAX) {
      return representativeCount;
    }

    if (dayCount >= 5 || representativeCount >= 18) {
      return 10;
    }

    if (dayCount >= 4 || representativeCount >= 12) {
      return 8;
    }

    return 7;
  }

  private pickDayCoverage(dayBuckets: MemoryAsset[][], targetSize: number): MemoryAsset[] {
    const buckets = dayBuckets.length <= targetSize ? dayBuckets : this.pickEvenlySpaced(dayBuckets, targetSize);
    return buckets.map((assets) => assets[Math.floor((assets.length - 1) / 2)]!);
  }

  private pickEvenlySpaced<T>(items: T[], count: number): T[] {
    if (count <= 0 || items.length === 0) {
      return [];
    }

    if (count >= items.length) {
      return [...items];
    }

    if (count === 1) {
      return [items[Math.floor((items.length - 1) / 2)]!];
    }

    const indexes = Array.from({ length: count }, (_, index) => Math.round((index * (items.length - 1)) / (count - 1)));

    return indexes.map((index) => items[index]!);
  }
}
