# Slice 8 — Documentation (#910)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** `docs/docs/features/dynamic-filter-suggestions.md` describes what the app now does — including
correcting three rows that were already wrong before this work started.

**Architecture:** Documentation only. No source changes.

**Tech Stack:** Docusaurus, Prettier.

- **Spec:** `docs/superpowers/specs/2026-08-04-interdependent-filter-sections-910-design.md` §2.1, §4.3, §2.4
- **Branch:** `fix/910-interdependent-filter-sections`
- **Depends on:** Slices 5 and 7 — document what shipped, not what was planned.
- **Scope:** `docs/docs/features/dynamic-filter-suggestions.md`.

## Global Constraints

- Per `reference_docs_prettier_covers_superpowers_plans`, CI Docs Build runs Prettier over `docs/`
  **including** `docs/plans/` and `docs/superpowers/`. Run `npx prettier --write` on every markdown file
  touched, this plan file included, before committing.
- User-facing docs describe behaviour, not implementation. The existing "Architecture" section is the one
  exception and stays.

---

## Task 1: Correct the feature doc

**Files:**

- Modify: `docs/docs/features/dynamic-filter-suggestions.md`

Three rows of the "What updates" table are wrong **today**, before this change:

| Row        | Doc claims                                                 | Reality before #910                                     |
| ---------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| Rating     | "Shows ratings that can still satisfy the current minimum" | Not dynamic — the client discards the facet             |
| Media Type | "Photo/Video buttons hidden when no assets of that type"   | Not dynamic — and buttons are deliberately never hidden |
| Favorites  | "Not dynamic. Simple toggle, always visible"               | Correct then; changes with this slice                   |

- [ ] **Step 1: Rewrite the "What updates" table**

```markdown
## What updates

| Filter     | Narrows with other filters? | Section hidden when it cannot filter?                  |
| ---------- | --------------------------- | ------------------------------------------------------ |
| People     | Yes                         | Yes, unless unnamed faces exist                        |
| Location   | Yes (countries)             | Yes, when no photo has a location                      |
| Camera     | Yes (makes)                 | Yes, when no photo has camera metadata                 |
| Tags       | Yes                         | Yes, when nothing is tagged                            |
| Rating     | Yes                         | Yes, when nothing is rated                             |
| Media Type | Yes                         | Yes, unless you have both photos and videos            |
| Favorites  | Yes                         | Yes, when nothing is favourited                        |
| Albums     | Yes                         | Yes, unless some photos are in albums and some are not |
| Timeline   | Drives filtering            | Never — it greys out instead                           |
| Text       | No — free text              | Never                                                  |
```

- [ ] **Step 2: Add the section-visibility explanation**

Insert after the table, before "Orphaned selections":

```markdown
## Sections you do not see

A filter section only appears when it can change what you are looking at.

- **Hidden.** Nothing in this library, album or space could ever populate the section — you have no
  videos, so there is no Media Type section, and no way to filter by something you do not have. The
  section reappears on its own as soon as the content does.
- **Greyed out, with `(0)`.** The section could normally filter, but the filters you have applied right
  now leave it nothing to offer. Clear or change a filter and it comes back.

A section holding an active filter is never hidden or greyed, so you can always undo a selection.
```

- [ ] **Step 3: Correct the "Orphaned selections" section**

It currently describes dimming as a general mechanism. It applies to the list-style filters — People,
Location, Camera, Tags — and deliberately **not** to the rating stars or the media-type buttons, whose
meaning is positional. Reword accordingly:

```markdown
## Orphaned selections

If you select a value from a list — a person, country, camera or tag — and then apply another filter that
removes it from the available options, the selected value stays visible but appears **dimmed**. This lets
you see why your result set is empty and undo the selection with one click.

Rating stars and the Photo/Video buttons never dim or disappear individually: their meaning comes from
their position, so a gap in the row would be misleading. When they cannot help, the whole section is
hidden or greyed instead.
```

- [ ] **Step 4: Update the "Architecture" paragraph**

It says the endpoint "runs 6 parallel queries". After slice 1 it is eight. Correct the count and mention
that the presence probes exist. Verify the number against
`server/src/repositories/search.repository.ts`'s `getFilterSuggestions` rather than trusting this line.

- [ ] **Step 5: Format and preview**

```bash
npx prettier --write docs/docs/features/dynamic-filter-suggestions.md
npx prettier --check docs/
```

Expected: check passes. A failure here fails CI Docs Build.

- [ ] **Step 6: Commit**

```bash
git add docs/docs/features/dynamic-filter-suggestions.md
git commit -m "docs: describe hidden and greyed filter sections (#910)"
```

---

## Task 2: Decide on the README and marketing site

**Files:** possibly none.

CLAUDE.md requires the README's "What's Different from Upstream Immich" section to stay in feature parity
with the marketing site, and the `launch-new-feature` skill covers launching a **new** feature.

- [ ] **Step 1: Check whether anything is owed**

```bash
grep -n -i "dynamic filter" README.md
```

This work refines an existing shipped feature (`dynamic-filter-suggestions`) rather than adding one, so the
expected answer is that the existing README entry already covers it and **no change is needed**. Confirm
that, and if the README describes the old always-visible behaviour, correct that sentence only.

Do **not** invoke `launch-new-feature`: there is no new feature and no new marketing page.

- [ ] **Step 2: Commit only if something changed**

```bash
git add README.md && git commit -m "docs: note filter-section visibility in the README (#910)"
```

---

## Done when

- `npx prettier --check docs/` passes.
- The "What updates" table matches what slices 5 and 7 actually shipped — re-read them rather than this
  plan if the two disagree.
- No claim in the doc says rating stars or media buttons are individually hidden or dimmed.
