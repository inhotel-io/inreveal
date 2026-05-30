import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createWorkflowDispatcher } from './dispatcher.mjs';

const fakeRegistry = (workflow) => ({
  classify: (prompt) =>
    workflow.match(prompt) ? { kind: workflow.kind, ...workflow.match(prompt) } : { kind: 'none' },
  getWorkflow: (kind) => (kind === workflow.kind ? workflow : undefined),
});

const capture = () => {
  const events = [];
  let pending;
  return {
    emit: (event) => events.push(event),
    appendTranscript: () => {},
    getPending: () => pending,
    setPending: (next) => {
      pending = next;
    },
    events,
    get pending() {
      return pending;
    },
  };
};

describe('workflow dispatcher', () => {
  it('routes a matched new turn to run and emits a completed event for planned', async () => {
    const workflow = {
      kind: 'create_recent_trip_album',
      flow: 'strict',
      match: (p) => (p.includes('recent trip') ? { slots: { albumName: 'USA Trip', placeHint: 'USA' } } : undefined),
      parseSlots: (s) => s,
      run: async () => ({ status: 'planned', text: 'Review the plan.', planId: 'plan-1', successSummary: {} }),
    };
    const sink = capture();
    const dispatcher = createWorkflowDispatcher({ registry: fakeRegistry(workflow), buildClient: () => ({}) });

    const result = await dispatcher.routeTurn({ prompt: 'Create an album for my recent trip to USA', ...sink });

    assert.equal(result.handled, true);
    assert.equal(sink.events.at(-1).type, 'assistant-message-completed');
    assert.match(sink.events.at(-1).content.blocks[0].text, /Review the plan/);
    assert.equal(sink.pending, undefined);
  });

  it('stores pendingWorkflow on needs_input continuation', async () => {
    const workflow = {
      kind: 'create_recent_trip_album',
      flow: 'strict',
      match: () => ({ slots: {} }),
      parseSlots: (s) => s,
      run: async () => ({ status: 'needs_input', text: 'Which trip?', continuation: { kind: 'sel', candidates: [] } }),
    };
    const sink = capture();
    const dispatcher = createWorkflowDispatcher({ registry: fakeRegistry(workflow), buildClient: () => ({}) });
    await dispatcher.routeTurn({ prompt: 'Make an album for my recent trip', ...sink });
    assert.equal(sink.pending.workflowKind, 'create_recent_trip_album');
    assert.equal(sink.pending.continuation.kind, 'sel');
  });

  it('emits tool-approval-needed and stores approval pending on approval_required', async () => {
    const workflow = {
      kind: 'create_recent_trip_album',
      flow: 'strict',
      match: () => ({ slots: {} }),
      parseSlots: (s) => s,
      run: async () => ({
        status: 'approval_required',
        toolCallId: 'tc-1',
        continuation: { candidate: {}, workflow: {} },
      }),
    };
    const sink = capture();
    const dispatcher = createWorkflowDispatcher({ registry: fakeRegistry(workflow), buildClient: () => ({}) });
    await dispatcher.routeTurn({ prompt: 'Create an album for my recent trip to USA', ...sink });
    assert.equal(sink.events.at(-1).type, 'tool-approval-needed');
    assert.equal(sink.events.at(-1).toolCallId, 'tc-1');
    assert.equal(sink.pending.toolCallId, 'tc-1');
  });

  it('reports unhandled for handoff_open and for no match (provider fallthrough)', async () => {
    const handoff = {
      kind: 'k',
      flow: 'hybrid',
      match: () => ({ slots: {} }),
      parseSlots: (s) => s,
      run: async () => ({ status: 'handoff_open', reason: 'subjective' }),
    };
    const sink = capture();
    const d1 = createWorkflowDispatcher({ registry: fakeRegistry(handoff), buildClient: () => ({}) });
    assert.equal((await d1.routeTurn({ prompt: 'do something fuzzy', ...sink })).handled, false);

    const noMatch = { kind: 'k', flow: 'strict', match: () => undefined, parseSlots: (s) => s, run: async () => ({}) };
    const d2 = createWorkflowDispatcher({ registry: fakeRegistry(noMatch), buildClient: () => ({}) });
    assert.equal((await d2.routeTurn({ prompt: 'unrelated', ...capture() })).handled, false);
  });

  it('routes a continuation follow-up by reusing run() with the resolved candidate', async () => {
    const runCalls = [];
    const workflow = {
      kind: 'create_recent_trip_album',
      flow: 'strict',
      match: () => undefined,
      parseSlots: (s) => s,
      resumeContinuation: () => ({
        status: 'matched',
        ctx: { slots: { albumName: 'X' }, candidate: { dedupeKey: 'x' } },
      }),
      run: async (ctx) => {
        runCalls.push(ctx);
        return { status: 'planned', text: 'ok', planId: 'p', successSummary: {} };
      },
    };
    const sink = capture();
    sink.setPending({ workflowKind: 'create_recent_trip_album', kind: 'selection', continuation: { candidates: [] } });
    const dispatcher = createWorkflowDispatcher({ registry: fakeRegistry(workflow), buildClient: () => ({}) });
    const result = await dispatcher.routeTurn({ prompt: 'the first one', ...sink });
    assert.equal(result.handled, true);
    assert.equal(runCalls[0].candidate.dedupeKey, 'x'); // run() reused with ctx.candidate, not a separate method
    assert.equal(sink.events.at(-1).type, 'assistant-message-completed');
    assert.equal(sink.pending, undefined);
  });

  it('emits text and clears pending when a continuation expires', async () => {
    const workflow = {
      kind: 'create_recent_trip_album',
      flow: 'strict',
      match: () => undefined,
      parseSlots: (s) => s,
      resumeContinuation: () => ({ status: 'expired', text: 'Those choices expired. Please rerun.' }),
      run: async () => ({ status: 'planned' }),
    };
    const sink = capture();
    sink.setPending({ workflowKind: 'create_recent_trip_album', kind: 'selection', continuation: {} });
    const dispatcher = createWorkflowDispatcher({ registry: fakeRegistry(workflow), buildClient: () => ({}) });
    await dispatcher.routeTurn({ prompt: 'first', ...sink });
    assert.match(sink.events.at(-1).content.blocks[0].text, /expired/i);
    assert.equal(sink.pending, undefined);
  });

  it('clears pending and emits text on a failed outcome', async () => {
    const workflow = {
      kind: 'create_recent_trip_album',
      flow: 'strict',
      match: () => ({ slots: {} }),
      parseSlots: (s) => s,
      run: async () => ({ status: 'failed', text: 'I could not create a reviewable album plan.' }),
    };
    const sink = capture();
    const dispatcher = createWorkflowDispatcher({ registry: fakeRegistry(workflow), buildClient: () => ({}) });
    const result = await dispatcher.routeTurn({ prompt: 'Create an album for my recent trip to USA', ...sink });
    assert.equal(result.handled, true);
    assert.equal(sink.pending, undefined);
    assert.match(sink.events.at(-1).content.blocks[0].text, /could not create/i);
  });

  it('reports unhandled when parseSlots rejects the classified slots', async () => {
    const workflow = {
      kind: 'k',
      flow: 'strict',
      match: () => ({ slots: {} }),
      parseSlots: () => null,
      run: async () => ({}),
    };
    const sink = capture();
    const dispatcher = createWorkflowDispatcher({ registry: fakeRegistry(workflow), buildClient: () => ({}) });
    assert.equal((await dispatcher.routeTurn({ prompt: 'something', ...sink })).handled, false);
  });

  it('resumes an approval by calling resumeApproval and clears pending', async () => {
    const workflow = {
      kind: 'create_recent_trip_album',
      flow: 'strict',
      resumeApproval: async ({ approvedPlanResult }) => ({
        status: 'planned',
        text: 'Review the plan.',
        planId: approvedPlanResult.planId,
        successSummary: {},
      }),
    };
    const sink = capture();
    sink.setPending({
      workflowKind: 'create_recent_trip_album',
      kind: 'approval',
      toolCallId: 'tc-1',
      slots: {},
      candidate: {},
    });
    const dispatcher = createWorkflowDispatcher({ registry: fakeRegistry(workflow), buildClient: () => ({}) });
    const result = await dispatcher.routeApproval({
      toolCallId: 'tc-1',
      approvalDecision: 'approved',
      toolResult: { planId: 'p-9' },
      ...sink,
    });
    assert.equal(result.handled, true);
    assert.equal(sink.events.at(-1).type, 'assistant-message-completed');
    assert.equal(sink.pending, undefined);
  });

  it('emits generic denial copy without calling the workflow on a denied approval', async () => {
    let resumed = false;
    const workflow = {
      kind: 'create_recent_trip_album',
      flow: 'strict',
      resumeApproval: async () => {
        resumed = true;
        return { status: 'planned' };
      },
    };
    const sink = capture();
    sink.setPending({
      workflowKind: 'create_recent_trip_album',
      kind: 'approval',
      toolCallId: 'tc-1',
      slots: {},
      candidate: {},
    });
    const dispatcher = createWorkflowDispatcher({ registry: fakeRegistry(workflow), buildClient: () => ({}) });
    await dispatcher.routeApproval({ toolCallId: 'tc-1', approvalDecision: 'denied', ...sink });
    assert.equal(resumed, false);
    assert.match(sink.events.at(-1).content.blocks[0].text, /denied/i);
    assert.equal(sink.pending, undefined);
  });
});
