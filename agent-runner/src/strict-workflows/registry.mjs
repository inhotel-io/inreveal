import { addPhotosToAlbumWorkflow } from './workflows/add-photos-to-album.mjs';
import { archiveAssetsWorkflow } from './workflows/archive-assets.mjs';
import { changeMemberRoleWorkflow } from './workflows/change-member-role.mjs';
import { createAlbumFromSourceWorkflow } from './workflows/create-album-from-source.mjs';
import { createRecentTripAlbumWorkflow } from './workflows/create-recent-trip-album.mjs';
import { favoriteAssetsWorkflow } from './workflows/favorite-assets.mjs';
import { manageSpaceMembersWorkflow } from './workflows/manage-space-members.mjs';
import { removePhotosFromAlbumWorkflow } from './workflows/remove-photos-from-album.mjs';
import { renameOrDescribeAlbumWorkflow } from './workflows/rename-or-describe-album.mjs';
import { renameOrDescribeSpaceWorkflow } from './workflows/rename-or-describe-space.mjs';
import { tagAssetsWorkflow } from './workflows/tag-assets.mjs';
import { updateAssetMetadataWorkflow } from './workflows/update-asset-metadata.mjs';

// Workflow factories keyed by kind. Adding a workflow is a registry entry, not a
// runtime edit. Registering here makes a workflow both regex-routable (each
// `match`) AND visible to the LLM classifier (via `listWorkflows`/manifest).
//
// Order matters for the regex fast-path (first match wins):
//   - `rename_or_describe_space` BEFORE `rename_or_describe_album` so the strict
//     `space`-keyword gate wins "rename the X space …" (album declines those).
//   - `manage_space_members` / `change_member_role` BEFORE `add_photos_to_album`.
//   - `favorite_assets` / `tag_assets` / `manage_space_members` BEFORE
//     `remove_photos_from_album` so "remove … from my favorites" → favorite_assets,
//     "remove Bob from the Family space" → manage_space_members, and
//     "remove the Travel tag …" → none (tag_assets is add-only and declines).
//   - `remove_photos_from_album` AFTER `favorite_assets`/`tag_assets`/
//     `manage_space_members`, BEFORE `add_photos_to_album`.
//   - `add_photos_to_album` stays LAST so its "add <source> to <album>" pattern
//     never steals "add the tag <tag> to <source>" (tag_assets) or member adds.
//   - `update_asset_metadata` after `rename_or_describe_*` so album/space describe
//     wins their refs; it declines album/space refs.
const WORKFLOW_FACTORIES = Object.freeze([
  createRecentTripAlbumWorkflow,
  createAlbumFromSourceWorkflow,
  renameOrDescribeSpaceWorkflow,
  renameOrDescribeAlbumWorkflow,
  archiveAssetsWorkflow,
  favoriteAssetsWorkflow,
  tagAssetsWorkflow,
  updateAssetMetadataWorkflow,
  manageSpaceMembersWorkflow,
  changeMemberRoleWorkflow,
  removePhotosFromAlbumWorkflow,
  addPhotosToAlbumWorkflow,
]);

// Regex-only fallback classifier, used when no LLM classifier is injected
// (e2e-runtime, dispatcher unit tests). Keeps `classify` deterministic and
// model-free so those callers never reach a provider.
const createRegexClassifier = (workflows) => ({
  async classify(prompt) {
    for (const workflow of workflows.values()) {
      const matched = workflow.match(prompt);
      if (matched) {
        return { kind: workflow.kind, ...matched, via: 'regex', confidence: 'high' };
      }
    }
    return { kind: 'none', via: 'regex' };
  },
});

// `classifier` is the Slice 4 LLM intent classifier (regex fast-path → LLM
// structured classify → parseSlots). When omitted, the registry stays regex-only
// so Slice 3 dispatcher tests and the e2e runtime keep working without a model.
export const createWorkflowRegistry = ({ classifier } = {}) => {
  const workflows = new Map();
  for (const factory of WORKFLOW_FACTORIES) {
    const workflow = factory();
    workflows.set(workflow.kind, workflow);
  }

  const activeClassifier = classifier ?? createRegexClassifier(workflows);

  return {
    getWorkflow(kind) {
      return workflows.get(kind);
    },

    listWorkflows() {
      return [...workflows.values()];
    },

    // Delegates to the injected classifier (or the regex-only fallback). Returns
    // `{ kind, slots? }` or `{ kind: 'none' }`. The dispatcher then runs
    // `parseSlots` before any execution.
    classify(prompt, options) {
      return activeClassifier.classify(prompt, options);
    },
  };
};
