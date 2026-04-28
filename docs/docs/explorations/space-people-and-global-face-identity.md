# Space People and Global Face Identity

This note captures an exploration around shared-space people, personal people, and how to avoid duplicate people when shared-space photos are displayed in a user's timeline.

## Problem

Gallery currently has two person concepts:

- `person`: a user-owned personal person cluster.
- `shared_space_person`: a space-owned person cluster derived from faces in a shared space.

When a user opts to display shared-space photos in their timeline, the timeline and filter panel should also expose people from those spaces. The hard part is avoiding duplicates when the same human appears as:

- a personal person in the user's library,
- a personal person in another user's library,
- one or more `shared_space_person` rows across multiple spaces.

The filter panel currently uses `getFilterSuggestions({ withSharedSpaces: true })`. This finds accessible assets from the user's own/partner libraries plus timeline-enabled shared spaces, then returns global `person` rows whose faces appear in those assets. It does not return `shared_space_person` rows unless the request is scoped to a single `spaceId`. This means it can collapse multiple references to the same global `person.id`, but it does not solve duplicate same-human rows across spaces or owners.

## Current Model

`asset_face` is the raw observation: one detected face in one asset. It points to a personal `person` through `asset_face.personId`.

`face_search` stores the embedding for each face.

`person` stores personal metadata such as name, hidden state, favorite state, birth date, color, type, species, and representative face.

`shared_space_person` stores space-specific metadata and clusters faces through `shared_space_person_face`. A space person is not just a wrapper around one personal person. It can represent faces whose underlying `asset_face.personId` values belong to different owners' personal people.

`shared_space_person_alias` stores user-specific aliases for a space person.

## Global Identity Idea

A potential long-term model is to add a global internal identity layer:

```text
asset_face -> face_identity -> scoped profiles
```

Where:

- `asset_face` remains the raw face observation.
- `face_identity` is an internal canonical cluster of face observations that likely represent the same human or pet.
- `person` becomes a user-scoped profile over an identity.
- `shared_space_person` becomes a space-scoped profile over an identity.

Possible tables:

```text
face_identity
  id
  representativeFaceId
  type
  createdAt
  updatedAt

face_identity_face
  identityId
  assetFaceId
  source: manual | ml | import | shared-space
  confidence

person.identityId
shared_space_person.identityId
```

The identity is an internal join key only. User-visible data must always be computed from assets and scoped profiles the current user can access.

## Privacy Risks

A global identity graph can accidentally leak information across libraries:

- Existence: one user may infer another private library contains the same person.
- Names: a name from an inaccessible profile may appear as a fallback.
- Thumbnails: a representative face may be chosen from an inaccessible asset.
- Counts: global counts can reveal inaccessible photo volume.
- Co-presence: identity-based suggestions can reveal that people appear together elsewhere.
- Search/autocomplete: names or ordering from inaccessible sources can leak.
- Hidden/favorite state: private curation choices can influence another user's display.
- Stable IDs: exposing a global identity ID lets clients correlate identities across contexts.
- Background side effects: automatic merges can visibly change another user's people list.

Safe rule: global identity may be used internally for dedupe, but every returned field must be computed only from accessible assets and accessible scoped profiles.

## Opt-In Rollout

The safer rollout is additive rather than replacing existing face/person behavior.

1. Shadow identity graph: build identities in the background, expose nothing, collect metrics about likely collapses and risky matches.
2. Space-boundary linking: use identities only inside a shared space first.
3. Opt-in unified People view: user setting to show accessible space people in `/people`.
4. Explicit import/link: let users add a space person to personal people or link it to an existing personal person.
5. Consider default-on only after telemetry and feedback.

Separate opt-ins may be needed:

- Display: show accessible space people in personal people surfaces.
- Linking: group duplicate identities across personal and space people.
- Contribution: allow private labels/thumbnails to help shared identity display.

Do not enable contribution in the first version.

## Immediate Issue

The immediate product need is narrower than a full identity graph:

When a user opts a shared space into their timeline, the filter panel should show people from those space photos, and the same human should not appear as duplicate rows across multiple spaces.

The current `withSharedSpaces` filter path includes shared-space assets, but it returns global `person` rows rather than `shared_space_person` rows. That is why it cannot fully represent space-specific people or aliases, and why dedupe across multiple spaces is not well-defined.

## Candidate Near-Term Approaches

### A. Global `person` Suggestions Only

Keep the existing behavior. Shared-space assets are considered, but people suggestions are global `person` records.

Pros:

- Lowest implementation cost.
- Existing API and UI mostly work.
- Dedupe by `person.id` is natural.

Cons:

- Does not expose unnamed or space-only people well.
- Does not respect space person names or aliases.
- Does not collapse same-human people across different owners.

### B. Mixed Personal and Space People Suggestions

Return a mixed list from filter suggestions:

```text
personal:personId
space:spaceId:spacePersonId
```

Then group rows by evidence:

- Merge if a space person contains faces linked to the current user's personal `person.id`.
- Merge if multiple space people link to the same personal `person.id`.
- Merge if the same `shared_space_person` appears through multiple matching assets.
- Do not merge by name alone.

Pros:

- Makes space people visible quickly.
- Preserves space aliases/names.
- Avoids unsafe name-based dedupe.

Cons:

- Requires filter DTOs and asset search to understand mixed person filter IDs.
- Cross-space duplicates remain when there is no shared personal person link.
- UI must explain or hide source differences.

### C. Scoped Identity Read Model

Add a read-only identity grouping service without changing writes:

```text
PeopleDirectoryService
  input: current user, timeline spaces, filters
  output: grouped person rows with source descriptors and capabilities
```

This service can use existing `person`, `shared_space_person`, `shared_space_person_face`, and `asset_face.personId` links to produce one row per inferred identity within the current access scope.

Pros:

- Focused on the user-visible problem.
- No schema migration required for the first version.
- Establishes the API shape needed for a future global identity graph.

Cons:

- It is a read-model heuristic, not a canonical identity system.
- Needs careful pagination, counts, and filter semantics.
- Still cannot confidently merge same-human rows without evidence.

## Current Recommendation

Start with approach C as a bridge toward the global identity model.

Build an access-scoped people directory read model for timeline-enabled spaces. Use explicit evidence only:

- personal `person.id`,
- `shared_space_person_face.assetFaceId`,
- underlying `asset_face.personId`,
- accessible space membership,
- user-specific aliases.

Do not dedupe by display name alone. If four spaces all contain the same human and those space people link back to the same personal `person.id`, show one row. If they do not have a shared identity signal, show separate rows or group them under a cautious "possible matches" affordance rather than silently merging.

This keeps the safe rollout path open while solving the filter-panel issue incrementally.
