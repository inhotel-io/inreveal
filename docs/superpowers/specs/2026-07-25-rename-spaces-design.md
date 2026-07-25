# Rename / edit spaces — design

**Date:** 2026-07-25
**Discussion:** [#856 — Renaming spaces](https://github.com/open-noodle/gallery/discussions/856)
**Branch:** `worktree-feat-rename-spaces`

## Problem

A user asked how to rename a shared space and could not find the button. There is no button: the web app
has never shipped a way to edit a space's name, description, or color after creation.

The gap is almost entirely UI. The server endpoint already exists and works:

- `PUT /shared-spaces/:id` accepts `name`, `description`, `color`, `thumbnailAssetId`, `thumbnailCropY`,
  `faceRecognitionEnabled`, `petsEnabled` (`SharedSpaceUpdateSchema`, `server/src/dtos/shared-space.dto.ts:16`).
- Renames are already recorded as `SharedSpaceActivityType.SpaceRename` (`server/src/enum.ts:87`) and
  already rendered in the space activity feed (`web/src/lib/components/spaces/space-activity-feed.svelte:69`).

Two things are missing: the endpoint gates naming behind **Owner**, and nothing in the web app calls it
with a `name`.

## Goals

1. Space **owners and editors** can change a space's name, description, and color.
2. The entry point is discoverable from the space page.
3. Space-wide processing settings stay owner-only.

## Non-goals

- **Mobile.** `mobile/lib/repositories/shared_space_api.repository.dart` has no `updateSpace` call at all.
  Adding one means a repository method, a bottom-sheet action, a dialog, and a local Drift write —
  its own PR.
- **The `/spaces` list context menu.** Neither `space-card.svelte` nor `spaces-table.svelte` has a
  context menu today; adding one is a separate surface.
- **Loosening `faceRecognitionEnabled` / `petsEnabled`.** These stay owner-only (see below).
- **Cover photo editing.** Already shipped and already editor-level.

## Design

### 1. Server — split the RBAC bucket

`server/src/services/shared-space.service.ts:275-281` currently buckets all five non-cover fields into one
owner-only `isMetadataUpdate` check:

```ts
const isMetadataUpdate =
  dto.name !== undefined ||
  dto.description !== undefined ||
  dto.color !== undefined ||
  dto.faceRecognitionEnabled !== undefined ||
  dto.petsEnabled !== undefined;
const minimumRole = isMetadataUpdate ? SharedSpaceRole.Owner : SharedSpaceRole.Editor;
```

Naming and appearance move to Editor. Cover is already Editor. That leaves only the settings pair on
Owner, so the check inverts and collapses:

```ts
// Space-wide processing settings stay owner-only; naming/appearance (name, description, color)
// and the cover are editor-level.
const isOwnerOnlySettingsUpdate = dto.faceRecognitionEnabled !== undefined || dto.petsEnabled !== undefined;
const minimumRole = isOwnerOnlySettingsUpdate ? SharedSpaceRole.Owner : SharedSpaceRole.Editor;
```

**Why the settings pair stays owner-only.** `faceRecognitionEnabled` gates ML processing and the People
tab for the entire space, and flipping it from `false` to `true` queues a `SharedSpaceFaceMatchAll` job
across every asset (`shared-space.service.ts:358-363`). `petsEnabled` likewise changes what the whole
space's people list contains. Those are administrative settings, not naming.

**Mixed payloads reject wholesale.** The check runs against the entire DTO before any write, so an editor
sending `{ name, petsEnabled }` gets a `ForbiddenException` and _nothing_ is written — no partial update.
This is existing behaviour and must be locked down by a test.

No DTO, controller, permission, migration, or SDK change. `Permission.SharedSpaceUpdate` and the route are
untouched.

### 2. Web — `SpaceEditModal.svelte`

New `web/src/lib/modals/SpaceEditModal.svelte`, mirroring `SpaceCreateModal.svelte`: `FormModal` wrapping
`Field` + `Input` (name), `Field` + `Textarea` (description), `Field` + `ColorPicker` (color). Prefilled
from the passed space, calls `updateSpace` on submit, resolves with the updated space.

```
┌─ Edit space ──────────────────┐
│ Name *                        │
│ [ Family & Friends          ] │
│                               │
│ Description                   │
│ [ Our shared holiday photos ] │
│ [                           ] │
│                               │
│ Color                         │
│ ( ● ○ ○ ○ ○ ○ ○ ○ ○ ○ )       │
│                               │
│        [ Cancel ]  [ Save ]   │
└───────────────────────────────┘
```

**One deliberate difference from the create modal.** `SpaceCreateModal` sends
`description: description || undefined`. The edit modal must send `description` **as-is**. `updatePayload`
in the service only picks up keys that are `!== undefined` (`shared-space.service.ts:299-320`), so sending
`undefined` for an emptied field would silently keep the old description. An empty string passes
`z.string().max(500)` and clears the column.

**Empty-name guard.** `Field ... required` only propagates to native HTML form validation, which blocks an
empty input but happily submits `"   "` — which the server then rejects with a 400 from
`z.string().trim().min(1)`. `FormModal` takes a `disabled` prop for its submit button, so the modal binds
`disabled={name.trim().length === 0}` to catch both cases before a request is made.

### 3. Web — entry point

`web/src/routes/(user)/spaces/[spaceId]/+layout.svelte`, inside the existing `{#if isEditor}` block of the
header overflow menu, above "Add all photos":

```
  [＋ Add photos]  [⋮]
                    │
     ┌───────────────────────┐
     │ ◉ Hide from timeline  │
     │ ☺ Stop sharing names  │
     ├───────────────────────┤
     │ ✎ Edit space   ← new  │  editor+
     │ ⧉ Add all photos      │  editor+
     ├───────────────────────┤
     │ 🐾 Show pets          │  owner
     │ 🗑 Delete space       │  owner
     └───────────────────────┘
```

Chosen over the hero pencil menu because that pencil only renders when `canEdit && hasCover`
(`space-hero.svelte:169`) — a space with no cover photo would have no way to rename. The overflow menu is
always present and already hosts the other space-level actions.

Handler follows the established pattern in this file — `modalManager.show(SpaceEditModal, { space })`,
then `invalidateAll()` and a success toast, `handleError` otherwise. `invalidateAll()` refreshes the hero
title, the page title, and the tab counts. The rename appears in the activity feed with no extra work.

### 4. i18n

Reuses the existing `name`, `description`, and `color` keys. New keys in `i18n/en.json` only (web and
mobile share one `i18n/` directory; new keys only need `en.json`):

| Key                             | English                |
| ------------------------------- | ---------------------- |
| `spaces_edit`                   | Edit Space             |
| `spaces_edit_success`           | Space updated          |
| `errors.unable_to_update_space` | Unable to update space |

## Testing

Written test-first: each behaviour gets a failing test before the implementation that satisfies it.

### RBAC matrix (server)

The field groups and their required roles. Every cell gets a test.

| Role       | Naming (`name`, `description`, `color`) | Cover (`thumbnailAssetId`, `thumbnailCropY`) | Settings (`faceRecognitionEnabled`, `petsEnabled`) |
| ---------- | --------------------------------------- | -------------------------------------------- | -------------------------------------------------- |
| Owner      | allow                                   | allow                                        | allow                                              |
| Editor     | **allow (changed)**                     | allow                                        | deny `ForbiddenException`                          |
| Viewer     | deny                                    | deny                                         | deny                                               |
| Non-member | deny                                    | deny                                         | deny                                               |

Plus the mixed-payload case: an **editor** sending naming + settings together is denied, and
`mocks.sharedSpace.update` is asserted **not** to have been called — proving no partial write.

### Existing tests that must change

`server/src/services/shared-space.service.spec.ts`:

| Line | Test                                                        | Action                                                                                                       |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1141 | `should not allow editor to update name`                    | Invert — editor now succeeds                                                                                 |
| 1151 | `should not allow editor to update description`             | Invert — editor now succeeds                                                                                 |
| 1188 | `should not allow editor to update color`                   | Invert — editor now succeeds                                                                                 |
| 1200 | `should treat color update as metadata change (owner-only)` | Assertion still correct (uses a Viewer), but the title is now misleading — retitle to name the viewer denial |

### Server edge cases

- Empty DTO — no-op, no `update` call, no activity log (existing test at :1016, keep).
- Name unchanged but color changed — logs `SpaceColorChange` only, not `SpaceRename`.
- Name changed — logs `SpaceRename` with correct `oldName` / `newName`.
- Description cleared to `''` — written through, not skipped as `undefined`.
- Editor toggling `faceRecognitionEnabled` — denied, and no `SharedSpaceFaceMatchAll` job queued.

### DTO validation (server)

Against `SharedSpaceUpdateSchema`: whitespace-only name rejected (`.trim().min(1)`), name over 100 chars
rejected, description over 500 chars rejected, empty-string description accepted. `shared-space.dto.spec.ts`
already exists for this.

### Web

`SpaceEditModal` spec:

- Prefills all three fields from the passed space.
- Saves the edited name via `updateSpace` with the right payload shape.
- Emptying description sends `''`, **not** `undefined` — the regression this design calls out.
- Submitting unchanged sends the current values without error.
- Save is disabled for an empty name **and** for a whitespace-only name (`"   "`), which native `required`
  would let through.
- A name at exactly 100 chars is accepted by the modal (the server bound, not a stricter client one).
- API failure surfaces through `handleError` and does not close the modal.

`space-layout.spec.ts`:

- Owner sees "Edit space".
- Editor sees "Edit space".
- Viewer does **not**.
- Clicking it opens the modal; a resolved edit triggers `invalidateAll` and a success toast.

### e2e

`e2e/src/specs/server/api/shared-space.e2e-spec.ts` — an editor renames a space end to end, and an editor
is rejected when toggling `faceRecognitionEnabled`.

## Risks

- **Permission loosening.** Editors gain the ability to rename a space other members see. Mitigated by the
  activity feed already recording renames with old and new names, so the change is visible and attributable.
- **The four inverted tests.** They encode the old rule deliberately, so flipping them is the point — but
  each must be flipped to a positive assertion (editor _succeeds_, with the payload checked), not deleted.
