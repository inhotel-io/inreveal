import { TripCandidateService } from 'src/services/trip-candidate.service';

const cluster = ({
  country,
  city,
  assetCount,
  dayCount,
  firstDate = '2026-04-15T00:00:00Z',
  lastDate = '2026-04-17T00:00:00Z',
}: {
  country: string;
  city: string | null;
  assetCount: number;
  dayCount: number;
  firstDate?: string;
  lastDate?: string;
}) => ({
  country,
  city,
  assetCount,
  dayCount,
  firstDate: new Date(firstDate),
  lastDate: new Date(lastDate),
});

describe(TripCandidateService.name, () => {
  it('detects a high-confidence non-home trip from baseline and recent clusters', async () => {
    const assetRepository = {
      getMemoryLocationClusters: vi
        .fn()
        .mockResolvedValueOnce([cluster({ country: 'Germany', city: 'Berlin', assetCount: 20, dayCount: 12 })])
        .mockResolvedValueOnce([cluster({ country: 'France', city: 'Paris', assetCount: 9, dayCount: 3 })]),
    };
    const service = new TripCandidateService(assetRepository);

    const [candidate] = await service.findRecentTripCandidates({
      ownerId: 'user-1',
      targetDate: new Date('2026-04-23T12:00:00Z'),
      lookbackDays: 30,
      maxCandidates: 3,
    });

    expect(assetRepository.getMemoryLocationClusters).toHaveBeenNthCalledWith(1, 'user-1', {
      takenAfter: new Date('2025-12-24T00:00:00.000Z'),
      takenBefore: new Date('2026-03-23T23:59:59.999Z'),
    });
    expect(assetRepository.getMemoryLocationClusters).toHaveBeenNthCalledWith(2, 'user-1', {
      takenAfter: new Date('2026-03-24T00:00:00.000Z'),
      takenBefore: new Date('2026-04-23T23:59:59.999Z'),
    });
    expect(candidate).toMatchObject({
      dedupeKey: 'trip:france:paris:2026-04-15:2026-04-17',
      title: 'Recent trip to Paris, France',
      subtitle: '9 photos over 3 days',
      countries: ['France'],
      states: [],
      cities: ['Paris'],
      assetCount: 9,
      albumAssetCount: 9,
      excludedDuplicateCount: 0,
      dayCount: 3,
      score: 74,
      confidence: 'high',
      placeKey: 'france:paris',
      placeLabel: 'Paris, France',
      source: {
        kind: 'tripCandidate',
        dedupeKey: 'trip:france:paris:2026-04-15:2026-04-17',
        takenAfter: new Date('2026-04-15T00:00:00Z'),
        takenBefore: new Date('2026-04-17T00:00:00Z'),
        places: [{ country: 'France', city: 'Paris' }],
        placeLabels: ['Paris, France'],
      },
    });
  });

  it('returns no candidates for home-only recent clusters', async () => {
    const assetRepository = {
      getMemoryLocationClusters: vi
        .fn()
        .mockResolvedValueOnce([cluster({ country: 'Germany', city: 'Berlin', assetCount: 20, dayCount: 12 })])
        .mockResolvedValueOnce([cluster({ country: 'Germany', city: 'Berlin', assetCount: 9, dayCount: 3 })]),
    };
    const service = new TripCandidateService(assetRepository);

    await expect(service.findRecentTripCandidates({ ownerId: 'user-1' })).resolves.toEqual([]);
  });

  it('returns low-confidence candidates instead of failing when home baseline is ambiguous', async () => {
    const assetRepository = {
      getMemoryLocationClusters: vi
        .fn()
        .mockResolvedValueOnce([
          cluster({ country: 'Germany', city: 'Berlin', assetCount: 10, dayCount: 6 }),
          cluster({ country: 'Austria', city: 'Vienna', assetCount: 9, dayCount: 6 }),
        ])
        .mockResolvedValueOnce([cluster({ country: 'France', city: 'Paris', assetCount: 8, dayCount: 2 })]),
    };
    const service = new TripCandidateService(assetRepository);

    const [candidate] = await service.findRecentTripCandidates({
      ownerId: 'user-1',
      targetDate: new Date('2026-04-23T12:00:00Z'),
    });

    expect(candidate).toMatchObject({
      title: 'Recent trip to Paris, France',
      confidence: 'low',
      score: 48,
    });
  });

  it('generates stable dedupe keys from place and trip window rather than evaluation date', async () => {
    const assetRepository = {
      getMemoryLocationClusters: vi
        .fn()
        .mockResolvedValue([cluster({ country: 'Germany', city: 'Berlin', assetCount: 20, dayCount: 12 })])
        .mockResolvedValueOnce([cluster({ country: 'Germany', city: 'Berlin', assetCount: 20, dayCount: 12 })])
        .mockResolvedValueOnce([cluster({ country: 'France', city: 'Paris', assetCount: 9, dayCount: 3 })])
        .mockResolvedValueOnce([cluster({ country: 'Germany', city: 'Berlin', assetCount: 20, dayCount: 12 })])
        .mockResolvedValueOnce([cluster({ country: 'France', city: 'Paris', assetCount: 9, dayCount: 3 })]),
    };
    const service = new TripCandidateService(assetRepository);

    const [first] = await service.findRecentTripCandidates({
      ownerId: 'user-1',
      targetDate: new Date('2026-04-23T12:00:00Z'),
    });
    const [second] = await service.findRecentTripCandidates({
      ownerId: 'user-1',
      targetDate: new Date('2026-04-30T12:00:00Z'),
    });

    expect(first?.dedupeKey).toBe('trip:france:paris:2026-04-15:2026-04-17');
    expect(second?.dedupeKey).toBe(first?.dedupeKey);
  });
});
