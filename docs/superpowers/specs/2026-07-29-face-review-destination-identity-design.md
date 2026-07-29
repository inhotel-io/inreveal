# Face cleanup review: give the destination an identity

**Date:** 2026-07-29
**Branch:** `feat/face-review-unified` (PR #834)
**Status:** design approved, ready for implementation planning

## Problem

An admin opened a flagged cluster in the face-cleanup console and was told, in full:

> Default is → Unbenannter Cluster

One face, flagged, routed to an unnamed cluster. Nothing on the page said which cluster, how big it
was, what it looked like, or how to go and see it. The suggestion was unactionable — the only honest
response to it is "I have no idea", and the admin cannot get to one from this page.

The review page (`web/src/routes/admin/face-cleanup/[personId]/+page.svelte`) receives everything it
needs to identify the destination and renders almost none of it. `scanPerson.suspectedOwners[]`
already carries `{ ownerPersonId, ownerName, thumbnailFaceId, count }` per suspected owner
(`server/src/dtos/face-repair.dto.ts:82`). The page reads exactly one field off exactly one element:

```ts
const primaryOwner = $derived(scanPerson?.suspectedOwners?.[0] ?? null);
const ownerName = $derived(primaryOwner?.ownerName ?? $t('admin.face_cleanup_review_unnamed'));
```

That bare string is then interpolated into five places: the banner body, the `owner` tally chip, the
`owner`/`other` tile ribbons, the rest-of-cluster hint, and the move-entire-cluster confirmation.

Three distinct defects follow from it.

### D1 — the destination has no identity

No thumbnail, no size, no link. `thumbnailFaceId` arrives on every suspected owner and is discarded.
The destination cluster's own face count is not in the payload at all — `suspectedOwners[].count` is
_the number of flagged faces routing to that owner_, which is a different number and, on the reported
case, was `1`.

### D2 — `suspectedOwners[0]` is treated as the only destination

A cluster can flag faces toward several owners; `multiple-owners` is one of the scan's own
review reasons. Per-face routing already respects this — `FlaggedFace.suspectedOwnerId` is per face,
and `buildResolveRequest` groups by each face's own owner (`review.svelte.ts:233`). But every
_summary_ surface on the page hardcodes `[0]`:

- the banner names one destination for a cluster that has several;
- the `owner` tally chip counts faces bound for **all** owners and labels them with `[0]`'s name;
- **`Move entire cluster` sends every eligible face to `[0]`** (`+page.svelte:287`), silently
  overriding the routing of every face the scan attributed to a secondary owner;
- **rest-of-cluster staging** has the same hardcoded destination (`+page.svelte:384`), and offers no
  way to send those faces anywhere else.

The last two are not just display problems: they mis-route data, and the confirmation dialog does not
mention it.

### D3 — the zero-owner and deleted-owner cases render as lies

With no suspected owners at all, `ownerName` falls through `?? $t(…unnamed)` and the page announces
"Default is → Unnamed cluster" — a destination that does not exist. If the destination person was
deleted or merged after the scan, the page looks entirely normal and Apply fails with
`face-repair:destination-missing`, discovered only after the admin commits.

### D4 (adjacent) — the dashboard prints the wrong number under the destination

`ReviewFirstLane.svelte:166` renders `{dest.count} faces` directly beneath the destination's name,
where `dest.count` is the flagged-routing count. It reads as the destination cluster's size. On the
reported case the console said `Unbenannter Cluster / 1 faces`, describing a cluster that may hold
thousands. Same ambiguity, same root cause: one field named `count` doing duty for two concepts.

## Non-goals

- **Why the scan matched.** Surfacing per-face evidence (nearest matching faces, distance, vote
  margin) is a separate feature: the scan does not persist that evidence today. This spec answers
  "what is this destination", not "why was it suggested".
- **Renaming `suspectedOwners[].count`.** The name is the root of D4, but the field is persisted
  inside `face_repair_scan.persons` JSON. Renaming it needs a data migration or a read-time fallback
  for every existing scan row, for a cosmetic gain. It stays `count`, documented.
- **Changing flagged-tile routing.** `owner`-state faces continue to move to their own
  `face.suspectedOwnerId`. Nothing in this spec alters where an individual flagged face goes.

## Design

### 1. Server: two overlay-only fields on the suspected owner

`ScanSuspectedOwnerSchema` (`server/src/dtos/face-repair.dto.ts:82`) and its repository twin
`RepairScanSuspectedOwner` (`face-repair-scan.repository.ts:24`) gain:

| field            | type      | meaning                                |
| ---------------- | --------- | -------------------------------------- |
| `ownerFaceCount` | `number`  | the destination cluster's **own** size |
| `ownerMissing`   | `boolean` | the `person` row no longer exists      |

Both are **overlay-only**: computed at read time, never written into the persisted scan JSON. Nothing
about existing `face_repair_scan` rows changes, so there is no migration and no backfill.

The schema gets a comment fixing the distinction in place, because conflating these two numbers is
what produced D4:

```
count          — flagged faces on THIS cluster routing to this owner (persisted, scan-time)
ownerFaceCount — the destination person's own face count (overlay, live)
```

**Where they are filled.** `FaceRepairScanRepository.withCurrentNames` (`:211`) already re-fetches
every person and suspected-owner row on read to overlay live names and thumbnails — a scan snapshot
goes stale as people get named and thumbnails change. The same query grows a left join and an
aggregate:

```ts
.leftJoin('asset_face', (join) =>
  join
    .onRef('asset_face.personId', '=', 'person.id')
    .on('asset_face.deletedAt', 'is', null)
    .on('asset_face.isVisible', '=', true),
)
.select((eb) => eb.fn.count('asset_face.id').as('faceCount'))
.groupBy(['person.id'])
```

`ownerMissing` is `!byId.has(ownerPersonId)` — free from the map the method already builds.

Two constraints on this query:

- **The join predicate must match `getPersonMetadata` and `searchOwnerPeople` exactly**
  (`deletedAt is null`, `isVisible = true`). `face-repair.repository.ts:85` already documents why: a
  face count that disagrees between the picker, the review header and this card reads as a bug.
- **Cost.** The predicate is covered by the partial index
  `asset_face_personId_assetId_notDeleted_isVisible_idx` (`asset-face.table.ts:31`, predicate
  `"deletedAt" IS NULL AND "isVisible" IS TRUE`), so this is one
  index-backed aggregate over the scan's distinct person ids. `withCurrentNames` has a single caller
  (`face-repair.service.ts:581`), so the cost is one aggregate per scan read, not per person.

A destination whose person row is gone reports `ownerFaceCount: 0, ownerMissing: true`.

### 2. Review page: the destination card

The banner's leading sentence (`Default is → {ownerName}.`) is removed from
`face_cleanup_review_banner_body`; the destination is promoted out of prose into an object:

```
⚠  2,382 faces flagged on this cluster

Destinations →
 ┌────┐  Katrin                          [open ↗]
 │ 🙂 │  a3f10c2e · 1,204 faces
 └────┘  2,201 flagged faces route here
 ┌────┐  Unnamed cluster                 [open ↗]
 │ 🙂 │  9f21b40e · 88 faces
 └────┘  181 flagged faces route here

Select the exceptions and re-route them: keep here, confirm-lock an age-gap face, …
```

Per card:

- **Thumbnail** via the page's existing `personThumbUrl` helper (`+page.svelte:130`) — the face-keyed
  admin route, falling back to `getPeopleThumbnailPath` when a row has no `thumbnailFaceId`. The
  admin does not own these clusters, so the person-scoped thumbnail route would 403/404.
- **Name**, or `face_cleanup_review_unnamed` in the page's gray-italic unnamed idiom.
- **Short id** (`id.slice(0, 8)`, font-mono) — matches the page header and the picker, and is the
  only thing that distinguishes two unnamed clusters from each other.
- **`{ownerFaceCount} faces`** — the destination's own size.
- **`{count} flagged faces route here`** — the routing share, stated as such so it can never be read
  as the size.
- **`[open ↗]`** → `Route.viewFaceCleanupManualPerson({ id })`, the manual review page from #838,
  with `target="_blank" rel="noopener"`.

**The new tab is load-bearing, not a preference.** Every staged decision on this page lives in
`createReviewModel`'s in-memory maps. A same-tab navigation discards the entire review.

**Ordering and volume.** Cards sort by `count` descending. The first three render; the remainder
collapse behind a `+{n} more` toggle. `suspectedOwners` is unbounded (it is a group-by over flagged
faces), and this block sits inside the banner above the grid.

**Degenerate states**, replacing today's misleading fallbacks (D3):

- **No suspected owners** — the card list is replaced by an explicit statement that the scan could
  not attribute these faces to anyone. The page must not name a destination that does not exist.
- **`ownerMissing`** — the card renders in a warning treatment saying the person no longer exists.
  This is the same condition that makes Apply fail with `face-repair:destination-missing`; the admin
  now sees it before committing rather than after.

### 3. Review page: a real destination chooser for the two bulk actions

`Move entire cluster` and rest-of-cluster staging stop hardcoding `suspectedOwners[0]`. The page gets
one `destination` state, defaulting to the primary suspected owner:

```
Rest of this cluster (570)
  Send to: [ Katrin · 1,204 faces  ▾ ]     [Select all]  [Move entire cluster →]
           ├─ Katrin · 1,204 faces
           ├─ Unnamed cluster · 88 faces
           └─ Choose someone else…
```

- A native `<select>`: keyboard-accessible for free, and the page has no dropdown idiom to match
  (`PersonPicker` is a modal).
- Options are the suspected owners, each with its `ownerFaceCount`, plus `Choose someone else…`,
  which opens the existing owner-scoped `PersonPicker` (search, plus create-a-new-person). Cancelling
  the picker reverts the select to its previous value.
- `PersonPicker` gains a `showLock` prop (default `true`, so its current call site is unchanged). The
  chooser passes `false`: this destination feeds `entireCluster` (which has no lock field) and
  rest-staging (hardcoded `lock: false` in `review.svelte.ts:266`), so offering "Lock so it won't
  re-flag" here would promise something the request cannot carry.

Consumers switched from `ownerPersonId` to the chosen destination: `buildApplyRequest` (`:384`),
`confirmMoveEntireCluster` (`:287`), the rest-section hint, the selected rest-tile ribbon, and the
move-entire confirmation body.

**Both buttons now gate on the chosen destination, not on `ownerPersonId`.** They are
`disabled={!ownerPersonId}` today, which means an unattributable cluster — one with no suspected
owner — offers no whole-cluster action at all. With a chooser, picking a person enables them. This is
a deliberate behavior change and it removes a dead end.

**The `owner` tally chip** (`face_cleanup_review_tally_owner`, `"→ {name}"`) also drops its `[0]`
assumption: with more than one suspected owner it counts faces bound for several destinations, so it
renders a generic "→ suggested owner" label rather than naming one of them. With exactly one owner it
keeps naming that owner.

Flagged-tile routing is untouched: `owner`-state faces still move to their own `suspectedOwnerId`,
and the tile ribbons still name each face's own destination via `ownerNameById`.

### 4. Dashboard: the destination column shows the destination's size

`ReviewFirstLane.svelte:166` switches from `dest.count` to `dest.ownerFaceCount`, so the number under
the destination's name is the destination's size. The routing share moves into the row's existing
`title` tooltip. The `bad-target` red state keeps its precedence over the count.

`ConfidentLane` renders `{pct}% → {ownerName}` with no count and needs no change.

### 5. i18n

New keys — the existing `admin.face_cleanup_review_*` namespace:

| key                                     | English                                                    |
| --------------------------------------- | ---------------------------------------------------------- |
| `face_cleanup_review_dest_heading`      | `Destination` / `Destinations` (plural on count)           |
| `face_cleanup_review_dest_size`         | `{count} faces`                                            |
| `face_cleanup_review_dest_routes`       | `{count} flagged faces route here`                         |
| `face_cleanup_review_dest_open`         | `Open this cluster in a new tab` (title/aria)              |
| `face_cleanup_review_dest_more`         | `+{count} more`                                            |
| `face_cleanup_review_dest_none`         | `The scan couldn't attribute these faces to anyone.`       |
| `face_cleanup_review_dest_gone`         | `This person no longer exists — it was deleted or merged.` |
| `face_cleanup_review_dest_send_to`      | `Send to`                                                  |
| `face_cleanup_review_dest_choose_other` | `Choose someone else…`                                     |
| `face_cleanup_review_dest_option`       | `{name} · {count} faces`                                   |
| `face_cleanup_review_tally_owner_multi` | `→ suggested owner`                                        |

Edited: `face_cleanup_review_banner_body` loses its leading `Default is → {ownerName}.` sentence
(and therefore its only placeholder).

**All nine locales**, not just `en.json`. `40ac487f52a` established that this feature ships fully
translated (de, fr, es, it, nl, pl, ru, zh_Hans, zh_Hant), and the admin who reported this reads the
console in German. ICU placeholder and plural parity must be verified per locale: pl/ru use
one/few/many/other, zh uses one/other.

## Testing

**Medium** — `server/test/medium/specs/repositories/face-repair-scan.repository.spec.ts:209` already
has a `withCurrentNames` describe block; extend it:

- `ownerFaceCount` reflects the destination's live face count, not the scan snapshot;
- deleted/soft-deleted and non-visible faces are excluded, matching `getPersonMetadata` on the same
  fixture — this is the cross-surface agreement the join predicate exists to guarantee;
- a suspected owner whose person row was deleted yields `ownerMissing: true`, `ownerFaceCount: 0`;
- a person with zero faces yields `0`, not a missing row (left join, not inner).

**Web unit** — `web/src/routes/admin/face-cleanup/[personId]/page.spec.ts`:

- card renders name, short id, `ownerFaceCount`, routing share, and a link to
  `/admin/face-cleanup/people/{id}` carrying `target="_blank"`;
- multiple suspected owners render multiple cards, `count`-descending, with the `+n more` toggle;
- zero suspected owners renders the none-state and names no destination;
- `ownerMissing` renders the warning state;
- changing the chooser changes `destinationPersonId` in **both** the rest-staged
  `moveToPerson` group and the `entireCluster` resolve;
- picking a destination on a cluster with no suspected owner enables both bulk actions;
- `PersonPicker` opened from the chooser does not render the lock checkbox.

**Regen** — the DTO change requires `mise open-api` (TypeScript SDK + Dart client). `mise sql` is not
needed: `face-repair-scan.repository.ts` carries no `@GenerateSql` decorators.

**Full gate before push** — server `pnpm lint` (`--max-warnings 0`) _and_ `prettier --check .`, which
are separate CI gates; web `check:typescript`, `check:svelte`, `pnpm lint`; prettier over this file,
since CI Docs Build reaches `docs/superpowers/specs/`.

## Manual verification

Needs a real library with a mixed cluster — the reported case is a 2,952-face cluster flagging 2,382
faces toward one owner.

1. Open a flagged cluster whose destination is an unnamed cluster: the card shows a thumbnail, the
   short id, the destination's own face count, and the routing share. This is the case that was
   unactionable.
2. `[open ↗]` opens the destination's manual review page **in a new tab**; return to the original tab
   and confirm every staged decision survived.
3. On a cluster with several suspected owners: all destinations are listed, `Move entire cluster`
   names the chosen one, and switching the chooser changes where the rest-of-cluster faces go.
4. On an unattributable cluster (no suspected owners): the banner says so and names nobody; choosing
   a person enables the bulk actions.
5. Delete the destination person, reload: the card says it no longer exists, before Apply is pressed.
6. German UI: every new string is translated, no raw keys and no English fallbacks.
7. Dashboard review lane: the number under the destination name is the destination's size; the
   routing share is in the row tooltip.
