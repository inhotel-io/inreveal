import { ReattributionNeighbor, tallyReattribution } from 'src/utils/face-repair';

const n = (personId: string | null, distance: number): ReattributionNeighbor => ({
  assetFaceId: `${personId}-${distance}`,
  personId,
  distance,
});

describe('tallyReattribution', () => {
  it('reports the dominant other owner by neighbor count', () => {
    const tally = tallyReattribution('P', [n('Q', 0.1), n('Q', 0.2), n('Q', 0.3), n('P', 0.4)]);
    expect(tally.ownCount).toBe(1);
    expect(tally.topOtherPersonId).toBe('Q');
    expect(tally.topOtherCount).toBe(3);
    expect(tally.topOtherNearest).toBeCloseTo(0.1);
  });

  it('breaks ties on nearest distance', () => {
    const tally = tallyReattribution('P', [n('Q', 0.5), n('R', 0.2)]);
    expect(tally.topOtherPersonId).toBe('R');
  });

  it('returns no other owner when only the current person is nearby', () => {
    const tally = tallyReattribution('P', [n('P', 0.1), n('P', 0.2)]);
    expect(tally.ownCount).toBe(2);
    expect(tally.topOtherPersonId).toBeNull();
    expect(tally.topOtherCount).toBe(0);
  });

  it('ignores neighbors with no person', () => {
    const tally = tallyReattribution('P', [n(null, 0.1), n('Q', 0.2)]);
    expect(tally.topOtherPersonId).toBe('Q');
    expect(tally.topOtherCount).toBe(1);
  });
});
