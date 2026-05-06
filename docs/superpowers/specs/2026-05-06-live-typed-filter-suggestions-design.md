# Live Typed Filter Suggestions Design

Status: approved for written-spec review
Date: 2026-05-06
Worktree: `/home/pierre/dev/gallery/.worktrees/search-bar-next-feature`
Branch: `brainstorm/search-bar-next-feature`

## Context

Gallery's typed search filters let users submit searches such as:

```text
beach person:anna from:2025 type:photo
```

The current implementation intentionally resolves entity filters only on Enter. That kept v1 cheap and simple, but it means users do not know whether `person:anna`, `tag:travel`, or `city:par` will resolve until submission fails or succeeds.

This feature adds live, cursor-aware suggestions for the typed filters that benefit most from preview:

- `person:`
- `tag:`
- `country:`
- `city:`

The design keeps the existing all-or-nothing Enter submit behavior. Live suggestions make the typed filter state visible and easier to correct; they do not replace final validation.

## Goals

- Preview matching filter values while the user edits a supported typed-filter token.
- Make suggestion rows unambiguously apply filters rather than navigate to entities.
- Canonicalize the raw typed token when a suggestion is selected.
- Keep normal palette providers driven by the plain query text.
- Preserve Enter as the authoritative all-or-nothing commit path.
- Support one written design with separate implementation plans for shared infrastructure, people, tags, location, and polish.

## Non-Goals

- Do not build a full token editor or token-attached popover.
- Do not live-suggest `camera:` in this feature. Existing Enter-time camera resolution remains unchanged.
- Do not make live suggestions submit filters automatically.
- Do not show verbose scalar validation issue rows while the user is still editing.
- Do not reuse the existing People or Tags navigation sections for filter application rows.

## User Experience

When the cursor is inside a supported typed-filter token, the palette treats that token as the active filter being edited.

Examples:

- Cursor inside `person:ann` shows a `Person filter matches` section.
- Cursor inside `tag:` shows initial tag suggestions.
- Cursor inside `country:ger` shows matching countries.
- Cursor inside `city:par` shows matching cities.

The filter-match section appears above the top result and normal provider sections. It is visually compact and action-specific. Rows use copy such as `Use as filter` so selection is not confused with navigating to a person or tag page.

Selecting a suggestion rewrites only the active token to a canonical value:

```text
beach person:ann
```

becomes:

```text
beach person:"Anna Maria"
```

The caret stays after the rewritten token. The token rail marks that token as resolved. If the user edits the token again, the resolved state is cleared and live suggestions resume.

Initial suggestions:

- `person:` shows initial people suggestions, following the spirit of the existing bare-`@` suggestions.
- `tag:` shows initial tag suggestions, following the spirit of existing tag suggestion behavior.
- `country:` shows initial country suggestions.
- `city:` waits for at least one character.

Scalar validation stays quiet while typing. Invalid scalar tokens such as `rating:9`, `from:soon`, or `favorite:maybe` may turn red immediately, but detailed issue rows appear only after Enter blocks submission.

## Location Behavior

Location suggestions cover both `country:` and `city:`.

`country:` resolves against country suggestions. Empty `country:` shows initial suggestions.

`city:` resolves against city suggestions. When the input also contains a country token, city suggestions are scoped to that country:

```text
beach country:Germany city:ber
```

shows German city matches such as `Berlin`.

Without a country token, `city:par` suggests matching cities globally. City rows should include country as secondary text when the API response provides it, so the user can choose the right `Paris`.

Selecting a city canonicalizes only the city token. It does not automatically add a `country:` token in this feature. If a city value is ambiguous at final submit time, Enter still blocks and asks the user to choose.

## Architecture

### Cursor-Aware Parser Metadata

Extend the typed-search parser result with token span metadata:

- raw token text
- normalized key
- parsed value
- start offset
- end offset
- syntactic issue, if any

The parser should remain pure and dependency-free. It should not read DOM selection state or fetch suggestions.

The global search input should provide the manager with the current caret offset. The manager combines the parse result and caret offset to find the active token. A supported live token is active when the caret is inside or immediately after a `person`, `tag`, `country`, or `city` token.

### Live Suggestion Utility

Add a typed-search live suggestion utility that accepts:

- parse result
- active token metadata
- current selected-choice state
- scope information such as `spaceId`
- abort signal

It returns preview choices, not a final `FilterState`.

The utility should reuse the same data sources and matching semantics as final resolution where possible:

- `person:` uses people search or scoped people suggestions.
- `tag:` uses tag suggestions/cache.
- `country:` uses filter-suggestion countries.
- `city:` uses city search suggestions, scoped by an existing `country:` token when present.

