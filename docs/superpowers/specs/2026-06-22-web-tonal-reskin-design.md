# Web Frontend Re-skin — Soft Periwinkle "Elevated Tonal" Brand

**Date:** 2026-06-22
**Status:** Design approved, ready for implementation planning
**Scope:** `web/` only (SvelteKit app). Mobile and ML are out of scope.

## 1. Goal

Re-skin the Gallery web frontend to a soft periwinkle, Material-You-style **tonal**
brand that aligns the app with the marketing site's design language — **without**
broadly editing component markup, so the fork keeps rebasing cleanly onto upstream
Immich.

The single governing principle:

> **For a re-skin, merge-conflict cost is proportional to how many _upstream-owned_
> files we edit — not to how dramatic the visual change is.** Concentrate every
> visual value in a fork-owned token layer; touch component markup as little as
> possible.

## 2. Context

- The web app is **SvelteKit + Svelte 5**, styled with **`@immich/ui`** (Immich's own
  component library, built on `bits-ui` headless primitives) + **Tailwind CSS 4**
  (`tailwind-variants`). It is **not** Material UI, and shadcn (React) does not apply;
  the closest analog, shadcn-svelte, is built on the same `bits-ui` + Tailwind layer
  the app already uses.
- The app's entire visual identity is already **token-driven** from a small block in
  `web/src/app.css`: it imports `@immich/ui/theme/default.css` and defines the
  `--immich-ui-*` color scales plus legacy `--immich-*` vars, fonts, spacing, and
  breakpoints. The fork has **already** diverged this file once (GoogleSans fonts),
  so it is a known fork-touched file.
- The marketing site's identity is **itself** a token file
  (`platform: libs/shared/brand/tokens.css`): `--ink`, `--paper`, `--blue #1d64d8`,
  `--moss-deep`, `--copper`, DM Sans + Bricolage Grotesque, a radius scale, soft tinted
  shadows. This maps almost 1:1 onto the app's token layer.

### Codebase measurements (drivers of effort & rebase cost)

Measured across 534 `.svelte` components in `web/src`:

| Surface                                        | Count               | Reachable from tokens?                                                       |
| ---------------------------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| `@immich/ui` components (incl. 172 `<Button>`) | 349 files           | Yes — override `--immich-ui-*`                                               |
| Legacy `immich-primary` utilities              | 178 uses / 73 files | Yes — override `--immich-*`                                                  |
| Raw `gray/neutral/slate` Tailwind utilities    | 1166 uses           | Yes — remap Tailwind `--color-gray-*`                                        |
| `rounded-*` usages                             | ~600                | Yes — retune `--radius-*`                                                    |
| `dark:` variants                               | 973                 | Mostly yes (reference remapped palette)                                      |
| Hardcoded `blue/indigo/...` utilities          | 81 uses / 23 files  | **No** — but periwinkle accent is itself blue, so no clash; optional cleanup |
| Hex literals in markup                         | 29 / 15 files       | **No** — small manual edits                                                  |
| Solid-primary + white-text pairings            | ~20                 | **No** — the elevated-tonal treatment touches these                          |

The "scary" large numbers (gray, rounded, dark:) are all **centrally coverable** by
remapping palettes/scales in the theme layer, not by per-site edits.

## 3. Approved design direction — A+ "Elevated Tonal" periwinkle

Decided after live mockup iteration (see `.superpowers/brainstorm/` artifacts).

- **Hue:** soft periwinkle blue (Material-You "tonal" reference the user supplied).
- **Tonal containers:** navigation-active, chips, and surface containers use a pale
  periwinkle fill + dark navy text in light mode; this **inverts** in dark mode to a
  deep periwinkle container + light periwinkle text.
- **Primary action & selection = "elevated tonal":** rather than a flat pale pill
  (lowest emphasis, fails contrast on bright/dark photos) or a harsh solid fill, the
  primary CTA and selection states use a tonal fill **lifted** with a hairline ring +
  soft shadow + deeper text. Keeps the gentle feel while staying legible.
- **Typography:** **DM Sans** (body) + **Bricolage Grotesque** (display/headings),
  replacing GoogleSans. JetBrains Mono for mono.
