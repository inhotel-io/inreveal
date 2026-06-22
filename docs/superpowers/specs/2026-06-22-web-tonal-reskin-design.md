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

### Token values (starting point — to be regenerated cleanly, see §9 open items)

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
selection/nav classes), living in a sibling `web/src/styles/gallery-overrides.css`. No
component markup is edited. Each override selector and its upstream coupling is documented
inline, and is guarded by the computed-style test in §5.

### Unit D — The one upstream-owned edit

A **single** line in `web/src/app.css`: `@import './styles/gallery-theme.css';` placed
after the `@immich/ui` theme import (and `gallery-overrides.css` once Unit C exists). This
is the only upstream-owned file we modify; a one-line import virtually never conflicts.

### Unit E (Level 7, optional) — Hardcoded-color cleanup

Isolated, clearly-labeled commits migrating the 23 files of hardcoded blues + 15 files of
hex literals to token utilities. Kept separate so they never tangle with the theme layer.

## 5. Testing strategy — TDD where it has teeth

A visual re-skin has two kinds of properties: **objective/functional** ones we can assert
(contrast, token completeness, the override actually applying, the rebase-safety
invariant) and **subjective/aesthetic** ones we cannot (does it "feel right"). We apply
**real TDD to the first kind** and are honest that the second is baseline-locked or manual.
No TDD theater on raw CSS values that carry no functional assertion.

### Test-first (red → green → refactor) — drives implementation

1. **Contrast / WCAG AA** — the highest-value tests; they directly harden the design's
   main risk (low-contrast tonal). A pure `contrastRatio(fg, bg)` utility (vitest unit,
   self-tested against known pairs) asserts, **for both light and dark**:
   - body `fg` on `bg`/`surface` ≥ 4.5:1; `fg-muted` on `surface` ≥ 4.5:1
   - `on-primary-container` text on `primary-container` (the tonal pairs: nav-active,
     chips) ≥ 4.5:1
   - elevated CTA text on CTA fill ≥ 4.5:1
   - focus ring / link accent vs adjacent surface ≥ 3:1 (UI/graphical threshold)
   - selection badge legibility: check tick vs fill ≥ 4.5:1, **and** the ring/outline
     vs both a white and a black backdrop ≥ 3:1 (so selection survives any photo)
     Written first against the intended token values; they stay red until the ramp is
     tuned to pass. This is genuine TDD and is what makes the tonal direction safe.

2. **Token completeness** — vitest test that parses `gallery-theme.css` and asserts every
   required token name (`--immich-ui-*` scales, neutrals, `--radius-*`, fonts, shadows) is
   defined under **both** `:root/.light` and `.dark`. Catches the classic "forgot a dark
   value" regression. The CSS file is the single source of truth the test reads, so no
   value can drift between code and test.

3. **`@immich/ui` Button override correctness** — a Playwright (real-browser) test that
   renders the primary Button and asserts computed `background-color` / `color` /
   `box-shadow` / `border` match the elevated-tonal treatment in **both** modes. This is
   the guard that catches an `@immich/ui` upgrade silently reverting the button to solid
   (the brittleness risk in §7). Written first; red until Unit C lands.

4. **Rebase-safety guard** — a node/vitest test asserting the change set stays within the
   fork-owned allowlist (`gallery-theme.css`, `gallery-overrides.css`, the fonts dir, and
   an `app.css` diff that is _only_ the import line) and introduces no broad
   component-markup color edits. Encodes §1's invariant as an automated gate; wired into
   CI at Level 6. Written first as the definition of done for the token levels.

### Baseline-locked (real coverage, not test-first)

5. **Visual regression** — Playwright screenshot baselines for key screens (timeline,
   albums, spaces, search, asset viewer chrome, a dialog, an empty state, the multi-select
   bar) in light + dark. Captured **after** each level's look is approved, then they guard
   against regressions on every future upstream rebase — the payoff being that a rebase
   which disturbs the theme fails CI. These cannot be written test-first (no "correct"
   pixels exist before the design does). Baselines must be generated in the CI/Docker
   runner so OS font rendering is deterministic.

### Manual (not automatable)

6. **Aesthetic QA** — a documented per-screen checklist and human sign-off across real
   content in both modes. The only gate for "does it look good."

**Test homes** (per repo conventions): vitest (web) for the contrast utility,
token-completeness parser, and rebase-safety guard; Playwright (`e2e`/web) for the
computed-style override test, the `axe` accessibility scan (Level 6), and visual
regression. Each implementation level below names which of tests 1–5 gate it, and follows
red→green→refactor for the test-first ones.

## 6. Implementation levels — biggest impact / least change first

Ordered by **visual impact ÷ change size & risk**. Every level is independently shippable
and the look improves monotonically, so we can **stop after any level**. Pure token levels
(L1–L3) carry ~zero rebase tax; override levels (L4–L5) add a little; L6 hardens; L7 is
optional cleanup.

