import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { updateAssetMetadataWorkflow } from './update-asset-metadata.mjs';

const wf = updateAssetMetadataWorkflow();

describe('update_asset_metadata identity', () => {
  it('has correct kind, flow, and run stub', () => {
    assert.equal(wf.kind, 'update_asset_metadata');
    assert.equal(wf.flow, 'hybrid');
    assert.equal(typeof wf.run, 'function');
  });
});

describe('update_asset_metadata match — description', () => {
  it('set description on newest photos', () => {
    assert.deepEqual(wf.match('set the description on my newest 20 photos to Berlin weekend'), {
      slots: { field: 'description', description: 'Berlin weekend', sourceDescription: 'my newest 20 photos' },
    });
  });

  it('strips quotes from description value', () => {
    const result = wf.match('set the description on these photos to "Berlin"');
    assert.equal(result?.slots?.description, 'Berlin');
  });

  it('clear description from newest photos', () => {
    const result = wf.match('clear the description from my newest 20 photos');
    assert.equal(result?.slots?.field, 'description');
    assert.equal(result?.slots?.description, '');
  });

  it('declines album-qualified description', () => {
    assert.equal(wf.match('set the description on the Family album to Summer'), undefined);
  });

  it('declines space-qualified description', () => {
    assert.equal(wf.match('set the description on the Trips space to X'), undefined);
  });

  it('declines unsupported field (title)', () => {
    assert.equal(wf.match('set the title on these photos to Foo'), undefined);
  });

  it('declines subjective source', () => {
    assert.equal(wf.match('set the description on the best photos to X'), undefined);
  });

  it('declines place-name-only location prompt', () => {
    assert.equal(wf.match('set the location on these photos to Paris'), undefined);
  });

  it('declines rename verb', () => {
    assert.equal(wf.match('rename my newest 20 photos to Foo'), undefined);
  });

  it('returns undefined for empty prompt', () => {
    assert.equal(wf.match(''), undefined);
  });
});

describe('update_asset_metadata match — rating', () => {
  it('rate newest photos five stars (word number)', () => {
    assert.deepEqual(wf.match('rate my newest 12 photos five stars'), {
      slots: { field: 'rating', rating: 5, sourceDescription: 'my newest 12 photos' },
    });
  });

  it('clear rating from newest photos', () => {
    assert.deepEqual(wf.match('clear the rating from my newest 20 photos'), {
      slots: { field: 'rating', rating: null, sourceDescription: 'my newest 20 photos' },
    });
  });

  it('declines zero stars (out of range)', () => {
    assert.equal(wf.match('rate my newest 20 photos zero stars'), undefined);
  });

  it('declines six stars (out of range)', () => {
    assert.equal(wf.match('rate my newest 20 photos six stars'), undefined);
  });
});

describe('update_asset_metadata match — timezone', () => {
  it('set timezone on newest photos', () => {
    assert.deepEqual(wf.match('set the timezone on my newest 20 photos to Europe/Berlin'), {
      slots: { field: 'timeZone', timeZone: 'Europe/Berlin', sourceDescription: 'my newest 20 photos' },
    });
  });
});

describe('update_asset_metadata match — location', () => {
  it('set lat/lng on newest photos', () => {
    assert.deepEqual(wf.match('set my newest 20 photos to latitude 48.8566 and longitude 2.3522'), {
      slots: { field: 'location', latitude: 48.8566, longitude: 2.3522, sourceDescription: 'my newest 20 photos' },
    });
  });
});

describe('update_asset_metadata match — date shift', () => {
  it('shift forward by hours converts to positive minutes', () => {
    assert.deepEqual(wf.match('shift my newest 20 photos forward by 2 hours'), {
      slots: { field: 'date', dateTimeRelative: 120, sourceDescription: 'my newest 20 photos' },
    });
  });

  it('shift back by minutes gives negative minutes', () => {
    const result = wf.match('shift my newest 20 photos back by 90 minutes');
    assert.equal(result?.slots?.dateTimeRelative, -90);
  });
});

describe('update_asset_metadata parseSlots', () => {
  it('normalizes LLM field+value form for description', () => {
    assert.deepEqual(
      wf.parseSlots({ field: 'description', value: 'Berlin', sourceDescription: 'my newest 20 photos' }),
      { sourceDescription: 'my newest 20 photos', payload: { description: 'Berlin' } },
    );
  });

  it('normalizes LLM field+value for rating 5', () => {
    assert.deepEqual(
      wf.parseSlots({ field: 'rating', value: '5', sourceDescription: 'x' }).payload,
      { rating: 5 },
    );
  });

  it('normalizes LLM field+value for clear rating', () => {
    assert.deepEqual(
      wf.parseSlots({ field: 'rating', value: 'clear', sourceDescription: 'x' }).payload,
      { rating: null },
    );
  });

  it('returns null when longitude is missing', () => {
    assert.equal(wf.parseSlots({ latitude: 48.8566, sourceDescription: 'x' }), null);
  });

  it('returns null when no field or typed slot is present', () => {
    assert.equal(wf.parseSlots({ sourceDescription: 'x' }), null);
  });

  it('returns null when sourceDescription is missing', () => {
    assert.equal(wf.parseSlots({ field: 'description', value: 'Berlin' }), null);
  });

  it('normalizes match-output form (description field with typed description slot)', () => {
    assert.deepEqual(
      wf.parseSlots({ field: 'description', description: 'Berlin weekend', sourceDescription: 'my newest 20 photos' }),
      { sourceDescription: 'my newest 20 photos', payload: { description: 'Berlin weekend' } },
    );
  });
});
