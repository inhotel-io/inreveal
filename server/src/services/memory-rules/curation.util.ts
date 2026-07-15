/**
 * Small, dependency-free helpers shared by the memory rules for curating and scoring
 * candidate asset sets. Kept pure so the rules stay trivially unit-testable.
 */

interface TimedAsset {
  id: string;
  localDateTime: Date;
}

/**
 * Pick `count` items spread evenly across `items` (first and last always included when
 * `count >= 2`). Ported verbatim from the original inline logic in `recent-trip.rule.ts`.
 */
export const pickEvenlySpaced = <T>(items: T[], count: number): T[] => {
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
};

/** Sort assets chronologically, evenly sample down to `cap`, and return their ids in order. */
export const sampleAssetsByTime = (assets: TimedAsset[], cap: number): string[] => {
  const sorted = [...assets].sort((left, right) => left.localDateTime.getTime() - right.localDateTime.getTime());
  return pickEvenlySpaced(sorted, cap).map((asset) => asset.id);
};

/** The lower-middle `localDateTime` after sorting ascending — a representative `memoryAt`. */
export const medianTime = (assets: Pick<TimedAsset, 'localDateTime'>[]): Date => {
  const sorted = [...assets].sort((left, right) => left.localDateTime.getTime() - right.localDateTime.getTime());
  return sorted[Math.floor((sorted.length - 1) / 2)]!.localDateTime;
};

export interface DominantGroup<T> {
  key: string;
  items: T[];
  ratio: number;
}

/**
 * Group `items` by `key` and return the largest group with its share of the total.
 * Ties break toward the larger group, then the lexicographically smaller key, so the
 * result is deterministic across runs. Empty input yields an empty group with ratio 0.
 */
export const dominantBy = <T>(items: T[], key: (item: T) => string): DominantGroup<T> => {
  if (items.length === 0) {
    return { key: '', items: [], ratio: 0 };
  }

  const groups = new Map<string, T[]>();
  for (const item of items) {
    const groupKey = key(item);
    const group = groups.get(groupKey) ?? [];
    group.push(item);
    groups.set(groupKey, group);
  }

  let bestKey = '';
  let bestItems: T[] = [];
  for (const [groupKey, group] of groups) {
    if (
      group.length > bestItems.length ||
      (group.length === bestItems.length && (bestKey === '' || groupKey < bestKey))
    ) {
      bestKey = groupKey;
      bestItems = group;
    }
  }

  return { key: bestKey, items: bestItems, ratio: bestItems.length / items.length };
};

/** Small recency nudge (0–10) so newer memories edge out older ones without dominating count. */
export const recencyBonus = (year: number, targetYear: number): number => Math.max(0, 10 - (targetYear - year));

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** The English name of a 1-based month, used in memory titles. */
export const monthName = (month: number): string => MONTH_NAMES[month - 1]!;
