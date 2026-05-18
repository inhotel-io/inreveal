# People Merge Propagation Design

## Goal

Manual person merges should mean "these are the same real-world person" and should propagate through the identity graph instead of staying isolated to the scope where the user clicked merge.

The first version intentionally uses an open trust model:

- A personal merge is authoritative for the personal person owner.
- A shared-space merge by an editor or owner is authoritative identity evidence.
- Propagation can merge affected personal people and affected people in other shared spaces.
- If this becomes too permissive in practice, the same planner can later queue or require approval for some propagated merges.

## Current Context

The current data model already has a cross-scope identity layer:

- `person.identityId` links a personal person profile to `face_identity`.
- `shared_space_person.identityId` links a shared-space person profile to `face_identity`.
- `face_identity_face` links faces to identities.
- Unique indexes allow only one personal profile per `(ownerId, identityId)` and one shared-space profile per `(spaceId, identityId)`.

Today, identity merges are conservative. If merging identities would create two profiles for the same owner or same space, `FaceIdentityRepository.mergeIdentities()` reports conflicts and avoids collapsing the profiles. That prevents accidental damage, but it leaves duplicates behind after a user has manually confirmed a merge.

This design changes the manual merge path: conflicts become planned profile-merge work, not blockers.

Automatic reconciliation and ML-driven deduplication should stay conservative unless explicitly routed through the manual propagation engine.

## Scope

In scope:

- Personal people merge propagation.
- Shared-space people merge propagation.
- Space-to-space propagation when the same identities have duplicate people in multiple spaces.
- Propagation into personal profiles attached to affected identities.
- Metadata preservation for target profiles.
- Shared-space merge activity payload improvements.
- Testable dry-run style planning, even if no public dry-run API ships in v1.

Out of scope for v1:

- Approval queues.
- Per-member trust settings.
- Notifications for propagated merges.
- Undo UI.
- A large new audit/event table, unless implementation reveals that shared-space activity is insufficient.

## Policy

The v1 policy is intentionally open:

> Editor+ merges in shared spaces are authoritative identity merges. They propagate through all personal and shared-space profiles attached to the affected identities. Propagation preserves each scope's local metadata and records enough activity detail to debug what happened.

The minimum guardrails are:

- The initiating action must be authorized in its starting scope.
- A personal merge still requires `PersonMerge` on the target and source personal people.
- A shared-space merge still requires editor or owner role in the starting space.
- Propagated profile merges do not require separate permissions for every affected owner or space.
- `person` and `pet` identities must not be merged.
- Target profile metadata wins. Source metadata only fills blanks.
- Favorite, hidden, and manual representative-face choices must not be overwritten by propagation.
- Automatic reconciliation jobs keep using conservative conflict handling.

## Architecture

Add a central `IdentityMergePropagationService`.

Existing manual merge entry points should become permission validation plus a call into this service:

- `PersonService.mergePerson()`
- `SharedSpaceService.mergeSpacePeople()`

The new service owns the manual propagation workflow:

1. Resolve the initiating target profile and source profiles.
2. Ensure target and source identities exist.
3. Build a propagation plan from all profiles attached to those identities.
4. Apply profile merges first, within personal scopes and shared-space scopes.
5. Merge source identities into the selected target identity.
6. Update surviving profiles to the target identity.
7. Queue existing metadata backfill, deduplication, thumbnail, and count repair work.

The transaction boundary should live in `IdentityMergePropagationService`. Repository methods should accept a transaction handle where needed, because the propagation crosses personal people, shared-space people, aliases, faces, and identities.

## Propagation Plan

The planner should return a structured object before execution. The API does not need to expose it in v1, but tests should assert it directly.

The plan should include:

- origin: `person` or `space-person`
- actor user id
- target identity id
- source identity ids
- affected personal profile merges
- affected shared-space profile merges
- affected owner ids
- affected space ids
- follow-up jobs to queue
- activity payload summary

For each scope, group attached profiles like this:

- Personal scope key: `ownerId`
- Shared-space scope key: `spaceId`

If a scope has only one profile attached to the affected identities, it only needs to be updated to the final target identity.

If a scope has multiple profiles attached to the affected identities, they must be merged before identities are collapsed.

## Survivor Selection

Each scope needs one survivor profile.

Use this order:

1. If the initiating target profile is in this scope, keep it.
2. Else if a profile is already attached to the initiating target identity, keep it.
3. Else prefer the profile with more faces.
4. Else prefer a named profile over an unnamed profile.
5. Else use deterministic id ordering.

For a personal-origin merge, this means the user's selected target personal person survives in their personal people.

For a space-origin merge, this means the selected target space person survives in the initiating space. In other spaces, the profile already attached to the winning identity survives when possible. Otherwise the survivor is selected deterministically.

## Space-To-Space Propagation

Space-to-space propagation is first-class behavior, not a side effect.

Example:

- Personal people contain `X` and `Y`.
- Space A contains `space-X-a` and `space-Y-a`.
- Space B contains `space-X-b` and `space-Y-b`.
- A space editor merges `space-Y-a` into `space-X-a`.

The propagation plan should:

- merge `space-Y-a` into `space-X-a` in Space A
- merge `space-Y-b` into `space-X-b` in Space B
- merge personal `Y` into personal `X` for any owner with duplicate personal profiles attached to the same identity set
- collapse all source identities into the target identity
- queue metadata backfill for all affected spaces
- queue shared-space dedup for Space A and Space B

