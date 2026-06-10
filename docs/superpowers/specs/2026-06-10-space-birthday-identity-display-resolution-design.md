# Space-person birthday display resolution

**Date:** 2026-06-10
**Status:** Approved (design)
**Area:** server — `face-identity.repository.ts` read-time person resolution

## Problem

After the rc4 fix ("persist space people birthdays globally"), an editor in a shared
space can set a birthday and it is correctly stored on that space's
`shared_space_person` row. But the library owner (and other viewers) see an **empty**
birthday field for that person, even though a birthday exists on a sibling profile of
the same identity.

### Reproduction

1. Log in as a user with editor role in a shared space.
2. Open a named person in `/people`, set a birthday.
3. Log out; log in as the library owner (admin).
4. Open the same person in `/people` — the birthday field is empty.

### Observed data (one identity, 4 spaces)

| Profile                       | birthDate    | birthDateSource | note                          |
| ----------------------------- | ------------ | --------------- | ----------------------------- |
| `shared_space_person` (Karolin) | `2014-02-14` | `manual`        | set today by an editor        |
| `shared_space_person`          | `NULL`       | `none`          |                               |
| `shared_space_person`          | `NULL`       | `none`          |                               |
| `shared_space_person`          | `2013-02-14` | `manual`        | set earlier by a different user (wrong year) |
| `person` (owner library)      | `NULL`       | n/a             | never touched by space edits  |

## Root cause

Person metadata is **resolved at read time**, not written back to `person`. The owner
seeing a space-set *name* is not a write — it is a query-time `COALESCE` in
`FaceIdentityRepository.hydrateAccessiblePeople` (`face-identity.repository.ts`, the
`profiles` → `ranked_profiles` → final `SELECT` CTE chain). This same path serves both
the people list (`getAccessiblePeople`) and the single-person view
(`getAccessiblePersonByProfileId`).

The resolver builds a `profiles` CTE union of the owner's `person` row plus every
visible `shared_space_person` row for the identity, then ranks them:

