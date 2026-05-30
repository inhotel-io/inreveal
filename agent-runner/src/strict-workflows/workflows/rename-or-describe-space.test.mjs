import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renameOrDescribeSpaceWorkflow } from './rename-or-describe-space.mjs';
import { makeContractClient } from './contract-fixtures.mjs';

const wf = renameOrDescribeSpaceWorkflow();

describe('rename_or_describe_space router & slots', () => {
  it('matches "rename the <space> space to <name>"', () => {
    assert.deepEqual(wf.match('rename the Family space to Family 2026'), {
      slots: { spaceRef: 'Family', newName: 'Family 2026' },
    });
  });

  it('matches "set the description on the <space> space to <text>"', () => {
    assert.deepEqual(wf.match('set the description on the Family space to Our shared memories'), {
      slots: { spaceRef: 'Family', description: 'Our shared memories' },
    });
  });

  it('handles the "shared space <name>" wrapper', () => {
    assert.deepEqual(wf.match('rename the shared space Trips to Trips 2026'), {
      slots: { spaceRef: 'Trips', newName: 'Trips 2026' },
    });
  });

  it('matches a "this space" deixis describe', () => {
    const m = wf.match('set the description on this space to Welcome');
    assert.ok(m, 'expected a match');
    assert.equal(m.slots.description, 'Welcome');
    assert.ok(m.slots.spaceRef);
  });

  it('does not match album phrasings (no space keyword)', () => {
    assert.equal(wf.match('rename the Family album to Family 2026'), undefined);
  });

  it('does not match a generic ref with no space keyword (defaults to album)', () => {
    assert.equal(wf.match('rename Family to Family 2026'), undefined);
  });

  it('returns undefined for an empty prompt', () => {
    assert.equal(wf.match(''), undefined);
  });

  it('parseSlots normalizes the ref and accepts a single field', () => {
    assert.deepEqual(wf.parseSlots({ spaceRef: 'the Family space', newName: 'Family 2026' }), {
      spaceRef: 'Family',
      newName: 'Family 2026',
    });
  });

  it('parseSlots accepts both name and description', () => {
    assert.deepEqual(wf.parseSlots({ spaceRef: 'Family', newName: 'Family 2026', description: 'Welcome' }), {
      spaceRef: 'Family',
      newName: 'Family 2026',
      description: 'Welcome',
    });
  });

  it('parseSlots rejects when neither name nor description is present', () => {
    assert.equal(wf.parseSlots({ spaceRef: 'Family' }), null);
  });

  it('parseSlots rejects a missing space ref', () => {
    assert.equal(wf.parseSlots({ newName: 'X' }), null);
  });

  it('is a strict workflow with an executable run', () => {
    assert.equal(wf.kind, 'rename_or_describe_space');
    assert.equal(wf.flow, 'strict');
    assert.equal(typeof wf.run, 'function');
  });
});

describe('rename_or_describe_space execution', () => {
  const familyClient = () => makeContractClient({ spaces: [{ id: 'spc-1', name: 'Family', members: [] }] });

  it('renames a space and preserves its description (spaceName-only payload)', async () => {
    const client = familyClient();
    const outcome = await wf.run({ client, slots: { spaceRef: 'Family', newName: 'Family 2026' } });
    assert.equal(outcome.status, 'planned');
    const ops = client.calls.find((c) => c.name === 'proposeAlbumOperations').args.operations;
    assert.deepEqual(ops[0], {
      type: 'space.updateDetails',
      summary: 'Update space details.',
      targetKind: 'existing_space',
      targetId: 'spc-1',
      payload: { spaceName: 'Family 2026' },
    });
  });

  it('describes a space and preserves its name (description-only payload)', async () => {
    const client = familyClient();
    const outcome = await wf.run({ client, slots: { spaceRef: 'Family', description: 'Our shared memories' } });
    assert.equal(outcome.status, 'planned');
    const ops = client.calls.find((c) => c.name === 'proposeAlbumOperations').args.operations;
    assert.deepEqual(ops[0].payload, { description: 'Our shared memories' });
  });

  it('updates both name and description when both are set', async () => {
    const client = familyClient();
    const outcome = await wf.run({
      client,
      slots: { spaceRef: 'Family', newName: 'Family 2026', description: 'Our shared memories' },
    });
    assert.equal(outcome.status, 'planned');
    const ops = client.calls.find((c) => c.name === 'proposeAlbumOperations').args.operations;
    assert.deepEqual(ops[0].payload, { spaceName: 'Family 2026', description: 'Our shared memories' });
  });

  it('asks which space when the name is ambiguous (no propose)', async () => {
    const client = makeContractClient({
      spaces: [
        { id: 'a', name: 'Family' },
        { id: 'b', name: 'Family' },
      ],
    });
    const outcome = await wf.run({ client, slots: { spaceRef: 'Family', newName: 'X' } });
    assert.equal(outcome.status, 'needs_input');
    assert.equal(
      client.calls.some((c) => c.name === 'proposeAlbumOperations'),
      false,
    );
  });

  it('asks for input when the space is unknown (no propose)', async () => {
    const client = familyClient();
    const outcome = await wf.run({ client, slots: { spaceRef: 'Nope', newName: 'X' } });
    assert.equal(outcome.status, 'needs_input');
    assert.equal(
      client.calls.some((c) => c.name === 'proposeAlbumOperations'),
      false,
    );
  });

  it('fails (gate) without success copy when the plan has no persisted id', async () => {
    const client = makeContractClient({
      spaces: [{ id: 'spc-1', name: 'Family', members: [] }],
      planResult: { status: 'success', plan: {} },
    });
    const outcome = await wf.run({ client, slots: { spaceRef: 'Family', newName: 'X' } });
    assert.equal(outcome.status, 'failed');
    assert.equal(/prepared/i.test(outcome.text), false);
  });

  it('asks for input (never a no-op plan) when neither field is set', async () => {
    const client = familyClient();
    const outcome = await wf.run({ client, slots: { spaceRef: 'Family' } });
    assert.equal(outcome.status, 'needs_input');
    assert.equal(
      client.calls.some((c) => c.name === 'proposeAlbumOperations'),
      false,
    );
  });
});
