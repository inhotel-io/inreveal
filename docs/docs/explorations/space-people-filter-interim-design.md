# Space People Timeline Filter Interim Design

## Summary

When a user opts shared spaces into their personal timeline, the Photos and Map
filter panels should show people from those shared-space photos. If the same
human appears in the user's personal people and in one or more timeline-enabled
spaces, the filter panel should show one selectable row. Selecting that row must
filter to all linked sources, not just the first source.

This is an interim read-model design. It does not introduce a global face
identity table, change face matching writes, or merge personal/space people.

## Goals

- Show accessible space people in the personal timeline people filter.
- Avoid duplicate rows when explicit evidence links personal and space people.
- Selecting a grouped row filters all linked personal and space person sources.
- Keep the design safe for users with large libraries and 20,000+ people.
- Preserve access boundaries between personal libraries and shared spaces.

## Non-Goals

- Changing the `/people` page.
- Persisting global identity links.
- Merging or renaming existing `person` or `shared_space_person` records.
- Dedupe based only on display name.
- Using inaccessible names, thumbnails, counts, or hidden/favorite state.
- Reworking smart search unless grouped person filters can be reused cleanly.

## Use Cases Covered

- A user has timeline-enabled shared spaces and expects people from those space
  photos to appear in the personal Photos filter panel.
- The same human exists as a current user's personal person and as one or more
  space people. The filter panel shows one row and selecting it searches all
  linked sources.
- The same human appears in four accessible timeline-enabled spaces. If those
  space people all link to the same personal `person.id`, the filter panel shows
  one row.
- Two unrelated people have the same display name in different spaces. Without
  explicit face/person evidence, they remain separate rows.
- A selected person is outside the default capped suggestions. The row remains
  visible and filterable through selected-source hydration.
- A user searches a large people set. The filter panel queries the server rather
  than filtering 20,000+ rows in the browser.
- A user disables favorites filtering back to all timeline assets. Shared-space
  people become available again only when shared timeline assets are in scope.
- A user loses access to a space. The lost space person stops contributing to
  future suggestions and search requests.

## Current Behavior

The Photos filter panel calls `getFilterSuggestions({ withSharedSpaces: true })`
when shared timeline assets should be included. The server scopes assets to the
current user's timeline plus timeline-enabled shared spaces, but people
suggestions currently return global `person` rows unless the request is scoped
to a single `spaceId`.

That means shared-space people are not fully represented in the personal
timeline filter. It also means the frontend still treats a visible person row as
one ID, while the product behavior now needs one visible row to represent many
linked person sources.

## Core Concept

Introduce a grouped people filter option:

```ts
type PersonFilterSource =
  | { type: 'person'; personId: string }
  | { type: 'space-person'; spaceId: string; spacePersonId: string };

type GroupedPersonFilterOption = {
  id: string;
  name: string;
  thumbnail?:
    | {
        type: 'person';
        personId: string;
      }
    | {
        type: 'space-person';
        spaceId: string;
        spacePersonId: string;
      };
  sources: PersonFilterSource[];
};
```

The `id` is an opaque UI option ID derived from accessible source references. It
is not a global identity ID and should not be used as a search filter directly.

When the user selects one grouped row, the frontend expands its sources into the
search request:

```ts
{
  personIds: ['personal-person-id'],
  spacePersonIds: ['space-person-id-1', 'space-person-id-2'],
  personMatchAny: true,
  withSharedSpaces: true
}
```

The server then treats `personIds` and `spacePersonIds` as one OR filter group.
An asset matches if it contains any selected personal person or any selected
space person.

Multiple selected people also use OR semantics in this interim. That matches the
checkbox-style filter affordance and the existing map filter behavior. If the
product later needs "Alice AND Bob" semantics, the API should add nested person
groups instead of trying to infer that from flat `personIds` and
`spacePersonIds`.

## Grouping Rules

The grouped read model may merge rows only with explicit evidence:

- A space person contains faces whose `asset_face.personId` links to a personal
  person.
- Multiple space people contain faces linked to the same personal person.
- The same `shared_space_person` appears through multiple matching assets.

The grouped read model must not merge rows only because names match. If four
spaces each have a person named "Alice" but no shared linked source, the filter
must show separate rows or a future cautious "possible matches" affordance. The
interim should not silently merge them.

## Display Rules

Use only accessible scoped data for returned fields:

- Name priority: current user's personal person name, current user's alias for a
  space person, shared-space person name, then unnamed fallback.
