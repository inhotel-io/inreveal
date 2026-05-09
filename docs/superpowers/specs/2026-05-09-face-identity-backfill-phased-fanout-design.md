# Face Identity Backfill Phased Fan-Out Design

## Problem

The current face identity backfill can repair personal identities, shared-space person identities, and shared-space face projections, but the queue orchestration treats all remaining work as one broad `hasBackfillWork()` boolean. That makes the service unable to distinguish between "identity data is still incomplete" and "identity data is clean, but shared-space projections need materialization."

This matters for correctness and scale. If identity work is still appearing or being repaired, queuing shared-space face-match work can run projection jobs against unstable inputs. If the only remaining work is projection repair, running full shared-space rematches is too expensive for large libraries and can produce the multi-day fan-out behavior observed in production.

The design goal is to make the backfill pipeline phase-aware: repair identities first, then queue only the exact shared-space projection work that is safe and necessary.

## Goals

- Prevent identity backfill from queueing `SharedSpaceFaceMatchAll`.
- Queue targeted `SharedSpaceFaceMatch` jobs only for stale or missing `(spaceId, assetId)` shared-space projections.
- Never queue shared-space projection work while personal or shared-space identity repair work remains.
- Preserve correctness when the same photo appears in many spaces, including direct space assets and library-linked spaces.
- Avoid data loss or stale data when a backfill is retriggered while another backfill is pending or running.
- Keep existing full face-recognition reset behavior intact.
- Add TDD coverage for all backfill triggers, queue transitions, edge cases, and race-safety invariants.

## Non-Goals

- Replacing BullMQ with a database-backed scheduler.
- Splitting face recognition into a separate shared-space recognition queue in this phase.
- Changing face detection or facial recognition concurrency.
- Changing shared-space membership, library-link, visibility, archive, hidden-person, or deleted-face semantics.
- Rebuilding the full generation-based backfill coordinator. This design leaves that option open.

## Chosen Architecture

Use a phased backfill model with separate repository checks for identity-layer work and shared-space projection work.

The repository exposes a work summary:

```ts
type FaceIdentityBackfillWork = {
  hasPersonalIdentityWork: boolean;
  hasSpacePersonIdentityWork: boolean;
  hasSharedSpaceProjectionWork: boolean;
};
```

`hasPersonalIdentityWork` covers missing `person.identityId` rows and assigned visible faces that still need a `face_identity_face` link.

`hasSpacePersonIdentityWork` covers existing shared-space people whose assigned faces now point to a different identity and therefore need repair, splitting, moving, recounting, or orphan cleanup.

`hasSharedSpaceProjectionWork` covers enabled shared spaces where eligible identity-linked faces are missing a shared-space assignment or have a stale shared-space assignment.

The service keeps the current paged `FaceIdentityBackfill` job, but it only advances into projection fan-out after the identity phases are clean. If identity work remains after a page completes, the service queues another `FaceIdentityBackfill` root job and returns. It does not query projection targets, queue face-match jobs, or queue metadata backfill from that incomplete state.

Once identity work is clean, the service asks the repository for exact shared-space projection targets and queues one targeted `SharedSpaceFaceMatch` per unique `(spaceId, assetId)`.

## Queue Flow

`AppBootstrap` checks whether any backfill work exists. If work exists and no `FaceIdentityBackfill` is active, waiting, delayed, or paused on `QueueName.PeopleBackfill`, it queues one root `FaceIdentityBackfill` job.

Manual `FaceIdentityBackfill` starts also queue the same root job. Stable job ids in `JobRepository` dedupe duplicate root and cursor jobs while they are pending.

`FaceIdentityBackfill` execution follows this sequence:

1. Run the personal identity phase for up to `FACE_IDENTITY_BACKFILL_CHUNK_SIZE` people.
2. If the personal phase returns `nextCursor`, queue the next personal page and stop.
3. Run the shared-space person identity phase for up to `FACE_IDENTITY_BACKFILL_CHUNK_SIZE` shared-space people.
4. If the shared-space person phase returns `nextCursor`, queue the next shared-space person page and stop.
5. Read the phase-aware work summary.
6. If personal or shared-space person identity work remains, queue one root `FaceIdentityBackfill` and stop.
7. If only shared-space projection work remains, read exact projection targets.
8. Merge exact projection targets with targets returned by the identity repair methods.
9. Deduplicate and sort targets by `(spaceId, assetId)`.
10. Queue targeted `SharedSpaceFaceMatch` jobs in bounded `queueAll` chunks.

