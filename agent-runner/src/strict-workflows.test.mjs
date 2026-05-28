import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchStrictWorkflow } from './strict-workflows.mjs';

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