- Thumbnail priority: accessible personal person thumbnail, then accessible
  space person thumbnail, then initials fallback.
- Favorite or hidden state from an inaccessible personal profile must not affect
  sort order, visibility, or display.
- A personal name owned by another user should not be used as a fallback unless
  that name is already intentionally exposed through the shared-space profile.

The response can include enough thumbnail source metadata for the web client to
build existing thumbnail URLs:

- personal: `/people/:personId/thumbnail`
- space: `/shared-spaces/:spaceId/people/:spacePersonId/thumbnail`

## Performance Requirements

The people filter must not eagerly return every accessible person.

For users with 20,000+ people, the API must be bounded and searchable:

- Default people suggestions are capped, for example 100 rows by default and
  250 rows maximum.
- Results are sorted by usefulness: favorites from accessible current-user
  profiles first, named rows before unnamed rows, then accessible asset count or
  recent presence.
- The People filter search box uses server-side search, not client-side
  filtering over a huge list.
- The search request supports a `peopleQuery` field that matches accessible
  personal names, space person names, and current-user aliases.
- The frontend debounces people search and cancels or ignores stale responses.
- Selected grouped rows are rehydrated even when they are outside the current
  capped result set.

This implies a suggestion request shape like:

```ts
{
  withSharedSpaces: true,
  peopleQuery?: string,
  peopleLimit?: number,
  selectedPersonIds?: string[],
  selectedSpacePersonIds?: string[],
  ...otherFilterContext
}
```

The selected source arrays are not counted against `peopleLimit`. They keep
active chips and selected rows stable when the user changes other filters or
narrows the people query. They are represented as flat arrays rather than nested
objects so the existing filter suggestions query endpoint can parse them
reliably.

## Repository Strategy

Build candidate rows in the database, not by loading all faces into application
memory.

The repository should use the existing filtered asset scope as a CTE:

```text
filtered_asset_ids =
  accessible timeline assets
  + timeline-enabled shared-space assets
  + current non-person filters
```

Then produce people candidates from that scoped set:

- Personal candidates from `asset_face -> person`.
- Space candidates from
  `shared_space_person -> shared_space_person_face -> asset_face`.
- Alias candidates from `shared_space_person_alias` for the current user.

For unqueried top suggestions, the database should aggregate enough source data
to group first, then apply the people limit to grouped rows. Prelimiting raw
candidates is allowed only when it cannot split linked sources into duplicate
visible rows. For queried suggestions, the database should narrow by
`peopleQuery` before grouping and limiting.

Hydration for selected sources should be a separate bounded path. It only needs
to fetch rows for selected personal and space person IDs, then apply the same
access checks and display rules.

Indexes to verify before implementation:

- `asset_face(assetId, personId)`
- `asset_face(personId, assetId)` if personal candidate lookup is slow
- `shared_space_person_face(assetFaceId, personId)`
- `shared_space_person_face(personId, assetFaceId)`
- `shared_space_person(spaceId, isHidden)`
- `shared_space_person_alias(userId, personId)`
- timeline membership and shared-space asset/library lookup indexes already used
  by `withSharedSpaces`

If name search is slow at this scale, add an index strategy for lower-cased
person, space person, and alias names, or use trigram indexes if the product
needs contains-style matching.

## API Shape

Extend filter suggestions rather than adding a separate endpoint first.

Request additions:

```ts
peopleQuery?: string;
peopleLimit?: number;
selectedPersonIds?: string[];
selectedSpacePersonIds?: string[];
```

Response addition:

```ts
people: GroupedPersonFilterOption[];
```

Compatibility rule:

- Existing single personal-person rows should still behave as
  `sources: [{ type: 'person', personId: id }]`.
- Single-space filter panels may continue to return only space-person options,
  but should use the same source shape when practical.
- The frontend must not send grouped option IDs as `personIds`.

Search request additions:

```ts
personMatchAny?: boolean;
spacePersonIds?: string[];
```

`spacePersonIds` already exists in parts of the search model. The missing piece
is cross-source OR semantics when `personMatchAny` is true.

This search behavior applies to metadata/timeline and map searches that support
`withSharedSpaces`. Smart search currently has stricter validation around
`spacePersonIds` and should stay out of scope unless that validation is
redesigned deliberately.

## Frontend Strategy

Extend filter panel people options with source metadata while preserving legacy
behavior for pages that still use plain person IDs.

The filter state should keep:

