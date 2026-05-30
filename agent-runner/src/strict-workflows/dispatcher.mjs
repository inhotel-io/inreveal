// Generic, runtime-agnostic workflow dispatcher.
//
// Both pi-runtime and e2e-runtime route every strict/hybrid turn through this
// dispatcher. The dispatcher owns classify-or-resume routing, calls
// `workflow.run`/`resumeContinuation`/`resumeApproval`, and maps each
// `WorkflowOutcome` arm to runner events, transcript appends, and the
// `pendingWorkflow` set/clear transitions.
//
// Each runtime keeps its OWN event payload shapes by injecting `completedEvent`
// and `approvalEvent` builders per call. The dispatcher never hard-codes a
// workflow `kind` — adding a workflow is a registry entry, not a dispatcher edit.

const genericApprovalDeniedText =
  'The approval was denied, so no plan was created. Rerun the request to try again.';

const defaultCompletedEvent = ({ text }) => ({
  type: 'assistant-message-completed',
  content: { blocks: [{ type: 'text', text }] },
});

const defaultApprovalEvent = ({ toolCallId }) => ({
  type: 'tool-approval-needed',
  toolCallId,
});

const noop = () => {};

export const createWorkflowDispatcher = ({ registry, buildClient, now = Date.now, observe = noop }) => {
  const handleOutcome = ({ outcome, wf, emit, appendTranscript, setPending, prompt, completedEvent, approvalEvent }) => {
    switch (outcome?.status) {
      case 'planned': {
        appendTranscript(prompt, outcome.text);
        setPending(undefined);
        emit(completedEvent({ text: outcome.text }));
        return { handled: true };
      }
      case 'needs_input': {
        if (outcome.continuation) {
          setPending({ workflowKind: wf.kind, kind: 'selection', continuation: outcome.continuation });
        } else {
          setPending(undefined);
        }
        appendTranscript(prompt, outcome.text);
        emit(completedEvent({ text: outcome.text }));
        return { handled: true };
      }
      case 'approval_required': {
        setPending({
          workflowKind: wf.kind,
          kind: 'approval',
          toolCallId: outcome.toolCallId,
          ...outcome.continuation,
        });
        emit(approvalEvent({ toolCallId: outcome.toolCallId }));
        return { handled: true };
      }
      case 'failed': {
        setPending(undefined);
        appendTranscript(prompt, outcome.text);
        emit(completedEvent({ text: outcome.text }));
        return { handled: true };
      }
      case 'handoff_open':
      default: {
        setPending(undefined);
        return { handled: false };
      }
    }
  };

  const routeTurn = async ({
    prompt,
    emit,
    appendTranscript,
    getPending,
    setPending,
    signal,
    completedEvent = defaultCompletedEvent,
    approvalEvent = defaultApprovalEvent,
  }) => {
    const nowMs = now();
    const pending = getPending();

    // Continuation follow-up (approval resume is handled by routeApproval).
    if (pending && pending.kind !== 'approval') {
      const wf = registry.getWorkflow(pending.workflowKind);
      const resolved = wf.resumeContinuation({ pending: pending.continuation, prompt, nowMs });
      if (resolved.status === 'matched') {
        // Spec: the continuation-resolved path reuses run() with ctx.candidate
        // set — there is no separate run_continuation_candidate.
        const outcome = await wf.run({ client: buildClient(), ...resolved.ctx, signal, nowMs });
        return handleOutcome({ outcome, wf, emit, appendTranscript, setPending, prompt, completedEvent, approvalEvent });
      }

      setPending(resolved.status === 'needs_input' ? pending : undefined);
      observe('strict_continuation', {
        resumed: false,
        expired: resolved.status === 'expired',
        missing: resolved.status === 'missing',
      });
      emit(completedEvent({ text: resolved.text }));
      return { handled: true };
    }

    const decision = await registry.classify(prompt, { signal });
    if (decision.kind === 'none') {
      return { handled: false };
    }

    const wf = registry.getWorkflow(decision.kind);
    const slots = wf.parseSlots(decision.slots, prompt);
    if (slots == null) {
      return { handled: false }; // falls through to open orchestration
    }

    const outcome = await wf.run({ client: buildClient(), slots, signal, nowMs });
    return handleOutcome({ outcome, wf, emit, appendTranscript, setPending, prompt, completedEvent, approvalEvent });
  };

  const routeApproval = async ({
    toolCallId,
    approvalDecision,
    toolResult,
    emit,
    appendTranscript,
    getPending,
    setPending,
    signal,
    completedEvent = defaultCompletedEvent,
    approvalEvent = defaultApprovalEvent,
  }) => {
    const pending = getPending();
    if (!pending || pending.kind !== 'approval' || pending.toolCallId !== toolCallId) {
      return { handled: false }; // fall through to provider continue path
    }

    setPending(undefined);
    if (approvalDecision !== 'approved') {
      // Generic, workflow-agnostic denial. No workflow re-implements denial copy.
      appendTranscript('', genericApprovalDeniedText);
      emit(completedEvent({ text: genericApprovalDeniedText }));
      return { handled: true };
    }

    const wf = registry.getWorkflow(pending.workflowKind);
    const outcome = await wf.resumeApproval({
      client: buildClient(),
      pending,
      approvedPlanResult: toolResult,
      signal,
    });
    return handleOutcome({
      outcome,
      wf,
      emit,
      appendTranscript,
      setPending,
      prompt: '',
      completedEvent,
      approvalEvent,
    });
  };

  return { routeTurn, routeApproval };
};
