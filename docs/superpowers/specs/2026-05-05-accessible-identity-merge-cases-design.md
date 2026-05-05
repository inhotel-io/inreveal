# Accessible Identity Merge Cases Design

## Problem

Users expect people they can access through shared spaces to behave like the same person when they upload, browse, filter, and manually merge photos. Today that sameness is incomplete. The system can show duplicates when access arrives after both users already have local people, and some manual merge paths still treat personal people and space people as incompatible row types.

The product rule is:

- A real person or pet should appear once in a viewer's accessible people experience when there is strict evidence that scoped profiles represent the same identity.
- Access changes decide which assets are visible, not whether an already-known identity relationship exists.
- Ambiguous matches must remain separate until a user manually merges them.

## Vocabulary

- **Face identity**: the durable internal sameness key for one real person or pet.
- **Scoped profile**: either a user-owned `person` row or a space-owned `shared_space_person` row.
- **Identity merge**: joining two face identities so their scoped profiles resolve as one visible person when access allows.
- **Physical profile merge**: moving faces between profiles and deleting the source row inside one physical scope, such as `person` to `person` or same-space `shared_space_person` to `shared_space_person`.
- **Strict automatic merge**: an identity merge performed without user confirmation only when the system has one clear compatible candidate.
- **Manual merge**: a user-confirmed merge. Manual merge is required for ambiguous matches.

## Design Direction

Use face identities as the grouping layer. Personal people and space people remain scoped profiles that carry display metadata and access boundaries.

Queries must always enforce current access:

```text
viewer
  -> owned assets and timeline-enabled shared-space assets
  -> visible faces
  -> face identities
  -> accessible scoped profiles
  -> one visible people result per identity
```

Identity merges may persist after a member leaves a space. That is acceptable because access-scoped queries still remove assets and profiles the viewer can no longer access.

## Strict Automatic Merge Policy

Automatic merge is allowed only when all of these are true:

- The operation has a current access bridge, such as shared-space membership or an asset being added to a space.
- Target and source have the same type, for example person-to-person or pet-to-pet.
- Face distance is within the configured facial-recognition threshold.
- There is a single clear candidate. If more than one candidate is inside the threshold, skip automatic merge.
- The merge would not create two profiles for the same identity in the same owner scope or the same space scope.
- Neither side is hidden or ignored in a way that would make the automatic merge surface something the user deliberately suppressed.
- The merge is not blocked by an explicit manual split or do-not-merge rule if that rule exists.

For the first implementation, "single clear candidate" should be implemented conservatively:

- Search enough results to detect ambiguity, not just the best match.
- Auto-merge only when exactly one compatible candidate is returned within threshold.
- If two space people point at the same local candidate, or two local people point at the same space identity in the same pass, skip those candidates and leave them for manual merge.

No suggested-merge state is required in this pass. Ambiguous duplicates remain visible and can be manually merged.

## Automatic Merge Cases

### Upload After Shared Access, No Local Profile Yet

B is already a member of a space containing A's Pierre. B uploads a new Pierre photo, but B has never had a personal Pierre profile.

Expected behavior:

- B does not see a second Pierre in `/people` or `/explore`.
- The uploaded face is attached to the accessible Pierre identity.
- B's uploaded photo appears on the identity-wide Pierre view.
- If B later leaves the space, B still sees B's uploaded Pierre photo and loses A's shared-space photos.

The backend may still create a B-owned `person` row as the backing profile for B's face because `asset_face.personId` is owner-scoped. If it does, that profile must be linked to the existing accessible identity before user-facing people results can surface it as a duplicate.

### Upload After Shared Access, Existing Local Duplicate

B is already a member of a space containing A's Pierre. B already has a local Pierre profile from earlier uploads. B uploads another Pierre photo.

Expected behavior:

- Recognition can use B's local person for `asset_face.personId`.
- The local identity should still be compared with accessible shared identities.
- If the match is strict, B's local Pierre identity merges into the accessible Pierre identity.
- B sees one Pierre identity, not one local Pierre and one space Pierre.

### Join After Both Users Already Have Local People

A uploads Pierre. B uploads Pierre. A creates space X, adds A's Pierre photo, then invites B.

Expected behavior:

- Joining or rejoining space X triggers reconciliation for the new member.
- Existing space people in X are compared against B's local people.
- Strict matches merge identities.
- Ambiguous or conflicting matches remain separate for manual merge.

This reconciliation must run after the membership exists, because the membership is the access bridge that makes the comparison valid.

### New Space Evidence While Members Already Exist

A and B are already members of space X. A later adds a Pierre photo to the space, or a linked library sync adds new Pierre evidence.

Expected behavior:

- Shared-space face matching creates or updates the space person.
- The new or updated space person is reconciled against existing members' local people.
- Strict local matches merge identities.
- Ambiguous matches remain separate.

This covers the inverse of the join case: access already exists, but the space evidence arrives later.

### Member Adds Their Own Photo To A Space With Existing Pierre

Space X already has A's Pierre. B adds a B-owned Pierre photo to X.

Expected behavior:

- B's face keeps a B-owned backing person profile.
- The space should not keep two Pierre space people when the match is strict.
- The B-owned identity and A-backed space identity merge.
- The shared-space profile remains scoped to X and continues to use only faces/assets visible in X.

### Space-Person Dedup

Two space people in the same space can represent the same real person.

Expected behavior:

- If both are identity-less and are a strict match, physically merge the space profiles.
- If one or both already have identities and are a strict match with no same-space conflict, merge identities and then physically merge the same-space profiles when safe.
- If identity merge would create a same-space conflict that cannot be physically resolved first, skip automatic merge.