| Level                                         | What changes                                                                                                                                                                 | Why here                                                                                                                                                     | Tests that gate it (written first)                                                                                                                                                                       | Rough effort |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **L1 · Accent recolor**                       | Define the periwinkle `--immich-ui-primary-*` + legacy `--immich-primary*` ramp (light+dark) in `gallery-theme.css`; add the one `app.css` import.                           | Highest leverage: one file recolors all 349 `@immich/ui` files + 178 `immich-primary` uses at once. Largest shift for the smallest change, zero rebase risk. | Token completeness (primary ramp); contrast (accent/focus/link on surface); rebase-safety guard established.                                                                                             | ~0.5 day     |
| **L2 · Neutrals + radius + shadows**          | Remap Tailwind `--color-gray-*` to cool paper/ink; set `--radius-*` and `--shadow-*` (light+dark).                                                                           | Token-only; reshapes surface character + roundness across ~600 `rounded-*` and 1166 gray usages. Still one file.                                             | Token completeness (neutrals/radius/shadow); contrast (`fg`/`fg-muted` on `bg`/`surface`).                                                                                                               | ~0.5–1 day   |
| **L3 · Typography**                           | Self-host DM Sans + Bricolage (Unit B); set `--font-sans`/`--font-display`/`--font-mono`; `@layer base` heading rule; remove GoogleSans faces.                               | Whole-app type identity. Adds assets but still no component edits.                                                                                           | Computed font-family on body + an `h1` (Playwright); assert no GoogleSans reference remains; fonts load (no fallback).                                                                                   | ~0.5–1 day   |
| **L4 · Tonal containers**                     | Point nav-active / chips / selected-surface at the container + on-container pair (mostly via L1 primary-container semantics; remainder via Unit C fork CSS on stable hooks). | Delivers the signature tonal sidebar/chips look from the approved mockup. First override coupling begins here.                                               | Contrast (on-container vs container, light+dark); computed-style on active nav + a chip; visual-regression baseline (sidebar, chips).                                                                    | ~0.5–1 day   |
| **L5 · Elevated-tonal CTA + selection**       | Unit C core: override `@immich/ui` Button primary variant to elevated-tonal (bg/text/ring/shadow); selection check/outline states.                                           | Highest change/rebase-risk but smallest incremental visual delta (polish on the primary action) — so it comes last among the look levels.                    | Button-override computed-style test (light+dark — the brittleness guard); contrast (CTA, selection tick/fill, ring vs black & white); visual-regression (CTA, dialog, selection over bright/dark photo). | ~1–2 days    |
| **L6 · Hardening & lock**                     | No new visuals: add `axe` a11y scan across key screens (light+dark), the full visual-regression baseline set, and wire the rebase-safety guard into CI.                      | Locks the design and defends it on every future rebase.                                                                                                      | This level _is_ the test net (1–5 all green in CI).                                                                                                                                                      | ~1–2 days    |
| **L7 · Hardcoded-color cleanup** _(optional)_ | Migrate the 23 hardcoded-blue + 15 hex files to token utilities, in isolated commits.                                                                                        | Low visual impact (periwinkle ≈ blue), so optional; improves correctness/consistency.                                                                        | Extend the guard to flag new hardcoded colors; re-run the §2 grep, assert count → ~0.                                                                                                                    | ~1 day       |

### Explicitly OUT of scope (YAGNI)

- Turning the dense photo tool into the marketing site's **airy, big-card layout** — that
  is component/layout work (high rebase cost), not a re-skin.
- Replacing `@immich/ui` or rewriting component anatomy.
- Mobile (Flutter) and any ML/server change.

## 7. Risks & mitigations

| Risk                                                                                   | Mitigation                                                                                                                                                           |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@immich/ui` Button override (Unit C) is brittle across package upgrades               | The L5 computed-style test fails the build if the override stops applying; pin/track the `@immich/ui` version; document override selectors; re-verify on every bump. |
| Global Tailwind gray remap shifts a place that assumed literal gray                    | Stay within a cool-neutral family (subtle shifts); L2 contrast tests + the visual-regression baselines catch breakage.                                               |
| Tonal low-contrast fails WCAG, esp. selection over bright (light) / dark (dark) photos | First-class, test-first contrast assertions at L1/L2/L4/L5 + the `axe` scan at L6; dark selection intentionally punchier.                                            |
| Periwinkle accent diverges the app's primary from the marketing site's `#1d64d8` blue  | Accepted, deliberate — same hue family, softer treatment; documented brand decision.                                                                                 |
| Cross-repo token drift (platform `tokens.css` vs vendored copy in Gallery)             | Values are **vendored** (copied), not imported — the repos are separate. Document the source path + a manual sync note; consider a sync script in Level 7.           |
| Font licensing/weight bloat                                                            | DM Sans & Bricolage are OFL; subset to used weights; ship variable `woff2`.                                                                                          |

## 8. Verification & acceptance

- **Per-level gates:** each level merges only when its test-first checks from §5 (tests
  1–5 as named in the §6 table) are green and the aesthetic checklist for that level is
  signed off.
- **CI guards (from L6 on):** the rebase-safety guard, the visual-regression suite, and
  the `axe` accessibility scan run on every PR — so future upstream rebases that disturb
  the theme fail loudly.
- **Build/lint clean:** `make check-web` (svelte-check + tsc) and `make lint-web`.
- **Rebase-safety acceptance (the core invariant):** the diff for L1–L4 is essentially
  _`gallery-theme.css` (+ `gallery-overrides.css`) + one `app.css` import line + font
  assets_, with no broad component-markup recoloring — now enforced by the automated guard
  rather than a manual grep.
- **Aesthetic sign-off:** manual QA across the key screens in both modes.

## 9. Open items to resolve during planning

- Final ramp regeneration: choose the locked `--primary-500` seed and generation method.
- Confirm `@immich/ui` Button's actual variant class hooks for the Unit C override and the
  L5 computed-style test (read the installed package; the selectors above are placeholders
  until verified).
- Decide whether `--font-display` applies to all headings or only top-level page titles.
- Confirm the visual-regression toolchain: Playwright `toHaveScreenshot` config and a
  deterministic CI/Docker runner for font rendering, plus where baselines are stored.
- Confirm the contrast/completeness tests read `gallery-theme.css` directly (chosen) vs a
  typed token module — i.e. tokens stay authored in CSS, tests parse that file.