Targeted identity-backfill face-match jobs use:

```ts
{
  name: JobName.SharedSpaceFaceMatch,
  data: { spaceId, assetId, source: 'identity-backfill' },
}
```

The `source` keeps identity-backfill rematches distinct from normal incremental rematches for BullMQ job-id dedupe. It must not change handler behavior.

## Safety Invariants

The main invariant is:

> Shared-space projection work must never be queued while identity-layer work remains.

This prevents projection jobs from materializing against half-repaired identity data.

Additional invariants:

- `FaceIdentityBackfill` may requeue itself, but it must not fan out to shared-space face matching until identity work is clean.
- `SharedSpaceFaceMatchAll` is only used by explicit full rebuild paths such as force face recognition reset and shared-space full rebuild flows.
- Targeted backfill fan-out is bounded by unique `(spaceId, assetId)` projection targets, not by `faces * spaces`.
- Projection target discovery must respect the same eligibility rules as shared-space face matching: enabled spaces only, eligible asset visibility only, non-deleted assets, non-offline assets, visible non-deleted assigned faces, and identity-linked faces.
- Direct asset membership and library membership must dedupe to one target per `(spaceId, assetId)`.
- If a targeted job executes after the asset, space, library link, or face state changes, the existing `SharedSpaceFaceMatch` handler re-checks current state and skips or updates idempotently.
- A full face recognition reset remains the authoritative full rebuild path and continues to clear shared-space person state before queueing full shared-space rebuild work.

## Metadata Strategy

Avoid global `SharedSpacePersonMetadataBackfill` from the identity-backfill finalization path when targeted face-match jobs are queued. A global metadata job can run on `QueueName.PeopleBackfill` before `SharedSpaceFaceMatch` jobs on `QueueName.FacialRecognition`, which can refresh metadata against stale projections.

Instead:

- `SharedSpaceFaceMatch` continues to inherit metadata for touched space people while processing affected assets.
- Dedup and reconciliation continue to queue scoped metadata backfills for affected identities.
- Space-person identity repair should return affected targets, and if metadata-only repair is required, queue scoped metadata by identity rather than global metadata.
- Global `SharedSpacePersonMetadataBackfill` remains available for explicit manual/global metadata invalidation paths.

This keeps identity backfill from starting broad metadata work before the targeted projection layer has caught up.

## Trigger Matrix

The implementation must cover every place that can start or continue backfill work:

- App bootstrap with no work: queue nothing.
- App bootstrap with work and no active/pending backfill: queue one root `FaceIdentityBackfill`.
- App bootstrap with active, waiting, delayed, or paused `FaceIdentityBackfill`: queue nothing.
- Manual `FaceIdentityBackfill`: queue root job only.
- Manual retrigger while root is pending: BullMQ stable id dedupes to one executable root.
- Manual retrigger while a cursor page is pending: root/cursor ids remain stable and no immediate fan-out occurs.
- Paged personal identity backfill with `nextCursor`: queue only next personal page.
- Final personal identity page: continue to shared-space person phase.
- Paged shared-space person identity backfill with `nextCursor`: queue only next shared-space person page.
- Final shared-space person identity page with remaining identity work: queue root backfill only.
- Final shared-space person identity page with projection-only work: queue targeted face-match jobs only.
- Final page with no remaining work and no affected targets: queue nothing.

## Repository Test Matrix

Repository tests must prove each category independently:

- Missing `person.identityId` is identity work.
- Assigned visible face without `face_identity_face` is identity work.
- Shared-space person attached to faces with mismatched identities is shared-space person identity work.
- Missing shared-space person-face assignment for an eligible identity-linked face is projection work.
- Stale shared-space person-face assignment with the wrong identity is projection work.
- Already-correct projection is not returned as a target.
- Direct shared-space asset membership returns the target.
- Library-linked shared-space membership returns the target.
- Direct plus library membership for the same asset and space dedupes to one target.
- Same photo in 10 enabled spaces returns exactly 10 targets.
- Disabled spaces are excluded.
- Deleted assets are excluded.
- Offline assets are excluded.
- Ineligible asset visibility is excluded.
- Deleted faces are excluded.
- Invisible faces are excluded.
- Unassigned faces are excluded.
- Faces without identity links are not projection targets; they are identity work instead.

