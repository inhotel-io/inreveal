export interface YearData {
  year: number;
  count: number;
  volumePercent: number;
}

export interface MonthData {
  month: number;
  label: string;
  count: number;
}

/**
 * Short month names, index 0 = January. Defaults to `en-US` to match the other fixed-format date
 * strings in the filter UI; pass a locale to localise.
 */
export function getMonthLabels(locale = 'en-US'): string[] {
  const format = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  return Array.from({ length: 12 }, (_, index) => format.format(new Date(Date.UTC(2000, index, 1))));
}

export function aggregateYears(buckets: Array<{ timeBucket: string; count: number }>): YearData[] {
  const yearMap = new Map<number, number>();
  for (const b of buckets) {
    const year = new Date(b.timeBucket).getUTCFullYear();
    yearMap.set(year, (yearMap.get(year) ?? 0) + b.count);
  }
  const maxCount = Math.max(...yearMap.values(), 1);
  return [...yearMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, count]) => ({
      year,
      count,
      volumePercent: Math.round((count / maxCount) * 100),
    }));
}

export function getMonthsForYear(
  buckets: Array<{ timeBucket: string; count: number }>,
  year: number,
  locale?: string,
): MonthData[] {
  const monthMap = new Map<number, number>();
  for (const b of buckets) {
    const d = new Date(b.timeBucket);
    if (d.getUTCFullYear() === year) {
      const month = d.getUTCMonth() + 1;
      monthMap.set(month, (monthMap.get(month) ?? 0) + b.count);
    }
  }
  return getMonthLabels(locale).map((label, i) => ({
    month: i + 1,
    label,
    count: monthMap.get(i + 1) ?? 0,
  }));
}
