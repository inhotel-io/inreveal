# Face cleanup breadcrumb navigation — design

**Date:** 2026-08-02
**Branch:** `feat/face-review-unified` (PR #834)
**Status:** approved, ready for planning

## Problem

The admin Face cleanup console is three levels deep, but only one of its six pages renders a trail back
up. On `/admin/face-cleanup/scan` (Guided cleanup) and `/admin/face-cleanup/people` (Manual review) the
breadcrumb bar shows a single unlinked crumb, so an admin who has drilled into a mode has no way back to
the landing page short of the sidebar entry or the browser Back button.

`/admin/face-cleanup/people/[personId]` already renders the trail we want —
`Face cleanup / Manual review / Aurelia`, each ancestor a link. That page is the target pattern; the rest
of the console should match it.

A second, related defect: two crumbs and two in-page buttons carry a label that does not describe where
they go. `/admin/face-cleanup/[personId]` renders the crumb `Face cleanup` pointing at `/scan`, and the
Resolutions page renders both a crumb and an empty-state button labelled `Face cleanup` that also land on
`/scan`. Label and destination were written independently at each call site and drifted apart.

## Goal

Every page in the console shows a complete, clickable trail to its ancestors, and no label points
somewhere it does not describe.

## Trails

Only the final crumb is unlinked — you are standing on it.

| Route                                   | Trail                                    |
| --------------------------------------- | ---------------------------------------- |
| `/admin/face-cleanup`                   | `Face cleanup`                           |
| `/admin/face-cleanup/scan`              | `Face cleanup › Guided cleanup`          |
| `/admin/face-cleanup/[personId]`        | `Face cleanup › Guided cleanup › <name>` |
| `/admin/face-cleanup/people`            | `Face cleanup › Manual review`           |
| `/admin/face-cleanup/people/[personId]` | `Face cleanup › Manual review › <name>`  |
| `/admin/face-cleanup/resolutions`       | `Face cleanup › Resolutions`             |

`/admin/face-cleanup/declined` is a `redirect(307)` loader with no page component and needs nothing.

Two placements worth stating explicitly:

- **Guided cleanup is named, not repeated.** `/scan` currently titles itself `Face cleanup`, identical to
  the landing page. It becomes `Guided cleanup`, matching its own card on the landing page and mirroring
  the `Manual review` label the sibling mode already uses.
- **Resolutions hangs off the root, not off Guided cleanup.** It is only reachable from `/scan` today, but
  it lists negative verdicts from _both_ engines (`cleanup` and `suggestion` sources), so parenting it
  under the guided mode would misrepresent what it contains. It is a peer of the two modes.

## Design

### The builder

All six pages construct their trail through one module, `web/src/routes/admin/face-cleanup/breadcrumbs.ts`:

```ts
import { Route } from '$lib/route';
import type { BreadcrumbItem } from '@immich/ui';

type Translate = (key: string) => string;

export const faceCleanupRootCrumb = (t: Translate): BreadcrumbItem => ({
  title: t('admin.face_cleanup'),
  href: Route.faceCleanup(),
});

export const guidedCrumb = (t: Translate): BreadcrumbItem => ({
  title: t('admin.face_cleanup_mode_guided'),
  href: Route.faceCleanupScan(),
});

export const manualCrumb = (t: Translate): BreadcrumbItem => ({
  title: t('admin.face_cleanup_mode_manual'),
  href: Route.faceCleanupPeople(),
});

/** Root crumb + tail, with the trailing crumb's href stripped — never link the page you are on. */
export const faceCleanupBreadcrumbs = (t: Translate, ...tail: BreadcrumbItem[]): BreadcrumbItem[] => { ... };
```

Two properties carry the design:

**Label and route travel together.** `guidedCrumb` and `manualCrumb` bind each mode's text to its own
route in one place, so the mismatch that exists today — the label `Face cleanup` on an href of `/scan` —
becomes unrepresentable at the call sites.

**The builder strips the last href.** `guidedCrumb($t)` is therefore written identically on `/scan` and on
`/[personId]`, and renders unlinked on the former, linked on the latter. No page decides for itself
whether its own crumb should be a link, so no page can get that wrong.

Call sites:

```ts
faceCleanupBreadcrumbs($t); // landing
faceCleanupBreadcrumbs($t, guidedCrumb($t)); // /scan
faceCleanupBreadcrumbs($t, guidedCrumb($t), { title: personName }); // /[personId]
faceCleanupBreadcrumbs($t, manualCrumb($t)); // /people
faceCleanupBreadcrumbs($t, manualCrumb($t), { title: personName }); // /people/[personId]
faceCleanupBreadcrumbs($t, { title: $t('admin.face_cleanup_resolutions_title') }); // /resolutions
```

`AdminPageLayout` → `BreadcrumbActionPage` → `@immich/ui`'s `Breadcrumbs` already renders an item with an
`href` as an `<a>` and one without as plain text. No layout or component change is needed.

### Page title

`/scan`'s loader sets `meta.title` to `admin.face_cleanup`, so its browser tab is indistinguishable from
the landing page's. It becomes `admin.face_cleanup_mode_guided`, matching `/people`, whose loader already
uses `admin.face_cleanup_mode_manual`. `meta.title` continues to drive only the document title
(`web/src/routes/+layout.svelte`) — no page reads it for its breadcrumbs any more.

### In-page back affordances

The two mode pages get breadcrumbs only. They do not get an in-page `← Face cleanup` link: the breadcrumb
bar already answers the need, and a second back affordance directly beneath it is noise.

The person pages keep the in-page back link they already have, but two labels are corrected to match where
they actually lead:

- `/[personId]` — the `←` link above the heading and the "no flagged faces" empty-state button both
  navigate to `/scan`. Both are relabelled from `admin.face_cleanup_review_back` ("Face cleanup") to
  `admin.face_cleanup_mode_guided` ("Guided cleanup").
- `/resolutions` — the empty-state button labelled `admin.face_cleanup_review_back` ("Face cleanup")
  navigates to `/scan`. Now that Resolutions sits under the root, it is retargeted to `Route.faceCleanup()`
  and relabelled `admin.face_cleanup`.

`/people/[personId]`'s back link already reads `Manual review` and needs no change.

## i18n

**No new keys.** The four labels the breadcrumbs need already exist and are already translated in all nine
fork-maintained locales (`de`, `es`, `fr`, `it`, `nl`, `pl`, `ru`, `zh_Hans`, `zh_Hant`) — verified against
`i18n/*.json`:

| key                              | de                   | fr                    | it                | es                | nl                     | pl                       | ru                | zh_Hans    | zh_Hant    |
| -------------------------------- | -------------------- | --------------------- | ----------------- | ----------------- | ---------------------- | ------------------------ | ----------------- | ---------- | ---------- |
| `face_cleanup`                   | Gesichtsbereinigung  | Nettoyage des visages | Pulizia dei volti | Limpieza de caras | Gezichten opschonen    | Porządkowanie twarzy     | Очистка лиц       | 人脸清理   | 臉孔整理   |
| `face_cleanup_mode_guided`       | Geführte Bereinigung | Nettoyage guidé       | Pulizia guidata   | Limpieza guiada   | Begeleid opschonen     | Porządkowanie prowadzone | Пошаговая очистка | 引导式清理 | 導引式整理 |
| `face_cleanup_mode_manual`       | Manuelle Prüfung     | Examen manuel         | Revisione manuale | Revisión manual   | Handmatige beoordeling | Przegląd ręczny          | Ручная проверка   | 手动审查   | 手動審查   |
| `face_cleanup_resolutions_title` | Entscheidungen       | Décisions             | Decisioni         | Decisiones        | Beslissingen           | Decyzje                  | Решения           | 处理结果   | 處理結果   |

Because nothing new is introduced, the i18n work is a **guard against future regression** rather than a
translation pass. `web/src/lib/i18n/face-cleanup-i18n-coverage.spec.ts` already iterates exactly this set
of nine locales plus `en`; the four breadcrumb labels are added to the presence assertion there, so a later
edit that drops one from a locale fails the suite instead of shipping an untranslated crumb.

**One key is retired.** With both of its remaining call sites relabelled, `admin.face_cleanup_review_back`
becomes unused. It is present in exactly the 10 fork-maintained locale files and no others, so it is
deleted from all 10 and added to the coverage spec's existing `REMOVED_KEYS` list, which asserts no locale
carries it any more.

## Testing

Test-driven, in three layers. Every assertion below fails against the current code.

### 1. Builder unit tests — `web/src/routes/admin/face-cleanup/breadcrumbs.spec.ts` (new)

Pure, no rendering. A `t` stub returning its key keeps the assertions on stable identifiers.

- A root-only trail is a single crumb with **no** `href` — the landing page must not link to itself.
- Given a tail, the root crumb **gains** its `href` of `/admin/face-cleanup`.
- The last crumb never carries an `href`, whatever it is — asserted for a mode crumb tail
  (`guidedCrumb`) and a person-name tail alike.
- An intermediate mode crumb **keeps** its `href` — `guidedCrumb` in a person trail still points at
  `/admin/face-cleanup/scan`.
- `guidedCrumb` pairs `admin.face_cleanup_mode_guided` with `Route.faceCleanupScan()`, and `manualCrumb`
  pairs `admin.face_cleanup_mode_manual` with `Route.faceCleanupPeople()` — the pairing that is currently
  crossed on `/[personId]`.

### 2. A layout stub that renders breadcrumbs — `web/src/test-data/mocks/admin-page-layout.stub.svelte` (new)

The six face-cleanup page specs currently stub `AdminPageLayout` with `sidebar.stub.svelte`, which accepts
`children` and `footer` and silently discards `breadcrumbs`. No existing test can therefore see a crumb at
all.

The new stub renders the trail the way `@immich/ui`'s `Breadcrumbs` does — an `<a href>` per item that has
one, plain text otherwise — alongside `children` and `footer`. The six face-cleanup specs move onto it.

`sidebar.stub.svelte` is left untouched: `user-sidebar.spec.ts` and `GalleryViewer.spec.ts` also import it,
and it is a sidebar stub in those, not a page-layout stub.

### 3. Per-page breadcrumb tests — the six existing `page.spec.ts` files

Each subpage asserts the trail a user can actually click, by role and accessible name, with the resolved
`href`:

- `/scan` — a link named `admin.face_cleanup` → `/admin/face-cleanup`; the leaf
  `admin.face_cleanup_mode_guided` present but **not** a link.
- `/[personId]` — links named `admin.face_cleanup` → `/admin/face-cleanup` and
  `admin.face_cleanup_mode_guided` → `/admin/face-cleanup/scan`; the person's name present, not a link.
- `/people` — a link named `admin.face_cleanup` → `/admin/face-cleanup`; leaf
  `admin.face_cleanup_mode_manual` not a link.
- `/people/[personId]` — the existing trail, now asserted rather than assumed.
- `/resolutions` — a link named `admin.face_cleanup` → `/admin/face-cleanup` (not `/scan`); leaf
  `admin.face_cleanup_resolutions_title` not a link.
- landing — its single crumb is present and is **not** a link.

`$t` is mocked to return raw keys in these specs, so accessible names are `admin.face_cleanup` and so on.
The negative assertions are written as "this text is present but is not a link" rather than
`queryByRole('link')` returning null, so a crumb that vanishes entirely cannot pass them.

### 4. i18n guard — `web/src/lib/i18n/face-cleanup-i18n-coverage.spec.ts` (extended)

- A `BREADCRUMB_KEYS` list — the four labels above — gets its own per-locale presence assertion across
  `en` + the nine. It is kept separate from the file's existing `NEW_KEYS`, which means "introduced by this
  feature"; these four predate it and are being pinned, not added.
- `face_cleanup_review_back` joins the existing `REMOVED_KEYS`, asserting all 10 files have dropped it.

## Out of scope

- E2E specs. `face-cleanup.e2e-spec.ts` and `face-review-cross-engine.e2e-spec.ts` navigate by URL and
  assert on page content, not on breadcrumbs or titles; neither needs changing.
- The sidebar `Face cleanup` entry, which already links to the landing page from anywhere.
- Any change to `AdminPageLayout`, `BreadcrumbActionPage`, or `@immich/ui`'s `Breadcrumbs`.

## Files

**New**

- `web/src/routes/admin/face-cleanup/breadcrumbs.ts`
- `web/src/routes/admin/face-cleanup/breadcrumbs.spec.ts`
- `web/src/test-data/mocks/admin-page-layout.stub.svelte`

**Modified**

- `web/src/routes/admin/face-cleanup/+page.svelte`
- `web/src/routes/admin/face-cleanup/scan/+page.svelte`, `scan/+page.ts`
- `web/src/routes/admin/face-cleanup/[personId]/+page.svelte`
- `web/src/routes/admin/face-cleanup/people/+page.svelte`
- `web/src/routes/admin/face-cleanup/people/[personId]/+page.svelte`
- `web/src/routes/admin/face-cleanup/resolutions/+page.svelte`
- the six sibling `page.spec.ts` files
- `web/src/lib/i18n/face-cleanup-i18n-coverage.spec.ts`
- `i18n/{en,de,es,fr,it,nl,pl,ru,zh_Hans,zh_Hant}.json` — delete `admin.face_cleanup_review_back`

## Verification

Two local-gate traps apply here and have both bitten this branch before, so the commands are written out
literally:

- `pnpm test -- --run <path>` passes `--` through to vitest, which then **drops the path filter and runs
  the whole suite**. Use `pnpm test --run` with no `--`.
- A glob over a bracketed SvelteKit route — `'src/routes/admin/face-cleanup/**/*.spec.ts'` — matches
  **zero files** and reports a clean pass: `[personId]` is eaten as a glob character class. Pass explicit
  spec paths and check the reported file count.

From `web/`:

```bash
pnpm test --run \
  src/routes/admin/face-cleanup/breadcrumbs.spec.ts \
  src/routes/admin/face-cleanup/page.spec.ts \
  src/routes/admin/face-cleanup/scan/page.spec.ts \
  'src/routes/admin/face-cleanup/[personId]/page.spec.ts' \
  src/routes/admin/face-cleanup/people/page.spec.ts \
  'src/routes/admin/face-cleanup/people/[personId]/page.spec.ts' \
  src/routes/admin/face-cleanup/resolutions/page.spec.ts \
  src/lib/i18n/face-cleanup-i18n-coverage.spec.ts
```

Expect **8 spec files** to run — a lower count means a path was eaten, not that the work is done.

Then the type, lint and format gates (the `make check-web` / `make lint-web` targets in `CLAUDE.md` do not
exist; the root Makefile swallows unknown targets into `dev`):

- `cd web && pnpm check:typescript && pnpm check:svelte && pnpm lint`
- `npx prettier --check` over the touched web files and over `docs/` — CI Docs Build is strict about
  markdown under `docs/`.

`check:svelte` can scan zero files locally while still working in CI; treat it as a push-only gate rather
than proof.
