import { AssetRepository, MemoryPeriodAsset } from 'src/repositories/asset.repository';
import { dominantBy, recencyBonus, sampleAssetsByTime } from 'src/services/memory-rules/curation.util';
import { MemoryRule, MemoryRuleCandidate, MemoryRuleContext } from 'src/services/memory-rules/memory-rule.interface';

const placeKeyOf = (asset: MemoryPeriodAsset): string => `${asset.country ?? ''}:${asset.city}`.toLowerCase();

/** A usable place needs a non-blank city (EXIF city is usually null when absent, but can be ''). */
const hasCity = (asset: MemoryPeriodAsset): boolean => asset.city !== null && asset.city.trim() !== '';

/** "On this day in Lisbon" — a past year's on-this-day photos dominated by a single city. */
export class OnThisDayPlaceMemoryRule implements MemoryRule {
  readonly id = 'on_this_day_place';
  private static readonly MIN_ASSETS = 4;
  private static readonly MIN_DOMINANCE = 0.6;
  private static readonly MAX_YEARS = 3;
  private static readonly ASSET_CAP = 8;

  constructor(private assetRepository: Pick<AssetRepository, 'getMemoryAssetsForPeriod'>) {}

  async evaluate({ ownerId, target }: MemoryRuleContext): Promise<MemoryRuleCandidate[]> {
    const assets = await this.assetRepository.getMemoryAssetsForPeriod(ownerId, {
      months: [target.month],
      day: target.day,
      takenBefore: target.endOf('day').toJSDate(),
    });

    const byYear = new Map<number, MemoryPeriodAsset[]>();
    for (const asset of assets) {
      if (asset.year >= target.year || !hasCity(asset)) {
        continue;
      }
      const yearAssets = byYear.get(asset.year) ?? [];
      yearAssets.push(asset);
      byYear.set(asset.year, yearAssets);
    }

    const mm = String(target.month).padStart(2, '0');
    const dd = String(target.day).padStart(2, '0');
    const candidates: MemoryRuleCandidate[] = [];

    for (const [year, geotagged] of byYear) {
      const dominant = dominantBy(geotagged, placeKeyOf);
      if (
        dominant.items.length < OnThisDayPlaceMemoryRule.MIN_ASSETS ||
        dominant.ratio < OnThisDayPlaceMemoryRule.MIN_DOMINANCE
      ) {
        continue;
      }

      const city = dominant.items[0]!.city!;
      const count = dominant.items.length;
      candidates.push({
        ruleId: this.id,
        dedupeKey: `on_this_day_place:${year}-${mm}-${dd}:${dominant.key}`,
        title: `On this day in ${city}`,
        subtitle: `${count} photos from ${year}`,
        score: 100 + count * 3 + recencyBonus(year, target.year),
        assetIds: sampleAssetsByTime(dominant.items, OnThisDayPlaceMemoryRule.ASSET_CAP),
        memoryAt: target.set({ year }),
        context: { year, city, country: dominant.items[0]!.country, count },
      });
    }

    return candidates.toSorted((left, right) => right.score - left.score).slice(0, OnThisDayPlaceMemoryRule.MAX_YEARS);
  }
}