- **Shape:** marketing radius scale; generous, pill buttons.
- **Shadows:** soft, slightly tinted.
- **Intentional light/dark asymmetry:** light tonal is gentler; dark tonal/selection is
  a touch more saturated because dark mode is where low-contrast tonal is riskiest.
  This is deliberate and standard.

### Token values (starting point — to be regenerated cleanly, see §6 risks)

Primary periwinkle ramp (light-mode reference values):

```
--primary-50:  #f4f7fe
--primary-100: #e6edfd
--primary-200: #cdddfb   /* primary container: tonal nav/chip/CTA fill (light) */
--primary-300: #aec7f8   /* selected-tile outline (light) */
--primary-400: #84a4f1
--primary-500: #5b82ea
--primary-600: #3f6fe0   /* solid accent: focus ring, links, meter fill */
--primary-700: #3257c6
--primary-800: #2c469f
--primary-900: #283f7d
--primary-950: #1b2a4e   /* on-primary-container: navy text/icon (light) */
```

Neutrals (cool "paper/ink" family; replaces Tailwind's default warm-gray):

```
Light: bg #ffffff · surface #ffffff · surface-2/muted #eef2fb · border #e3e8f2
       fg #1a1f29 · fg-muted #5a6573
Dark:  bg #0c1014 · surface #14191f · surface-2 #1d2632 · border #28313d
       fg #e8edf4 · fg-muted #8c99a9
```

Elevated-tonal treatment:

```
LIGHT
  Primary CTA   bg #c4d7fb · text #15224a · border 1px #a6c2f6 · shadow 0 7px 16px rgba(63,111,224,.26)
  Selection     fill #dbe7fc · tick #1b2a4e · ring 2px #ffffff · shadow 0 2px 6px rgba(30,50,100,.30) · outline #9cbcf6
  Nav active    bg #cdddfb · text #1b2a4e
DARK
  Primary CTA   bg #2c4068 · text #d8e4fc · border 1px #45609a · shadow 0 8px 22px rgba(8,16,40,.65)
  Selection     fill #3f5891 · tick #ffffff · ring 2px #0c1014 (separator) · shadow 0 2px 8px rgba(0,0,0,.6) · outline #7ea6f2
  Nav active    bg #283a5e · text #cdddfb
```

Radius (Tailwind `--radius-*`, tune during impl): sm 8 · md 12 · lg 16 · xl 22 · 2xl 28 · 3xl 36; `rounded-full` stays pill.

Shadows (soft tinted): `--shadow-sm 0 1px 2px rgba(26,31,41,.07)` · `--shadow-md 0 10px 30px rgba(40,55,95,.10)` · `--shadow-lg 0 18px 44px rgba(40,55,95,.14)` (heavier in dark).

> These hexes are the hand-tuned mockup values. Before merge, regenerate the full
> 50–950 ramp from a single locked seed (tints.dev or an oklch script, matching how
> `@immich/ui/theme/default.css` was generated) so hovers, tints, and the dark ramp
> derive consistently.

## 4. Architecture — units & interfaces

### Unit A — `web/src/styles/gallery-theme.css` (new, fork-owned)

The single source of truth for every visual value. Pure CSS custom properties + a few
global `@layer base` rules. No logic. Upstream never creates or touches this path, so it
**never conflicts on rebase**. It overrides, for both `:root/.light` and `.dark`:

- `--immich-ui-*` color scales (drives all `@immich/ui` components — the 349 files).
- Legacy `--immich-*` tokens (drives the 178 `immich-primary` utilities).
- Tailwind `--color-gray-*` (and `neutral/slate` if used) remapped to the cool neutral
  ramp — retints all 1166 gray utilities at once.
- `--radius-*` scale.
- `--font-sans`, a new `--font-display`, `--font-mono`.
- `--shadow-*` tokens.
- `@layer base` rule applying `--font-display` to `h1,h2,h3,...` globally (so headings
  pick up Bricolage without editing component markup).

### Unit B — Self-hosted fonts

DM Sans + Bricolage Grotesque variable `woff2` under `web/src/lib/assets/fonts/`, with
`@font-face` declarations (placed in Unit A to keep the `app.css` edit minimal). Replaces
the existing GoogleSans `@font-face` blocks. Subset to used weights; both are SIL OFL.

### Unit C — Elevated-tonal component override CSS (fork-owned)

The genuinely-not-tokenizable part. The default `@immich/ui` primary button is a solid
fill + white text; the tonal treatment needs `bg=primary-200 / text=primary-950 / ring /
shadow`, which is a different anatomy, not a color swap. Implemented as **fork-owned CSS
overriding `@immich/ui` Button's primary/filled variant class hooks** (and the app's
selection/nav classes), living in Unit A or a sibling `gallery-overrides.css`. No
component markup is edited. Each override selector and its upstream coupling is documented
inline.