The current "skip identity-backed space people" behavior is too conservative for this policy.

### Manual Personal Merge

Two B-owned personal people are merged.

Expected behavior:

- Keep the existing physical personal merge behavior: reassign faces from source to target and delete the source person.
- Merge the source identity into the target identity.
- Backfill shared-space metadata for affected identities.

### Manual Same-Space Merge

Two space people inside the same space are merged by an editor.

Expected behavior:

- Keep the existing physical same-space merge behavior: reassign `shared_space_person_face` rows, migrate aliases, and delete the source space person.
- Merge supporting identities when compatible.
- Re-run dedup and metadata backfill for affected identities.

## Cross-Scope Manual Merge

Manual merge must support scoped profiles from different physical tables:

- personal person + space person
- space person + space person across different spaces
- mixed batches containing personal and space profiles

Expected behavior:

- Use scoped identity repair, not physical row merge.
- Validate current access to every selected scoped profile.
- Validate same type.
- Validate that the identity merge would not leave two different personal profiles for the same owner on one identity.
- Validate that the identity merge would not leave two different space profiles in the same space on one identity.
- Merge identities with source `manual`.
- Do not reassign shared-space faces into a personal person.
- Do not delete a space person row in a cross-scope merge.

The old scope-specific APIs remain valid for same-scope physical merges:

- `/people/:id/merge` is personal-to-person.
- `/spaces/:spaceId/people/:personId/merge` is same-space space-person-to-space-person.
- `POST /people/same-person` is the cross-scope identity repair path.

Any UI that allows mixed candidates must call the scoped identity repair endpoint. It must not send a space-person id to the personal merge endpoint or a personal person id to the same-space merge endpoint.

## Leaving Or Losing Access

Identity merges are not undone when access changes.

When B leaves or is removed from a space:

- B keeps B-owned photos and B-owned personal profiles.
- B loses A's shared-space photos and space-only profiles from global people, search, filters, and timeline.
- If B had uploaded Pierre while access existed, B still sees B's uploaded Pierre under the same local identity-backed profile.
- If B rejoins later, the previously merged identity becomes unified again through current access.

When a space is deleted or face recognition is disabled:

- Personal profiles and identity links remain.
- Space profiles stop contributing to global results once access or space evidence is gone.
- Backfill should refresh metadata so inaccessible space profiles no longer determine visible labels or thumbnails.

## Non-Merge Cases

Automatic merge must not happen for:

- person-to-pet or any incompatible type pair
- no current access bridge
- no face embedding
- no candidate within threshold
- multiple candidates within threshold
- same-owner personal profile conflicts
- same-space space profile conflicts that cannot be physically resolved first
- hidden or ignored profiles that should not be surfaced automatically
- profiles blocked by a manual split or do-not-merge rule

Names alone must not drive automatic merging. Names may help display metadata after identities are merged, but face evidence and access are the merge gates.

## Error Handling

Automatic reconciliation should be best-effort:

- Skip ambiguous candidates without failing the user action.
- Log incompatible identity or profile conflicts at debug or warn level with profile ids and space id.
- Do not block adding a member or adding an asset because reconciliation could not merge a candidate.
- Queue metadata backfill for identities that were merged.

Manual merge should fail clearly:

- inaccessible selected profile: bad request or forbidden, depending on the existing access semantics
- incompatible type: bad request
- same-scope conflict: bad request explaining that the conflicting profiles must be merged in their scope first
- stale profile id: not found or bad request

## Testing

Add focused unit tests first, then medium or route tests where the behavior depends on query access rules.

Required automatic merge tests:

- B uploads Pierre after joining a space with A's Pierre and has no local Pierre yet; one visible identity is produced and B keeps B's photo after leaving.
- B uploads Pierre after joining a space with A's Pierre and already has a local duplicate; strict match merges the local identity into the accessible shared identity.
- A and B already have local Pierre profiles, then B joins A's space; add-member reconciliation merges strict matches.
- A adds Pierre evidence to a space after B is already a member; new-space-evidence reconciliation merges B's existing local Pierre.
- B adds a B-owned Pierre photo to a space with A's Pierre; space dedup and identity merge produce one Pierre.
- Ambiguous matches within threshold are skipped.
- Type mismatches are skipped.
- Same-owner and same-space conflicts are skipped.

Required lifecycle tests:

- After B leaves a space, B still sees B-owned Pierre photos and no longer sees A's shared-space Pierre photos.
- A shared-space profile id stops resolving for B after B loses access.
- B rejoins later and the identity resolves as unified again.

Required manual merge tests:

- personal + personal still uses physical personal merge and identity merge.
- same-space space + space still uses physical space merge and identity merge.
- personal + space-person uses scoped identity repair and does not throw.
- space-person + space-person across different spaces uses scoped identity repair.
- mixed batch uses scoped identity repair unless every profile is in the same physical scope.
- cross-scope merge rejects inaccessible profiles, type mismatches, and same-scope conflicts.

Required web tests:

- The personal detail merge UI calls `mergeScopedPeople` when a selected candidate has a space primary profile.
- The space person detail merge UI calls `mergeScopedPeople` for mixed personal/space candidates.
- Any remaining merge modal that can receive mixed candidates uses scoped refs instead of raw `/people/:id/merge`.

## Non-Goals

- Do not add suggested duplicates in this pass.
- Do not expose raw `face_identity.id` values.
- Do not unmerge identities on space leave.
- Do not publish private personal metadata beyond the existing metadata inheritance rules.
- Do not make names or aliases automatic merge evidence.
