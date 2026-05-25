# People Search AND Bugfix Design

Status: pending written-spec review
Date: 2026-05-25
Worktree: `/Users/pierre/dev/gallery/.worktrees/issue-628-people-search-and`
Branch: `fix/issue-628-people-search-and`
Issue: https://github.com/open-noodle/gallery/issues/628

## Problem

When a user selects two or more people in Gallery search/filter flows, results can include assets containing any selected person. Issue #628 reports that Immich returns photos containing all selected people, while Gallery returns photos containing either selected person.

This is a bugfix, not an OR/AND feature. The default meaning of multiple selected people should be "contains every selected person".

## Goals

- Make multi-person asset filtering use AND semantics by default.
- Preserve the existing explicit OR escape hatch where code already passes `personMatchAny`.
- Cover legacy user-person IDs, identity-group filters, and shared-space person filters.
- Avoid API, URL, SDK, or UI changes.
- Keep the fix server-side so every caller gets consistent behavior.

## Non-Goals

- Do not add a user-facing OR/AND toggle.
- Do not add a new DTO field or query parameter.
- Do not change tag, album, camera, location, rating, favorite, or media filters.
- Do not refactor unrelated search or timeline code.

## Current Behavior

The search repository already has both semantics:

- `hasPeople()` and `hasFaceIdentities()` require all selected people or identities.
- `hasAnyPerson()` and `hasAnyFaceIdentity()` match any selected person or identity.
- `searchAssetBuilder()` uses `personMatchAny` to choose OR, otherwise it uses AND for normal `personIds`.
- Smart search also defaults to one visible-face `EXISTS` predicate per selected person unless `personMatchAny` is set.

The inconsistent path is timeline browsing. `AssetRepository.getTimeBuckets()` and `AssetRepository.getTimeBucket()` currently use the OR helpers for `personIds`, `identityIds`, and `spacePersonIds`. That means URLs such as `/photos?people=a,b` can show timeline results containing either person.

Shared-space person filters are also OR-only in the shared helper `hasAnySpacePerson()`, and `searchAssetBuilder()` currently applies that helper whenever `spacePersonIds` are present.

## Design

### Repository Semantics

Default people filters should be AND:

- `personIds`: use `hasPeople()`.
- `identityIds`: use `hasFaceIdentities()`.
- `spacePersonIds`: add and use a new `hasSpacePeople()` helper.

`hasSpacePeople()` should mirror the existing `hasSpacePerson()` predicate for each selected shared-space person and combine those predicates with `AND`. This avoids relying on grouping across `shared_space_person_face` joins and keeps the intended semantics easy to read.

Explicit OR should remain possible only through existing OR-specific helpers:

- `personMatchAny` continues to select `hasAnyPerson()` in `searchAssetBuilder()`.
- Existing callers that intentionally pass `personMatchAny: true` keep their behavior.

There is no new public API flag.

### Affected Query Paths

Update these paths to use default AND semantics:

- `searchAssetBuilder()` for `spacePersonIds`.
- `AssetRepository.getTimeBuckets()` for `personIds`, `spacePersonIds`, and `identityIds`.
- `AssetRepository.getTimeBucket()` for `personIds`, `spacePersonIds`, and `identityIds`.

Metadata search and smart search already use AND for normal `personIds` and `identityIds`; they should be covered by regression tests, not redesigned.

### Data Flow

The frontend continues to serialize selected people as it does today:

- Global photos filters put selected people in `personIds`.
- Space pages pass selected space people as `spacePersonIds`.
- Scoped tokens are resolved by service-layer logic into legacy person IDs, identity IDs, and/or space person IDs.

After resolution reaches repositories, each selected people-related ID narrows the candidate asset set.

### Error Handling

No new error cases are introduced. Existing invalid-token, inaccessible-token, and empty-result behavior remains unchanged.

If a selected scoped person token resolves to an inaccessible person, existing `forceEmptyResult` behavior still applies.

### Testing

Add focused tests that prove multi-person filters are AND:

- Repository-level SQL shape tests for `getTimeBuckets()` and `getTimeBucket()` should no longer use `hasAnyPerson()`/`hasAnyFaceIdentity()` for default people filters.
- Unit or medium tests should cover timeline filtering with two people where only assets containing both are returned.
- Shared-space person filters should cover two selected space people and require both.
- Existing tests for `personMatchAny` should continue proving explicit OR behavior.
- Existing search repository tests for smart search and metadata search should continue passing.

## Implementation Notes

The likely implementation is small:

1. Add `hasSpacePeople()` in `server/src/utils/database.ts`.
2. Replace default timeline `hasAnyPerson()` calls with `hasPeople()`.
3. Replace default timeline `hasAnyFaceIdentity()` calls with `hasFaceIdentities()`.
4. Replace default `spacePersonIds` filters with `hasSpacePeople()`.
5. Add tests around the changed paths.

No generated OpenAPI or SDK updates are expected.