- selected option IDs for UI state;
- a source lookup for selected grouped options.

A shared helper should expand selected people into API filters:

```ts
expandPersonFilters(filters) => {
  personIds: string[];
  spacePersonIds: string[];
  personMatchAny: boolean;
}
```

Photos timeline and Map timeline builders should use this helper. Suggestion
requests should use the same helper to send `selectedPersonIds` and
`selectedSpacePersonIds` for hydration. Space-specific pages can keep their
existing behavior until they opt into the grouped source shape.

The People filter search box should support an async provider:

- Show initial bounded suggestions when empty.
- On search text, request `peopleQuery`.
- Keep selected people visible even if they are not in the current result page.
- Use cached names and thumbnails only as a UI fallback; the server remains the
  source of truth for filter sources.

## Privacy Boundary

The grouped option is access-scoped. Every query must start from assets and
spaces the current user can already access:

- current user's own timeline assets;
- partner timeline assets where already enabled;
- shared-space assets from spaces where the current member has
  `showInTimeline = true`.

The system must not expose:

- global identity IDs;
- names from inaccessible personal profiles;
- thumbnails from inaccessible assets;
- hidden/favorite state from another user's private profile;
- counts from inaccessible libraries;
- cross-space identity matches unless both spaces are accessible and
  timeline-enabled for the current user.

Losing access to a space should make its sources stop contributing. Cached
client labels can remain visually orphaned until the next suggestions refresh,
but search requests must still be constrained server-side.

## Rollout

1. Add grouped suggestion support server-side behind the existing
   `withSharedSpaces` path.
2. Update the Photos timeline filter panel to consume grouped options.
3. Update Map timeline filters to use the same expansion helper.
4. Keep `/people` unchanged.
5. Measure query latency on large datasets before widening the feature.

If risk is high, gate the UI consumption behind a temporary feature flag while
the API path is tested.

## Implementation Discipline

This work should be implemented test-first. Each behavioral slice should follow
red-green-refactor:

1. Add a focused failing test for the next behavior.
2. Run the targeted test and confirm it fails for the expected reason.
3. Implement the smallest change that makes it pass.
4. Re-run the targeted test and the relevant surrounding suite.
5. Refactor only after tests are green.

Do not batch the repository query, DTO, filter-state, and UI behavior into one
untestable change. The implementation should split along the boundaries below.

## Test Coverage Plan

Server tests:

- Returns space people in `withSharedSpaces` filter suggestions.
- Groups personal and space sources when linked through `asset_face.personId`.
- Groups multiple space people linked to the same personal person.
- Does not group same-name people without explicit evidence.
- Applies people limits and does not drop selected hydrated sources.
- Searches people server-side by personal name, space name, and current-user
  alias.
- Filters assets with OR semantics across `personIds` and `spacePersonIds` when
  `personMatchAny` is true.
- Does not return names or thumbnails from inaccessible profiles/assets.
- Leaves smart-search `spacePersonIds` behavior unchanged unless smart search is
  explicitly included in a later scope.

Frontend tests:

- Maps grouped suggestion rows into filter-panel people options.
- Selecting one grouped row expands to all linked `personIds` and
  `spacePersonIds`.
- Does not send grouped option IDs as `personIds`.
- Keeps selected rows visible when the current suggestion result is capped.
- Debounces server-side people search and ignores stale responses.
- Preserves legacy personal-only behavior for album and non-grouped contexts.

Coverage matrix:

| Area                   | Minimum test type                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| DTO parsing            | Unit tests for `peopleQuery`, `peopleLimit`, selected personal IDs, and selected space person IDs          |
| Grouping               | Unit tests for explicit-link grouping and same-name non-grouping                                           |
| Repository SQL         | SQL-generation or repository tests for bounded suggestions, query narrowing, and selected-source hydration |
| Search filtering       | Service/repository tests for cross-source OR behavior                                                      |
| Privacy                | Service/repository tests using inaccessible personal names/thumbnails/counts                               |
| Web filter expansion   | Unit tests for grouped and legacy person options                                                           |
| People search UI       | Component tests for debounced server search and selected-row stability                                     |
| Photos/Map integration | Existing route/config tests updated to assert grouped source expansion                                     |

## Open Implementation Decisions

- Exact default and maximum `peopleLimit` values.
- Whether `peopleQuery` should be prefix-only for index friendliness or
  contains-style with trigram support.
- Whether `personMatchAny` should remain a generic search DTO field or be scoped
  to grouped timeline filters only.
