import { createRecentTripAlbumWorkflow } from './workflows/create-recent-trip-album.mjs';

// Workflow factories keyed by kind. Adding a workflow is a registry entry, not a
// runtime edit. Slice 7 adds more factories here.
const WORKFLOW_FACTORIES = Object.freeze([createRecentTripAlbumWorkflow]);

export const createWorkflowRegistry = () => {
  const workflows = new Map();
  for (const factory of WORKFLOW_FACTORIES) {
    const workflow = factory();
    workflows.set(workflow.kind, workflow);
  }

  return {
    getWorkflow(kind) {
      return workflows.get(kind);
    },

    listWorkflows() {
      return [...workflows.values()];
    },

    // Slice 3: regex fast-path only. Slice 4 swaps in the LLM classifier behind
    // this same `classify(prompt)` signature, returning `{ kind, slots }` or
    // `{ kind: 'none' }`.
    classify(prompt) {
      for (const workflow of workflows.values()) {
        const matched = workflow.match(prompt);
        if (matched) {
          return { kind: workflow.kind, ...matched };
        }
      }
      return { kind: 'none' };
    },
  };
};