- `display_rn` — "best **named** profile" (ordered by has-name, then `profileRank`
  where the owner's `person` = 0, then name alpha, then recency).
- `primary_rn` — "canonical profile" (ordered user-person-first → the owner's `person`).

The final projection resolves:

```sql
COALESCE(NULLIF(display_profiles.name, ''), primary_profiles.name, '') AS name,
COALESCE(display_profiles."birthDate", primary_profiles."birthDate") AS "birthDate",
```

**Name** has a dedicated "best name" ranking (`display_rn`), so it finds a name wherever
it lives. **Birthday has no ranking of its own** — it piggybacks on the name-winner and
the owner. In the reproduction, the owner's `person` row is named (so it wins both
`display_rn` and `primary_rn`) but has a NULL birthday, so `birthDate` resolves to
`COALESCE(NULL, NULL) = NULL`. The `2014-02-14` on Karolin's space-person — which is
neither the best-named profile nor the owner — is never consulted.

This is purely a **read/display** defect. Both the write path and the stored rows are
working as designed.

## Decision

Give `birthDate` its own selection across all profiles of the identity, symmetric to how
`name` has `display_rn`. **Read-time only — no write-back to `person`, no change to the
write-time backfill or stored rows.** This matches the existing name design exactly
(names are never persisted to `person`; they are resolved on read).

### Birthday precedence (when multiple profiles carry a birthday)

**Owner first, then most-recent manual.** If the owner's own `person` row has a birthday,
show it. Otherwise show the most recently edited manual birthday among the visible
profiles. Implemented as an ordering where NULL birthdays sort last, so the owner only
"wins" when they actually have a value.

## Implementation

A single SQL change in `FaceIdentityRepository.hydrateAccessiblePeople`. Three edits:

### 1. `profiles` CTE — carry birthday provenance on both branches

The `person` table has only `birthDate` (no `birthDateSource` / `birthDateSourceUpdatedAt`
columns — confirmed in `person.table.ts`). The owner's value is authoritative by position,
so synthesize a source for it:

- **person branch:**
  ```sql
  CASE WHEN person."birthDate" IS NOT NULL THEN 'manual' ELSE 'none' END AS "birthDateSource",
  person."updatedAt" AS "birthDateSourceUpdatedAt",
  ```
- **space-person branch:**
  ```sql
  shared_space_person."birthDateSource",
  shared_space_person."birthDateSourceUpdatedAt",
  ```

### 2. `ranked_profiles` — add a `birthdate_rn` window (birthday analog of `display_rn`)

```sql
row_number() OVER (
  PARTITION BY profiles."identityId"
  ORDER BY
    profiles."birthDate" IS NULL,                                          -- birthday-bearing first
    CASE WHEN profiles."profileType" = 'user-person' THEN 0 ELSE 1 END,    -- owner/self first → owner wins IF present
    CASE profiles."birthDateSource"
      WHEN 'manual' THEN 0 WHEN 'inherited' THEN 1 ELSE 2 END,             -- manual over inherited
    profiles."birthDateSourceUpdatedAt" DESC NULLS LAST,                   -- most-recent manual
    profiles."updatedAt" DESC,
    profiles."profileId"                                                   -- stable tiebreak
) AS birthdate_rn
```

Because NULL birthdays sort last (line 1), the owner row only reaches `birthdate_rn = 1`
when it actually has a birthday. When the owner has none, the most-recent manual space
value wins — exactly "owner first, then most-recent manual."

### 3. Final SELECT — resolve from the new alias

```sql
COALESCE(birthdate_profiles."birthDate", primary_profiles."birthDate") AS "birthDate",
```

and add the join:

```sql
INNER JOIN ranked_profiles AS birthdate_profiles
  ON birthdate_profiles."identityId" = requested_identities."identityId"
  AND birthdate_profiles.birthdate_rn = 1
```

All other projected columns (`name`, thumbnail, hidden, favorite, counts, etc.) are
unchanged. `name` continues to resolve via `display_profiles` exactly as today.

## Scope / non-goals

- **No write-back to `person`.** The owner's library `person.birthDate` stays editor-immutable;
  the owner simply *sees* the resolved identity birthday, identically to how they see a
  space-set name today.
- **No change to the write-time backfill** (`inheritSpacePersonMetadata`) or to the
  diverging stored `shared_space_person` rows. Space D's stale `2013-02-14` remains in the
  DB; it would only surface if it were the most-recent manual value *and* no owner value
  existed — consistent and acceptable.
- **No schema migration.** All columns used already exist.
- **No new endpoint or DTO change.** `PersonResponseDto.birthDate` is already populated by
  this resolver.

## Testing (TDD)

`hydrateAccessiblePeople` is raw SQL, so the failing-test-first must be a **medium test
against a real Postgres** (testcontainers), in the `FaceIdentityRepository` medium suite.
The exact harness/fixtures (identity, person, space, member, shared_space_person,
shared_space_person_face, asset_face) will be confirmed when writing the plan.

Tests (write first, watch fail, then implement):

1. **Repro / primary fix (list view):** owner `person` named with NULL birthday + one
   space-person with a manual birthday + NULL siblings → `getAccessiblePeople` returns the
   owner's resolved person with the space birthday. (Red today.)
2. **Single-person view:** same fixture via `getAccessiblePersonByProfileId` → resolves the
   same birthday. (Red today; same SQL, explicit coverage.)
3. **Owner precedence:** owner has a birthday AND a space has a different manual birthday →
   owner's value wins.
4. **Most-recent-manual tiebreak:** two spaces with manual birthdays, different
   `birthDateSourceUpdatedAt`, owner has none → the most-recent manual value wins.
5. **No-birthday-anywhere:** all profiles NULL → resolves NULL (no regression / no crash).
6. **Name unaffected:** existing name-resolution assertions still pass (regression guard).

## Affected files

- `server/src/repositories/face-identity.repository.ts` — the `hydrateAccessiblePeople` SQL.
- `server/src/repositories/face-identity.repository.spec.ts` (or the corresponding medium
  test file) — new fixtures + assertions.
