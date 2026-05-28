import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchStrictWorkflow, runCreateRecentTripAlbumWorkflow } from './strict-workflows.mjs';

describe('strict workflow router', () => {
  it('matches a USA recent-trip album request', () => {
    assert.deepEqual(matchStrictWorkflow('Create an album for my recent trip to USA'), {
      kind: 'create_recent_trip_album',
      albumName: 'USA Trip',
      placeHint: 'USA',
    });
  });

  it('matches a recent-trip album request without a place hint', () => {
    assert.deepEqual(matchStrictWorkflow('Make an album for my recent trip'), {
      kind: 'create_recent_trip_album',
      albumName: 'Recent Trip',
    });
  });

  it('preserves explicit album names', () => {
    assert.deepEqual(matchStrictWorkflow('Create an album for my recent trip called Spring Break'), {
      kind: 'create_recent_trip_album',
      albumName: 'Spring Break',
    });
  });

  it('preserves common punctuation in explicit album names', () => {
    assert.deepEqual(matchStrictWorkflow("Create an album for my recent trip called Bob's Vacation"), {
      kind: 'create_recent_trip_album',
      albumName: "Bob's Vacation",
    });

    assert.deepEqual(matchStrictWorkflow('Create an album for my recent trip called "Spring Break!"'), {
      kind: 'create_recent_trip_album',
      albumName: 'Spring Break!',
    });
  });

  it('allows highlight words inside explicit album names', () => {
    assert.deepEqual(matchStrictWorkflow('Create an album for my recent trip called Favorite Memories'), {
      kind: 'create_recent_trip_album',
      albumName: 'Favorite Memories',
    });

    assert.deepEqual(matchStrictWorkflow('Create an album for my recent trip called Best of Italy'), {
      kind: 'create_recent_trip_album',
      albumName: 'Best of Italy',
    });
  });

  it('splits combined place and album-name clauses', () => {
    assert.deepEqual(matchStrictWorkflow('Create an album for my recent trip to USA called Spring Break'), {
      kind: 'create_recent_trip_album',
      albumName: 'Spring Break',
      placeHint: 'USA',
    });
  });

  it('normalizes United States aliases to USA', () => {
    for (const prompt of [
      'Create an album for my recent trip to USA',
      'Create an album for my recent trip to United States',
      'Create an album for my recent trip to the United States',
      'Create an album for my recent trip to U.S.',
    ]) {
      assert.equal(matchStrictWorkflow(prompt).placeHint, 'USA', prompt);
      assert.equal(matchStrictWorkflow(prompt).albumName, 'USA Trip', prompt);
    }
  });

  it('omits uncertain place hints instead of guessing', () => {
    assert.deepEqual(matchStrictWorkflow('Create an album for my recent trip to somewhere nice'), {
      kind: 'create_recent_trip_album',
      albumName: 'Recent Trip',
    });
  });

  it('allows place names containing space', () => {
    assert.deepEqual(matchStrictWorkflow('Create an album for my recent trip to Space Needle'), {
      kind: 'create_recent_trip_album',
      albumName: 'Space Needle Trip',
      placeHint: 'Space Needle',
    });
  });

  it('rejects explicit highlight requests', () => {
    for (const prompt of [
      'Create an album of the top highlights for my recent trip to USA',
      'Create an album of the best photos from my recent trip to USA',
      'Pick highlights from my recent trip and make an album',
    ]) {
      assert.deepEqual(matchStrictWorkflow(prompt), { kind: 'unsupported' }, prompt);
    }
  });

  it('rejects non-generic album creation workflows', () => {
    for (const prompt of [
      'Add my recent trip photos to Family',
      'Create a shared space for my recent trip to USA',
      'How many photos are in my recent trip album?',
      'Set the description on my recent trip photos to Vacation',
    ]) {
      assert.deepEqual(matchStrictWorkflow(prompt), { kind: 'unsupported' }, prompt);
    }
  });
});

const tripCandidateHandleId = '00000000-0000-4000-8000-000000000921';
const tripPlanId = '00000000-0000-4000-8000-000000000923';

const makeTripCandidate = (overrides = {}) => ({
  dedupeKey: 'trip:usa:new-york:2026-05-03:2026-05-12',
  title: 'Recent trip to New York, USA',
  takenAfter: '2026-05-03T00:00:00.000Z',
  takenBefore: '2026-05-12T23:59:59.000Z',
  albumAssetCount: 28,
  excludedDuplicateCount: 3,
  excludedStackChildCount: 1,
  placeLabels: ['New York, USA'],
  selectionHandle: {
    id: tripCandidateHandleId,
    sourceRef: `asset-source:search:${tripCandidateHandleId}`,
    assetCount: 28,
  },
  ...overrides,
});