## Service Test Matrix

Service tests must prove queue behavior and race-safety:

- Backfill does not call projection target discovery while a personal page has `nextCursor`.
- Backfill does not call projection target discovery while a shared-space person page has `nextCursor`.
- Backfill requeues itself when the phase-aware summary reports remaining identity work after both pages complete.
- Backfill does not queue `SharedSpaceFaceMatch`, `SharedSpaceFaceMatchAll`, or metadata when identity work remains.
- Backfill queries projection targets only when identity work is clean and projection work remains.
- Backfill queues exactly the returned projection targets plus affected targets from repair methods.
- Duplicate targets from repair results and projection discovery dedupe to one job.
- More than one chunk of targets is split into bounded `queueAll` calls.
- Exactly one full chunk does not produce an empty trailing `queueAll([])`.
- Empty target list produces no `queueAll` call.
- Targeted jobs include `source: 'identity-backfill'`.
- Identity-backfill targeted job ids do not collide with normal incremental `SharedSpaceFaceMatch` job ids.
- `SharedSpaceFaceMatchAll` is never queued by identity backfill.
- Force face recognition reset still queues `SharedSpaceFaceMatchAll` for enabled spaces.

## Race and Edge Cases

Tests must explicitly cover:

- A full face recognition reset is already running and face identity backfill is retriggered. The backfill may queue or dedupe its root job, but it must not increase face recognition concurrency and must not queue full shared-space rebuilds.
- A second face identity backfill trigger arrives while one is active or waiting. Only one root job should execute.
- New identity work appears between the final page and the final work summary. The service must requeue identity backfill only.
- New projection work appears after identity work is clean. The service must queue targeted projection jobs only.
- A target asset belongs to 10 spaces. The service must queue 10 jobs, not a full rebuild and not duplicate jobs per face.
- A target asset has multiple faces in the same space. The service must queue one asset-level job for that space.
- A target disappears before execution. The handler must skip safely using current-state checks.
- A space disables face recognition before execution. The handler must skip safely.
- A stale shared-space assignment is moved from one identity to another. Old and new affected persons are recounted and orphan cleanup runs.
- Failed targeted jobs remain visible according to existing queue failure policy.

## TDD Requirements

Implementation must follow strict red-green-refactor:

1. Add one failing unit or medium test for a single behavior.
2. Run the focused command and confirm it fails for the expected reason.
3. Implement the minimal production change.
4. Run the focused command and confirm it passes.
5. Repeat for the next behavior.

Do not add production code for a behavior until its failing test exists.

Focused verification must include:

- `corepack pnpm --dir server test src/services/person.service.spec.ts src/repositories/job.repository.spec.ts`
- Focused medium repository tests for `face-identity.repository.spec.ts`
- Focused medium metadata/shared-space tests for legacy imported metadata faces and same-photo multi-space behavior
- `corepack pnpm --dir server check`
- `corepack pnpm --dir server lint`
- `corepack pnpm --dir server test`

If broad medium tests require unavailable local EXIF fixtures, run the focused medium tests that cover the changed database behavior and document the fixture limitation.

## Rollout

This change is safe for existing pending work because root and cursor `FaceIdentityBackfill` jobs continue to use the same job name and data shape. Already pending backfill pages will execute the new phase-aware finalization after deployment.

Existing `SharedSpaceFaceMatchAll` jobs already queued by full recognition resets remain valid and should complete normally. The new identity-backfill path simply stops creating more full rebuild jobs.

After deployment, verify on the large personal instance:

- `PeopleBackfill` does not repeatedly create full shared-space rebuild jobs.
- `FacialRecognition` queue growth is bounded by targeted `(spaceId, assetId)` jobs from backfill plus any explicit full reset work.
- The same photo in many spaces queues one target per enabled space.
- Personal people statistics and all-photos shared-space statistics converge after targeted jobs drain.
- No new mismatch appears between detected faces, assigned visible people, hidden people, and unassigned counts.