The existing Enter resolver remains authoritative. Live suggestions can pass selected choices to the Enter resolver so it can avoid duplicate lookups where practical, but Enter must still validate the full input all-or-nothing before navigation.

### Manager State

The global search manager owns:

- caret offset
- active live token
- debounce timer
- request id
- abort controller
- live suggestion status
- live suggestion rows
- selected choices keyed by token identity

Status values:

- `idle`: no supported active token.
- `loading`: debounce fired and a request is in flight.
- `ok`: rows are available.
- `empty`: no matches.
- `error`: lookup failed.
- `timeout`: lookup exceeded the provider timeout.

Stale responses must be ignored using request id and abort signal. Closing the palette aborts live suggestion requests.

### UI

Add a dedicated filter-match section above `Top result` and normal providers. Do not place live suggestions in the existing People, Tags, or Navigation sections.

The same component should support all live keys with key-specific labels:

- `Person filter matches`
- `Tag filter matches`
- `Country filter matches`
- `City filter matches`

Rows should be keyboard-navigable with the existing cmdk list semantics. Choosing a row canonicalizes the active token and updates selected-choice state. The UI should stay compact, with a small row cap, so validation does not push normal search results too far down.

The normal provider payload remains the plain query text from the parser. For example, `beach city:par` still searches photos for `beach`.

## Data Flow

While typing:

1. Input value changes.
2. Manager parses the raw input.
3. Manager updates token rail display state.
4. Input selection change updates the caret offset.
5. Manager derives the active live token.
6. If the active token supports live suggestions, manager starts a debounced request.
7. UI renders the filter-match section when live status is `loading`, `ok`, `empty`, `error`, or `timeout`.

When selecting a live suggestion:

1. Manager rewrites only the active token to its canonical value.
2. Manager updates the raw query.
3. Manager keeps the caret after the rewritten token.
4. Manager stores the selected choice for final resolution.
5. Manager clears live rows or moves to the next active token if the caret lands in one.

When pressing Enter:

1. Manager parses the current raw input.
2. Parser issues block immediately.
3. Enter resolver resolves all supported and existing typed filters.
4. If any filter is invalid, unresolved, ambiguous, or fails resolution, the palette stays open and issue rows render.
5. If everything resolves, the destination URL is built with `q`, `sort`, and serialized filters.
6. Destination pages hydrate the same filter state used by the filter panel.

## Error Handling

Live suggestion errors do not block typing. They should render as quiet inline rows in the filter-match section, for example `Unable to load matching people`. They should not create commit-blocking issue rows until Enter.

No-match live results show a compact empty row. On Enter, unresolved filters still use the existing blocking issue behavior.

Scalar filters may turn red while typing, but detailed issue copy appears only after Enter. This avoids noisy mid-edit feedback while still showing that a token needs attention.

## Implementation Plan Split

Write one design and separate implementation plans:

1. **Shared cursor-aware foundation**
   Add parser spans, caret tracking, live suggestion manager state, debounce/abort/stale handling, and the dedicated section shell.
2. **People live suggestions**
   Implement `person:` suggestions, selection canonicalization, selected-choice reuse, and tests.
3. **Tags live suggestions**
   Implement `tag:` suggestions, including empty initial suggestions and tests.
4. **Location live suggestions**
   Implement `country:` and `city:` suggestions, including country-scoped city lookup and tests.
5. **Polish and regression coverage**
   Cover keyboard navigation, mobile/dropdown parity, timeout/error states, stale response guards, final Enter behavior, and docs updates.

## Testing

Use TDD at the same boundaries as the typed-filter feature:

- Parser unit tests for token spans, caret-active token derivation, quoted values, and issue preservation.
- Live suggestion utility tests with mocked SDK calls for people, tags, countries, scoped cities, empty states, ambiguous matches, errors, and aborts.
- Manager tests for debounce, stale response guards, caret changes, canonical token rewrite, selected-choice clearing when a token changes, and final Enter integration.
- Component tests for the filter-match section, row labels, loading/empty/error states, and keyboard activation.
- Route-level tests confirming final submitted filters still serialize and hydrate into photos/spaces page filter state.

Baseline verification for this brainstorming worktree:

```bash
pnpm install --frozen-lockfile
pnpm --filter @immich/sdk build
pnpm --dir web exec vitest --run src/lib/utils/__tests__/space-search.spec.ts src/lib/managers/global-search-manager.svelte.spec.ts
```

The focused baseline tests passed before this spec was written.