const createWorkflowClient = ({ candidates = [makeTripCandidate()], recommendation, planResult } = {}) => {
  const calls = [];
  const resolvedRecommendation =
    recommendation ??
    {
      action: 'use_top_candidate',
      candidateDedupeKey: 'trip:usa:new-york:2026-05-03:2026-05-12',
      reason: 'The only readable trip candidate is high confidence.',
    };

  const client = {
    async call(name, args) {
      calls.push({ name, args });
      if (name === 'findTripCandidates') {
        return {
          status: 'success',
          recommendation: resolvedRecommendation,
          candidates,
        };
      }

      if (name === 'proposeAlbumFromSelection') {
        return (
          planResult ?? {
            status: 'success',
            plan: { id: tripPlanId },
          }
        );
      }

      throw new Error(`unexpected tool ${name}`);
    },
  };

  return { client, calls };
};

describe('create_recent_trip_album workflow execution', () => {
  it('plans from the recommended candidate handle without search or raw asset ids', async () => {
    const { client, calls } = createWorkflowClient();

    const result = await runCreateRecentTripAlbumWorkflow({
      client,
      workflow: matchStrictWorkflow('Create an album for my recent trip to USA'),
    });

    assert.equal(result.status, 'planned');
    assert.equal(result.planId, tripPlanId);
    assert.equal(calls.map((call) => call.name).join(','), 'findTripCandidates,proposeAlbumFromSelection');
    assert.deepEqual(calls[0].args, { placeHint: 'USA' });
    assert.equal(calls[1].args.albumName, 'USA Trip');
    assert.equal(calls[1].args.selectionHandleId, tripCandidateHandleId);
    assert.equal(JSON.stringify(calls).includes('assetIds'), false);
    assert.match(calls[1].args.summary, /28 trip assets from New York, USA/);
    assert.match(calls[1].args.description, /3 known duplicate variants and 1 stack child/i);
    assert.match(result.text, /May 3-12, 2026/);
    assert.match(result.text, /skipped 3 known duplicate variants and 1 stack child/i);
  });

  it('uses no place hint and the default Recent Trip name when the prompt has no place', async () => {
    const { client, calls } = createWorkflowClient({
      candidates: [
        makeTripCandidate({
          dedupeKey: 'trip:recent:2026-05-03:2026-05-12',
          placeLabels: ['Lisbon, Portugal'],
        }),
      ],
      recommendation: {
        action: 'use_top_candidate',
        candidateDedupeKey: 'trip:recent:2026-05-03:2026-05-12',
      },
    });

    const result = await runCreateRecentTripAlbumWorkflow({
      client,
      workflow: matchStrictWorkflow('Make an album for my recent trip'),
    });

    assert.equal(result.status, 'planned');
    assert.deepEqual(calls[0].args, {});
    assert.equal(calls[1].args.albumName, 'Recent Trip');
  });

  it('preserves explicit album names when proposing the plan', async () => {
    const { client, calls } = createWorkflowClient();

    await runCreateRecentTripAlbumWorkflow({
      client,
      workflow: matchStrictWorkflow('Create an album for my recent trip to USA called Spring Break'),
    });

    assert.equal(calls[1].args.albumName, 'Spring Break');
  });

  it('omits duplicate and stack copy when no exclusions are present', async () => {
    const { client, calls } = createWorkflowClient({
      candidates: [makeTripCandidate({ excludedDuplicateCount: 0, excludedStackChildCount: 0 })],
    });

    const result = await runCreateRecentTripAlbumWorkflow({
      client,
      workflow: matchStrictWorkflow('Create an album for my recent trip to USA'),
    });

    assert.doesNotMatch(calls[1].args.description, /duplicate|stack/i);
    assert.doesNotMatch(result.text, /skipped|duplicate|stack/i);
  });

  it('does not plan when the recommended candidate key is missing', async () => {
    const { client, calls } = createWorkflowClient({
      recommendation: { action: 'use_top_candidate', candidateDedupeKey: 'trip:missing' },
    });

    const result = await runCreateRecentTripAlbumWorkflow({
      client,
      workflow: matchStrictWorkflow('Create an album for my recent trip to USA'),
    });

    assert.equal(result.status, 'needs_input');
    assert.equal(calls.map((call) => call.name).join(','), 'findTripCandidates');
    assert.match(result.text, /could not match/i);
  });
});
