---
title: Face Identity Backfill
sidebar_position: 12
---

# Face Identity Backfill

Gallery uses **Face Identities** as internal sameness keys across Personal People and Space People. The identity tables are not user-facing, but `/people`, people filter suggestions, global search, map filters, and album filters depend on the links being present.

There are two related backfills.

## Identity Link Backfill

`FaceIdentityBackfill` repairs legacy face-recognition data that predates identity-backed people.

It has two stages:

1. Personal people stage
   - Ensures each `person` row has a `face_identity`.
   - Links each visible, non-deleted `asset_face` assigned to that person into `face_identity_face`.
   - Skips hidden faces, deleted faces, and faces on deleted assets.

2. Space people stage
   - Looks at each legacy `shared_space_person` without an `identityId`.
   - Reads the identities of its linked visible faces.
   - Assigns the space person when all linked evidence points to exactly one identity and the space does not already have another person for that same identity.
   - Leaves ambiguous or duplicate space people unresolved and logs the conflict count.

The job is chunked and resumable. It processes personal people first, requeues itself with a cursor until that stage is complete, then does the same for space people.

When a shared-space identity-link page runs, it also queues `SharedSpacePersonMetadataBackfill`. Linking a legacy Space Person to an identity can make Personal People or other visible Space People newly eligible as name and birth-date sources.

## Identity Link Trigger

The microservices worker checks for identity backfill work on `AppBootstrap`.

It queues `FaceIdentityBackfill` when any of these are true:

- a `person` row has no `identityId`;
- a visible, non-deleted assigned face is missing a `face_identity_face` link;
- a legacy `shared_space_person` can be resolved to exactly one identity without creating a duplicate identity inside the same space.

This means upgraded installs should not require users to reset face recognition. Restarting the microservices worker is enough to re-run the check. Force-clearing face recognition is destructive and should only be a last-resort repair because it deletes existing recognition state and rebuilds people from scratch.

## Metadata Backfill

`SharedSpacePersonMetadataBackfill` recalculates inherited names and birth dates for identity-backed Space People. It does not merge identities and it does not overwrite manual space metadata.

For each identity-backed `shared_space_person`, it:

- gathers eligible source metadata from accessible Personal People and Space People;
- respects `sharePersonMetadata`, `showInTimeline`, space membership, space deletion, source Space Person visibility, target-space asset adders, and linked-library linkers;
- ranks candidates by space role, whether the source is the asset adder or library linker, and supporting face count;
- applies the inherited name or birth date only when the target field is unlocked (`none` or `inherited`);
- clears previously inherited fields when the old source is no longer eligible and no replacement source wins.

Manual target-space names and birth dates stay manual. Aliases are member-local and are not backfilled.

## Metadata Triggers

Metadata backfill is queued automatically when an operation can change inheritance:

- a Personal Person name or birth date changes;
- a Personal Person is deleted;
- scoped people are merged or detached;
- a Space Person name, birth date, or hidden state changes;
- an identity-backed Space Person is deleted;
- identity-backed Space People are merged by manual repair, face matching, or deduplication;
- a Shared Space is deleted;
- assets are removed from a Shared Space;
- a linked library is unlinked from a Shared Space;
- a member joins, leaves, is removed, or changes role;
- a member changes `showInTimeline` or `sharePersonMetadata`;
- an owner disables another member's metadata contribution.

When the changed operation is tied to one identity, the job is queued with that `identityId`. Membership, role, preference, and space deletion changes can affect many identities, so they queue a full metadata backfill.

## Product Effects

After identity links exist, these surfaces read the same identity-backed access model:

- `/people?withSharedSpaces=true`;
- global people search;
- Photos, Map, and Album filter-panel people suggestions;
- global and album-scoped asset searches filtered by person;
- explicit Shared Space people pages and space-scoped filters.

Outside an explicit space page, Shared Space people and assets only contribute through spaces where the viewer has `showInTimeline=true`. If a member disables **Show photos in timeline**, global people, global search, map filters, album filters, and metadata inheritance stop using that space. If the member enables it again, the next face sync or metadata backfill can restore eligible inherited metadata.
