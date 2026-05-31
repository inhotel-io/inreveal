import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { curateHighlightsWorkflow } from './curate-highlights.mjs';

const wf = curateHighlightsWorkflow();

describe('curate_highlights router — match accepts', () => {
  it('pick the best 15 photos from my Portugal trip and make an album', () => {
    const result = wf.match('pick the best 15 photos from my Portugal trip and make an album');
    assert.ok(result, 'expected a match');
    assert.equal(result.slots.count, 15);
    assert.match(result.slots.sourceDescription, /Portugal trip/i);
    assert.equal(result.slots.action, 'album');
  });

  it('pick the best 15 from my Portugal trip and make an album called Highlights', () => {
    const result = wf.match('pick the best 15 from my Portugal trip and make an album called Highlights');
    assert.ok(result, 'expected a match');
    assert.equal(result.slots.count, 15);
    assert.match(result.slots.sourceDescription, /Portugal trip/i);
    assert.equal(result.slots.action, 'album');
    assert.equal(result.slots.albumName, 'Highlights');
  });

  it('suggest 10 highlights from this album', () => {
    const result = wf.match('suggest 10 highlights from this album');
    assert.ok(result, 'expected a match');
    assert.equal(result.slots.count, 10);
    assert.equal(result.slots.action, 'album');
  });

  it('favorite the best photos from the Family space — no count', () => {
    const result = wf.match('favorite the best photos from the Family space');
    assert.ok(result, 'expected a match');
    assert.equal(result.slots.action, 'favorite');
    assert.match(result.slots.sourceDescription, /Family space/i);
    assert.equal(result.slots.count, undefined);
  });

  it('choose 20 highlights from photos of Alex in Berlin last summer', () => {
    const result = wf.match('choose 20 highlights from photos of Alex in Berlin last summer');
    assert.ok(result, 'expected a match');
    assert.equal(result.slots.count, 20);
    assert.match(result.slots.sourceDescription, /Alex in Berlin/i);
    assert.equal(result.slots.action, 'album');
  });

  it('add 20 highlights from last weekend to Family — addToAlbum', () => {
    const result = wf.match('add 20 highlights from last weekend to Family');
    assert.ok(result, 'expected a match');
    assert.equal(result.slots.count, 20);
    assert.equal(result.slots.action, 'addToAlbum');
    assert.match(result.slots.targetAlbum, /Family/i);
  });

  it('spelled-out count: pick the best fifteen from this album', () => {
    const result = wf.match('pick the best fifteen from this album');
    assert.ok(result, 'expected a match');
    assert.equal(result.slots.count, 15);
    assert.equal(result.slots.action, 'album');
  });

  it('"find the best photos in my library" matches with sourceDescription (unbounded guardrail is Slice 4)', () => {
    // TODO(slice-4): Slice 4 turns this unbounded source into a needs_input.
    const result = wf.match('find the best photos in my library');
    assert.ok(result, 'expected a match at router level');
    assert.match(result.slots.sourceDescription, /my library/i);
  });
});

describe('curate_highlights router — match rejects', () => {
  it('rejects plain album creation without best/top/highlights', () => {
    assert.equal(wf.match('make an album from my Italy trip'), undefined, 'no curate signal');
  });

  it('rejects subjective-visual: pick the sharpest photo', () => {
    assert.equal(wf.match('pick the sharpest photo'), undefined, 'subjective-visual → reject');
  });

  it('rejects subjective-visual: best composition', () => {
    assert.equal(wf.match('pick the best composition from last weekend'), undefined);
  });

  it('rejects read-only browse: show me my best photos', () => {
    assert.equal(wf.match('show me my best photos'), undefined, 'no plan verb → reject');
  });

  it('rejects empty prompt', () => {
    assert.equal(wf.match(''), undefined);
  });
});

describe('curate_highlights parseSlots', () => {
  it('round-trips regex-derived slots', () => {
    const matched = wf.match('pick the best 15 photos from my Portugal trip and make an album');
    const slots = wf.parseSlots(matched.slots);
    assert.ok(slots, 'expected non-null');
    assert.equal(slots.count, 15);
    assert.match(slots.sourceDescription, /Portugal trip/i);
    assert.equal(slots.action, 'album');
  });

  it('round-trips LLM-shaped raw slots', () => {
    const slots = wf.parseSlots({ sourceDescription: 'the Family space', action: 'favorite', count: 20 });
    assert.ok(slots, 'expected non-null');
    assert.equal(slots.sourceDescription, 'the Family space');
    assert.equal(slots.action, 'favorite');
    assert.equal(slots.count, 20);
  });

  it('preserves count as undefined when not given', () => {
    const slots = wf.parseSlots({ sourceDescription: 'this album', action: 'album' });
    assert.ok(slots, 'expected non-null');
    assert.equal(slots.count, undefined);
  });

  it('returns null when sourceDescription is missing', () => {
    assert.equal(wf.parseSlots({ action: 'album', count: 10 }), null);
  });

  it('returns null when sourceDescription is blank', () => {
    assert.equal(wf.parseSlots({ sourceDescription: '   ', action: 'album' }), null);
  });
});

describe('curate_highlights run() — placeholder handoff', () => {
  it('returns handoff_open for any matched prompt (placeholder; Slices 4-6 replace this)', async () => {
    const matched = wf.match('pick the best 15 photos from my Portugal trip and make an album');
    const outcome = await wf.run({ client: null, slots: matched.slots, signal: undefined });
    assert.equal(outcome.status, 'handoff_open');
    assert.ok(typeof outcome.reason === 'string' && outcome.reason.length > 0);
  });

  it('is a hybrid workflow', () => {
    assert.equal(wf.kind, 'curate_highlights');
    assert.equal(wf.flow, 'hybrid');
    assert.equal(typeof wf.run, 'function');
  });
});