### Unit D — The one upstream-owned edit

A **single** line in `web/src/app.css`: `@import './styles/gallery-theme.css';` placed
after the `@immich/ui` theme import. This is the only upstream-owned file we modify; a
one-line import virtually never conflicts.

### Unit E (Tier 2, optional) — Hardcoded-color cleanup

Isolated, clearly-labeled commits migrating the 23 files of hardcoded blues + 15 files of
hex literals to token utilities. Kept separate so they never tangle with the theme layer.

## 5. Scope & phasing

### Tier 1 — ships the look (~80–90% of visual impact, near-zero rebase tax)

Units A–D: the theme file (ramps, neutral remap, radius, fonts, shadows, both modes) +
self-hosted fonts + tonal nav/containers + elevated-tonal primary button override +
selection treatment + a visual QA sweep. **Estimate: 2–4 focused days** (mostly design
tuning + QA, not mechanical edits).

### Tier 2 — polish (optional, modest rebase tax on touched files)

Unit E cleanup + a full contrast/accessibility audit + any small per-component tweaks
surfaced in QA. **Estimate: +3–6 days.**

### Explicitly OUT of scope (YAGNI)

- Turning the dense photo tool into the marketing site's **airy, big-card layout** — that
  is component/layout work (high rebase cost), not a re-skin.
- Replacing `@immich/ui` or rewriting component anatomy.
- Mobile (Flutter) and any ML/server change.

## 6. Risks & mitigations

| Risk                                                                                   | Mitigation                                                                                                                                                |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@immich/ui` Button override (Unit C) is brittle across package upgrades               | Pin/track the `@immich/ui` version; document override selectors; re-verify on every bump.                                                                 |
| Global Tailwind gray remap shifts a place that assumed literal gray                    | Stay within a cool-neutral family (subtle shifts); catch in the QA sweep.                                                                                 |
| Tonal low-contrast fails WCAG, esp. selection over bright (light) / dark (dark) photos | The elevated treatment (ring + shadow + deeper text) + an AA audit in Tier 2; dark selection intentionally punchier.                                      |
| Periwinkle accent diverges the app's primary from the marketing site's `#1d64d8` blue  | Accepted, deliberate — same hue family, softer treatment; documented brand decision.                                                                      |
| Cross-repo token drift (platform `tokens.css` vs vendored copy in Gallery)             | Values are **vendored** (copied), not imported — the repos are separate. Document the source path + a manual sync note; consider a sync script in Tier 2. |
| Font licensing/weight bloat                                                            | DM Sans & Bricolage are OFL; subset to used weights; ship variable `woff2`.                                                                               |

## 7. Verification

- **Visual QA, light + dark**, across: Photos timeline, Albums, Spaces, Search, Map,
  asset viewer chrome, settings, dialogs/modals, empty states, multi-select bar.
- **Accessibility:** primary CTA, selection states, and tonal text pairs meet **WCAG AA**;
  explicitly check the two stress cases (selection on a bright photo in light mode; on a
  dark photo in dark mode).
- **Build/lint clean:** `make check-web` (svelte-check + tsc) and `make lint-web`.
- **Rebase-safety check (the acceptance gate for Tier 1):** the diff is essentially _one
  new file (Unit A, optionally a sibling overrides file) + one import line (Unit D) + the
  self-hosted font assets_. No broad component-markup recoloring. Re-run the hardcoded-
  color grep from §2 and confirm leftovers are limited to the blue family (acceptable) or
  deferred to Tier 2.

## 8. Open items to resolve during planning

- Final ramp regeneration: choose the locked `--primary-500` seed and generation method.
- Confirm `@immich/ui` Button's actual variant class hooks for the Unit C override (read
  the installed package; the selectors above are placeholders until verified).
- Decide whether `--font-display` applies to all headings or only top-level page titles.
