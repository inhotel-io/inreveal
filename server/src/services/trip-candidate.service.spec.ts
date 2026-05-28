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

const dayBucket = ({
  localDate,
  country,
  state = null,
  city,
  assetCount,
  firstDate = `${localDate}T09:00:00Z`,
  lastDate = `${localDate}T17:00:00Z`,
}: {
  localDate: string;
  country: string | null;
  state?: string | null;
  city: string | null;
  assetCount: number;
  firstDate?: string;
  lastDate?: string;
}) => ({
  localDate: new Date(`${localDate}T00:00:00Z`),
  country,
  state,
  city,
  assetCount,
  firstDate: new Date(firstDate),
  lastDate: new Date(lastDate),
});

const setup = () => {
  const assetRepository = {
    getMemoryLocationClusters: vi.fn(),
    getMemoryLocationDayBuckets: vi.fn(),
  };

  return { assetRepository, service: new TripCandidateService(assetRepository) };
};

describe(TripCandidateService.name, () => {
  it('detects a high-confidence non-home trip from baseline clusters and recent day buckets', async () => {
    const { assetRepository, service } = setup();
    assetRepository.getMemoryLocationClusters.mockResolvedValueOnce([
      cluster({ country: 'Germany', city: 'Berlin', assetCount: 20, dayCount: 12 }),
    ]);
    assetRepository.getMemoryLocationDayBuckets.mockResolvedValueOnce([
      dayBucket({ localDate: '2026-04-15', country: 'France', city: 'Paris', assetCount: 3 }),
      dayBucket({ localDate: '2026-04-16', country: 'France', city: 'Paris', assetCount: 3 }),
      dayBucket({ localDate: '2026-04-17', country: 'France', city: 'Paris', assetCount: 3 }),
    ]);

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
    expect(assetRepository.getMemoryLocationDayBuckets).toHaveBeenCalledWith('user-1', {
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
        takenAfter: new Date('2026-04-15T09:00:00Z'),
        takenBefore: new Date('2026-04-17T17:00:00Z'),
        places: [{ country: 'France', city: 'Paris' }],
        placeLabels: ['Paris, France'],
      },
    });
  });

  it('falls back to recent location clusters when day buckets are unavailable', async () => {
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
    });

    expect(assetRepository.getMemoryLocationClusters).toHaveBeenNthCalledWith(2, 'user-1', {
      takenAfter: new Date('2026-03-24T00:00:00.000Z'),
      takenBefore: new Date('2026-04-23T23:59:59.999Z'),
    });
    expect(candidate).toMatchObject({
      dedupeKey: 'trip:france:paris:2026-04-15:2026-04-17',
      title: 'Recent trip to Paris, France',
      subtitle: '9 photos over 3 days',
      confidence: 'high',
      placeKey: 'france:paris',
    });
  });

  it('returns no candidates for home-only recent day buckets', async () => {
    const { assetRepository, service } = setup();
    assetRepository.getMemoryLocationClusters.mockResolvedValueOnce([
      cluster({ country: 'Germany', city: 'Berlin', assetCount: 20, dayCount: 12 }),
    ]);
    assetRepository.getMemoryLocationDayBuckets.mockResolvedValueOnce([
      dayBucket({ localDate: '2026-04-15', country: 'Germany', city: 'Berlin', assetCount: 4 }),
      dayBucket({ localDate: '2026-04-16', country: 'Germany', city: 'Berlin', assetCount: 4 }),
      dayBucket({ localDate: '2026-04-17', country: 'Germany', city: 'Berlin', assetCount: 3 }),
    ]);

    await expect(service.findRecentTripCandidates({ ownerId: 'user-1' })).resolves.toEqual([]);
  });

  it('returns low-confidence candidates instead of failing when home baseline is ambiguous', async () => {
    const { assetRepository, service } = setup();
    assetRepository.getMemoryLocationClusters.mockResolvedValueOnce([
      cluster({ country: 'Germany', city: 'Berlin', assetCount: 10, dayCount: 6 }),
      cluster({ country: 'Austria', city: 'Vienna', assetCount: 9, dayCount: 6 }),
    ]);
    assetRepository.getMemoryLocationDayBuckets.mockResolvedValueOnce([
      dayBucket({ localDate: '2026-04-15', country: 'France', city: 'Paris', assetCount: 4 }),
      dayBucket({ localDate: '2026-04-16', country: 'France', city: 'Paris', assetCount: 4 }),
    ]);

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
    const { assetRepository, service } = setup();
    assetRepository.getMemoryLocationClusters
      .mockResolvedValueOnce([cluster({ country: 'Germany', city: 'Berlin', assetCount: 20, dayCount: 12 })])
      .mockResolvedValueOnce([cluster({ country: 'Germany', city: 'Berlin', assetCount: 20, dayCount: 12 })]);
    assetRepository.getMemoryLocationDayBuckets
      .mockResolvedValueOnce([
        dayBucket({ localDate: '2026-04-15', country: 'France', city: 'Paris', assetCount: 3 }),
        dayBucket({ localDate: '2026-04-16', country: 'France', city: 'Paris', assetCount: 3 }),
        dayBucket({ localDate: '2026-04-17', country: 'France', city: 'Paris', assetCount: 3 }),
      ])
      .mockResolvedValueOnce([
        dayBucket({ localDate: '2026-04-15', country: 'France', city: 'Paris', assetCount: 3 }),
        dayBucket({ localDate: '2026-04-16', country: 'France', city: 'Paris', assetCount: 3 }),
        dayBucket({ localDate: '2026-04-17', country: 'France', city: 'Paris', assetCount: 3 }),
      ]);

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

  it('merges adjacent travel days into one multi-city candidate with deduplicated labels', async () => {
    const { assetRepository, service } = setup();
    assetRepository.getMemoryLocationClusters.mockResolvedValueOnce([
      cluster({ country: 'Germany', city: 'Berlin', assetCount: 30, dayCount: 20 }),
    ]);
    assetRepository.getMemoryLocationDayBuckets.mockResolvedValueOnce([
      dayBucket({ localDate: '2026-04-15', country: 'France', state: 'Ile-de-France', city: 'Paris', assetCount: 3 }),
      dayBucket({
        localDate: '2026-04-16',
        country: 'France',
        state: 'Auvergne-Rhone-Alpes',
        city: 'Lyon',
        assetCount: 4,
      }),
      dayBucket({ localDate: '2026-04-17', country: 'France', state: 'Ile-de-France', city: 'Paris', assetCount: 2 }),
    ]);

    const [candidate] = await service.findRecentTripCandidates({
      ownerId: 'user-1',
      targetDate: new Date('2026-04-23T12:00:00Z'),
    });

    expect(candidate).toMatchObject({
      dedupeKey: 'trip:france:paris+france:lyon:2026-04-15:2026-04-17',
      title: 'Recent trip to France',
      subtitle: '9 photos over 3 days',
      countries: ['France'],
      states: ['Ile-de-France', 'Auvergne-Rhone-Alpes'],
      cities: ['Paris', 'Lyon'],
      assetCount: 9,
      dayCount: 3,
      placeKey: 'france:paris+france:lyon',
      placeLabel: 'France',
      source: {
        places: [
          { country: 'France', state: 'Ile-de-France', city: 'Paris' },
          { country: 'France', state: 'Auvergne-Rhone-Alpes', city: 'Lyon' },
        ],
        placeLabels: ['Paris, France', 'Lyon, France'],
      },
    });
    expect(candidate?.takenAfter).toEqual(new Date('2026-04-15T09:00:00Z'));
    expect(candidate?.takenBefore).toEqual(new Date('2026-04-17T17:00:00Z'));
  });

  it('allows one no-photo day inside one cross-border trip', async () => {
    const { assetRepository, service } = setup();
    assetRepository.getMemoryLocationClusters.mockResolvedValueOnce([
      cluster({ country: 'Germany', city: 'Berlin', assetCount: 30, dayCount: 20 }),
    ]);
    assetRepository.getMemoryLocationDayBuckets.mockResolvedValueOnce([
      dayBucket({ localDate: '2026-04-15', country: 'France', city: 'Paris', assetCount: 4 }),
      dayBucket({ localDate: '2026-04-17', country: 'Italy', city: 'Rome', assetCount: 4 }),
    ]);

    const [candidate] = await service.findRecentTripCandidates({
      ownerId: 'user-1',
      targetDate: new Date('2026-04-23T12:00:00Z'),
    });

    expect(candidate).toMatchObject({
      dedupeKey: 'trip:france:paris+italy:rome:2026-04-15:2026-04-17',
      title: 'Recent trip to France and Italy',
      subtitle: '8 photos over 2 days',
      countries: ['France', 'Italy'],
      cities: ['Paris', 'Rome'],
      assetCount: 8,
      dayCount: 2,
      placeKey: 'france:paris+italy:rome',
      placeLabel: 'France and Italy',
      source: {
        places: [
          { country: 'France', state: null, city: 'Paris' },
          { country: 'Italy', state: null, city: 'Rome' },
        ],
        placeLabels: ['Paris, France', 'Rome, Italy'],
      },
    });
  });

  it('keeps source places distinct when the same city and country appear in different states', async () => {
    const { assetRepository, service } = setup();
    assetRepository.getMemoryLocationClusters.mockResolvedValueOnce([
      cluster({ country: 'Germany', city: 'Berlin', assetCount: 30, dayCount: 20 }),
    ]);
    assetRepository.getMemoryLocationDayBuckets.mockResolvedValueOnce([
      dayBucket({
        localDate: '2026-04-15',
        country: 'USA',
        state: 'Illinois',
        city: 'Springfield',
        assetCount: 4,
      }),
      dayBucket({
        localDate: '2026-04-16',
        country: 'USA',
        state: 'Massachusetts',
        city: 'Springfield',
        assetCount: 4,
      }),
    ]);

    const [candidate] = await service.findRecentTripCandidates({
      ownerId: 'user-1',
      targetDate: new Date('2026-04-23T12:00:00Z'),
    });

    expect(candidate).toMatchObject({
      dedupeKey: 'trip:usa:illinois:springfield+usa:massachusetts:springfield:2026-04-15:2026-04-16',
      states: ['Illinois', 'Massachusetts'],
      cities: ['Springfield'],
      placeKey: 'usa:illinois:springfield+usa:massachusetts:springfield',
      source: {
        places: [
          { country: 'USA', state: 'Illinois', city: 'Springfield' },
          { country: 'USA', state: 'Massachusetts', city: 'Springfield' },
        ],
        placeLabels: ['Springfield, Illinois, USA', 'Springfield, Massachusetts, USA'],
      },
    });
  });

  it('does not treat an in-window home photo day as a no-photo gap', async () => {
    const { assetRepository, service } = setup();
    assetRepository.getMemoryLocationClusters.mockResolvedValueOnce([
      cluster({ country: 'Germany', city: 'Berlin', assetCount: 30, dayCount: 20 }),
    ]);
    assetRepository.getMemoryLocationDayBuckets.mockResolvedValueOnce([
      dayBucket({ localDate: '2026-04-15', country: 'France', city: 'Paris', assetCount: 4 }),
      dayBucket({ localDate: '2026-04-16', country: 'Germany', city: 'Berlin', assetCount: 6 }),
      dayBucket({ localDate: '2026-04-17', country: 'Italy', city: 'Rome', assetCount: 4 }),
      dayBucket({ localDate: '2026-04-18', country: 'Italy', city: 'Rome', assetCount: 4 }),
    ]);

    const candidates = await service.findRecentTripCandidates({
      ownerId: 'user-1',
      targetDate: new Date('2026-04-23T12:00:00Z'),
      maxCandidates: 3,
    });

    expect(candidates.map((candidate) => candidate.dedupeKey)).toEqual([
      'trip:italy:rome:2026-04-17:2026-04-18',
    ]);
  });

  it('keeps clearly separate trips as separate candidates', async () => {
    const { assetRepository, service } = setup();
    assetRepository.getMemoryLocationClusters.mockResolvedValueOnce([
      cluster({ country: 'Germany', city: 'Berlin', assetCount: 30, dayCount: 20 }),
    ]);
    assetRepository.getMemoryLocationDayBuckets.mockResolvedValueOnce([
      dayBucket({ localDate: '2026-04-01', country: 'France', city: 'Paris', assetCount: 4 }),
      dayBucket({ localDate: '2026-04-02', country: 'France', city: 'Paris', assetCount: 4 }),
      dayBucket({ localDate: '2026-04-08', country: 'Italy', city: 'Rome', assetCount: 4 }),
      dayBucket({ localDate: '2026-04-09', country: 'Italy', city: 'Rome', assetCount: 4 }),
    ]);

    const candidates = await service.findRecentTripCandidates({
      ownerId: 'user-1',
      targetDate: new Date('2026-04-23T12:00:00Z'),
      maxCandidates: 3,
    });

    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.dedupeKey)).toEqual([
      'trip:italy:rome:2026-04-08:2026-04-09',
      'trip:france:paris:2026-04-01:2026-04-02',
    ]);
  });

  it('separates trips to the same place when a larger date gap divides them', async () => {
    const { assetRepository, service } = setup();
    assetRepository.getMemoryLocationClusters.mockResolvedValueOnce([
      cluster({ country: 'Germany', city: 'Berlin', assetCount: 30, dayCount: 20 }),
    ]);
    assetRepository.getMemoryLocationDayBuckets.mockResolvedValueOnce([
      dayBucket({ localDate: '2026-04-01', country: 'France', city: 'Paris', assetCount: 4 }),
      dayBucket({ localDate: '2026-04-02', country: 'France', city: 'Paris', assetCount: 4 }),
      dayBucket({ localDate: '2026-04-10', country: 'France', city: 'Paris', assetCount: 5 }),
      dayBucket({ localDate: '2026-04-11', country: 'France', city: 'Paris', assetCount: 4 }),
    ]);

    const candidates = await service.findRecentTripCandidates({
      ownerId: 'user-1',
      targetDate: new Date('2026-04-23T12:00:00Z'),
      maxCandidates: 3,
    });

    expect(candidates.map((candidate) => candidate.dedupeKey)).toEqual([
      'trip:france:paris:2026-04-10:2026-04-11',
      'trip:france:paris:2026-04-01:2026-04-02',
    ]);
  });
});