If Space C has only one profile attached to the affected identity set, that profile should not be deleted. It should simply end up linked to the final target identity.

This behavior is important because users expect a confirmed merge in one shared space to clean up the same duplicate in all other spaces where the same identity split is visible.

## Profile Merge Rules

### Personal Profiles

When merging one `person` row into another:

- Reassign `asset_face.personId` from source to survivor.
- Link moved faces to the final identity with source `manual`.
- Preserve survivor `name`, `birthDate`, `color`, `species`, `isFavorite`, `isHidden`, and `faceAssetId` unless a field is blank and the source has a useful value.
- Do not copy `isFavorite` from source to survivor.
- Do not copy `isHidden` from source to survivor.
- Do not replace a manual or existing feature face unless the survivor lacks a valid face.
- Delete the source `person`.
- Queue file cleanup for source person thumbnail paths using the existing deletion path.

### Shared-Space Profiles

When merging one `shared_space_person` row into another:

- Reassign `shared_space_person_face.personId` from source to survivor.
- Migrate `shared_space_person_alias` rows from source to survivor.
- Keep existing survivor aliases when there is a conflict.
- Preserve survivor `name`, `birthDate`, `isHidden`, `representativeFaceId`, and `representativeFaceSource`.
- Do not let a propagated merge overwrite manual `nameSource` or `birthDateSource`.
- If survivor metadata is blank or inherited, allow the existing metadata backfill flow to select a better inherited value after identity collapse.
- Delete the source `shared_space_person`.
- Recount survivor `faceCount` and `assetCount`.
- Repair representative face if the survivor has no valid representative face after merge.

## Identity Merge Rules

After all conflicting profiles have been merged:

- Update remaining profiles that point at source identities to the target identity.
- Update `face_identity_face.identityId` from source identities to target identity.
- Use source `manual` for manually initiated propagation.
- Delete source identities that no longer have attached faces or profiles.

Existing conflict-checking identity merge behavior should remain available for automatic reconciliation paths.

## Follow-Up Work

After execution:

- Queue `SharedSpacePersonMetadataBackfill` for the final target identity.
- Queue `SharedSpacePersonDedup` for every affected shared space.
- Recount affected shared-space people.
- Repair invalid shared-space representative faces.
- Refresh personal feature photos where needed.

The service should deduplicate affected space ids and person ids before queueing work.

## Activity And Audit

Keep the existing shared-space `PersonMerge` activity for the initiating space.

When propagation merges people in additional shared spaces, write a `PersonMerge` activity in each affected space as well. The payload should mark whether the activity is the initiating merge or a propagated merge from another scope. This matters because space-to-space propagation changes visible people in spaces whose members did not initiate the action.

Expand the activity payload to include:

- origin scope
- actor user id
- activity role: `initiating` or `propagated`
- originating space id when the merge started in a shared space
- target profile id
- source profile ids
- target identity id
- source identity ids
- affected personal profile merge count
- affected shared-space profile merge count
- affected shared-space ids

For v1, per-affected-space activity plus the summary payload is enough to understand a propagation event when investigating user reports. If we later add approval, undo, or admin history, the propagation plan can become the basis for a dedicated audit table.

## Error Handling

The propagation should execute atomically where possible.

- If identity resolution fails, reject the initiating merge.
- If mixed `person`/`pet` identities are found, reject the initiating merge.
- If a required source profile is missing from the initiating scope, reject the initiating merge.
- If any planned profile merge cannot be applied, roll back the whole merge.
- If follow-up queueing fails after the transaction, log and retry through existing job mechanisms where possible.

The initiating API should not return partial success for a manual propagation merge.

## Testing

Unit tests should cover:

- Personal merge propagates to duplicate shared-space people in multiple spaces.
- Space editor merge propagates into personal people for affected members.
- Space editor merge propagates to other shared spaces that have duplicate profiles for the same identity set.
- Spaces with only one affected profile keep that profile and update its identity.
- Target metadata wins and source metadata fills blanks only.
- Favorite, hidden, and manual representative choices are not overwritten.
- `person` and `pet` mixed merges abort.
- Shared-space aliases migrate and existing survivor aliases win conflicts.
- Propagation plan is deterministic.
- Transaction rolls back if one planned profile merge fails.
- Automatic reconciliation still skips same-owner and same-space conflicts instead of force-merging profiles.
- Shared-space activity payload records origin, activity role, propagation counts, and affected spaces.
- Propagated space-to-space merges write activity in every affected shared space.

Repository-level tests should cover:

- Personal profile merge helper reassigns faces and deletes the source profile.
- Shared-space profile merge helper reassigns faces, migrates aliases, recounts, and deletes the source profile.
- Identity merge helper can collapse identities after profile conflicts have been resolved.

## Future Tightening

If open propagation causes problems, do not rewrite the merge logic. Change the planner policy.

Possible later policies:

- Auto-apply only in the initiating scope and spaces owned by the actor.
- Auto-apply to shared spaces, but queue personal profile merges for the owner.
- Trust specific spaces or members for automatic personal propagation.
- Require approval when a propagated personal merge would affect named people or many faces.

The v1 planner should preserve enough information to support these policies later.
