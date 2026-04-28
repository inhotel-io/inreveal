# Grouped Space People Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show timeline-enabled shared-space people in personal Photos and Map filter panels, dedupe explicit personal/space matches into one row, and make one selected row filter all linked person sources.

**Architecture:** Add an access-scoped grouped people read model behind filter suggestions, using explicit links through `shared_space_person_face.assetFaceId -> asset_face.personId`. Keep grouped option IDs UI-only; expand selections into flat `personIds` and `spacePersonIds` search filters. Keep large-library behavior bounded with server-side people search, selected-source hydration, and capped suggestions.

**Tech Stack:** NestJS + Zod DTOs, Kysely/Postgres SQL, Vitest, Svelte 5, Svelte Testing Library, generated `@immich/sdk`.

---

## File Structure

- Create `server/src/utils/person-filter-options.ts`
  - Pure grouping and display-selection logic for personal and shared-space person candidates.
  - No database access.
- Create `server/src/utils/person-filter-options.spec.ts`
  - Unit tests for grouping, source expansion, same-name non-grouping, and display priority.
- Modify `server/src/dtos/search.dto.ts`
  - Adds grouped person response fields and filter-suggestion query fields.
  - Adds `personMatchAny` to search DTOs that flow into `searchAssetBuilder`.
- Modify `server/src/dtos/gallery-map.dto.ts`
  - Adds `spacePersonIds` and `personMatchAny` for global filtered map marker requests.
- Modify `server/src/dtos/time-bucket.dto.ts`
  - Adds `personMatchAny` for timeline bucket requests.
- Modify `server/src/controllers/search.controller.spec.ts`
  - Covers query parsing for `peopleQuery`, `peopleLimit`, selected source IDs, and enriched person response shape.
- Modify `server/src/services/search.service.ts`
  - Passes `currentUserId` and selected source filters to the repository.
- Modify `server/src/services/search.service.spec.ts`
  - Covers repository passthrough and timeline-space resolution with new fields.
- Modify `server/src/repositories/search.repository.ts`
  - Replaces the personal-only `withSharedSpaces` people suggestion path with grouped personal/space candidates.
  - Keeps `spaceId` behavior compatible for space pages.
- Modify `server/src/repositories/search.repository.spec.ts`
  - Adds offline SQL shape tests for grouped candidate queries, limits, query narrowing, selected hydration, and cross-source OR search.
- Modify `server/src/utils/database.ts`
  - Adds a reusable cross-source person OR predicate.
  - Updates `searchAssetBuilder` to use OR when both source arrays are present and `personMatchAny` is true.
- Modify `server/src/repositories/asset.repository.ts`
  - Uses the same cross-source OR predicate for time bucket queries.
- Modify `server/src/services/shared-space.service.ts`
  - Passes global `spacePersonIds` through filtered map marker search when no `spaceId` is set.
- Modify `server/src/services/shared-space.service.spec.ts`
  - Covers filtered map marker passthrough for grouped personal + space sources.
- Modify `open-api/typescript-sdk/src/fetch-client.ts` and generated SDK build outputs through the repo's OpenAPI sync flow.
  - Gives web code typed access to new DTO fields.
- Modify `web/src/lib/components/filter-panel/filter-panel.ts`
  - Adds `PersonFilterSource`, grouped person option fields, selected source state, and expansion helpers.
- Modify `web/src/lib/components/filter-panel/filter-panel.svelte`
  - Preserves selected source metadata when people selections change.
  - Sends selected sources for suggestion hydration.
  - Connects People filter search to server-side suggestion search.
- Modify `web/src/lib/components/filter-panel/people-filter.svelte`
  - Emits debounced people search text and keeps selected rows visible.
- Modify `web/src/lib/components/filter-panel/__tests__/filter-state.spec.ts`
  - Covers grouped source state, clearing, filter context, and expansion helper behavior.
- Modify `web/src/lib/components/filter-panel/__tests__/filter-panel.spec.ts` and/or `web/src/lib/components/filter-panel/__tests__/unified-suggestions.spec.ts`
  - Covers server-side people search and selected-row stability.
- Modify `web/src/lib/utils/photos-filter-options.ts`
  - Expands grouped selected people into `personIds`, `spacePersonIds`, and `personMatchAny`.
- Modify `web/src/lib/utils/__tests__/photos-filter-options.spec.ts`
  - Covers grouped source expansion and legacy personal-only behavior.
- Modify `web/src/lib/utils/map-filter-options.ts`
  - Expands grouped selected people for global Map marker, time bucket, and cluster timeline requests.
- Modify `web/src/lib/utils/__tests__/map-filter-options.spec.ts`
  - Covers grouped global map filters and unchanged space-scoped behavior.
- Modify `web/src/lib/utils/map-filter-config.ts`
  - Maps grouped person suggestion response rows to `PersonOption` with correct thumbnail URLs and source metadata.
- Modify `web/src/lib/utils/__tests__/map-filter-config.spec.ts`
  - Covers grouped suggestion mapping and selected source hydration request fields.
- Modify `web/src/routes/(user)/photos/[[assetId=id]]/+page.svelte`
  - Maps grouped person suggestion rows, updates person name cache by grouped option ID, and passes selected sources for hydration.
- Modify `web/src/routes/(user)/photos/[[assetId=id]]/photos-page.spec.ts`
  - Covers Photos filter config passing grouped suggestion fields and `withSharedSpaces` rules.

## Constants and Type Names

Use these names consistently across tasks:

```ts
const DEFAULT_PEOPLE_LIMIT = 100;
const MAX_PEOPLE_LIMIT = 250;
```

Server DTO fields:

```ts
peopleQuery?: string;
peopleLimit?: number;
selectedPersonIds?: string[];
selectedSpacePersonIds?: string[];
personMatchAny?: boolean;
```

Response shape:

```ts
type FilterSuggestionPersonSourceDto =
  | { type: 'person'; personId: string }
  | { type: 'space-person'; spaceId: string; spacePersonId: string };

type FilterSuggestionPersonThumbnailDto =
  | { type: 'person'; personId: string }
  | { type: 'space-person'; spaceId: string; spacePersonId: string };

type FilterSuggestionsPersonDto = {
  id: string;
  name: string;
  sources: FilterSuggestionPersonSourceDto[];
  personIds: string[];
  spacePersonIds: string[];
  thumbnail?: FilterSuggestionPersonThumbnailDto;
};
```

Web state:

```ts
type PersonFilterSource =
  | { type: 'person'; personId: string }
  | { type: 'space-person'; spaceId: string; spacePersonId: string };

type PersonFilterSourcesByOptionId = Record<string, PersonFilterSource[]>;
```

---

### Task 1: Server DTOs Parse Grouped People Fields

**Files:**

- Modify: `server/src/dtos/search.dto.ts`
- Modify: `server/src/dtos/gallery-map.dto.ts`
- Modify: `server/src/dtos/time-bucket.dto.ts`
- Test: `server/src/controllers/search.controller.spec.ts`
- Test: `server/src/dtos/time-bucket.dto.spec.ts`

- [ ] **Step 1: Write failing controller tests for filter suggestion query parsing**

Add this test in `server/src/controllers/search.controller.spec.ts` inside `describe('GET /search/suggestions/filters')`:

```ts
it('accepts grouped people suggestion query params', async () => {
  const personId = '11111111-1111-4111-8111-111111111111';
  const spacePersonId = '22222222-2222-4222-8222-222222222222';
  ctx.authenticate.mockResolvedValue({});
  service.getFilterSuggestions.mockResolvedValue({
    countries: [],
    cameraMakes: [],
    tags: [],
    people: [
      {
        id: `person:${personId}`,
        name: 'Alice',
        personIds: [personId],
        spacePersonIds: [spacePersonId],
        sources: [
          { type: 'person', personId },
          { type: 'space-person', spaceId: '33333333-3333-4333-8333-333333333333', spacePersonId },
        ],
        thumbnail: { type: 'person', personId },
      },
    ],
    ratings: [],
    mediaTypes: [],
    hasUnnamedPeople: false,
  });

  const { status, body } = await request(ctx.getHttpServer()).get('/search/suggestions/filters').query({
    withSharedSpaces: true,
    peopleQuery: 'ali',
    peopleLimit: '25',
    selectedPersonIds: personId,
    selectedSpacePersonIds: spacePersonId,
  });

  expect(status).toBe(200);
  expect(body.people[0]).toEqual({
    id: `person:${personId}`,
    name: 'Alice',
    personIds: [personId],
    spacePersonIds: [spacePersonId],
    sources: [
      { type: 'person', personId },
      { type: 'space-person', spaceId: '33333333-3333-4333-8333-333333333333', spacePersonId },
    ],
    thumbnail: { type: 'person', personId },
  });
  expect(service.getFilterSuggestions).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      withSharedSpaces: true,
      peopleQuery: 'ali',
      peopleLimit: 25,
      selectedPersonIds: [personId],
      selectedSpacePersonIds: [spacePersonId],
    }),
  );
});
```

- [ ] **Step 2: Write failing DTO tests for `personMatchAny` on time buckets**

Add this test in `server/src/dtos/time-bucket.dto.spec.ts`:

```ts
it('parses personMatchAny as a boolean', () => {
  const result = TimeBucketDto.safeParse({ personMatchAny: 'true' });

  expect(result.success).toBe(true);
  expect(result.data?.personMatchAny).toBe(true);
});
```

- [ ] **Step 3: Run the failing tests**

Run:

```bash
cd server
pnpm test -- --run src/controllers/search.controller.spec.ts -t "accepts grouped people suggestion query params"
pnpm test -- --run src/dtos/time-bucket.dto.spec.ts -t "parses personMatchAny"
```

Expected: both tests fail because the DTOs do not yet parse the new fields and the response schema strips grouped people fields.

- [ ] **Step 4: Add server DTO schemas**

In `server/src/dtos/search.dto.ts`, add reusable array preprocessing near the existing query array schemas:

```ts
const uuidArrayQuery = z
  .preprocess((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]), z.array(z.uuidv4()))
  .optional();
```

Add `personMatchAny` to `BaseSearchSchema`:

```ts
personMatchAny: z.boolean().optional().describe('Match any selected personal or shared-space person source'),
```

Replace `FilterSuggestionsPersonSchema` with:

```ts
const FilterSuggestionPersonSourceSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('person'),
      personId: z.uuidv4(),
    }),
    z.object({
      type: z.literal('space-person'),
      spaceId: z.uuidv4(),
      spacePersonId: z.uuidv4(),
    }),
  ])
  .meta({ id: 'FilterSuggestionPersonSourceDto' });

const FilterSuggestionPersonThumbnailSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('person'),
      personId: z.uuidv4(),
    }),
    z.object({
      type: z.literal('space-person'),
      spaceId: z.uuidv4(),
      spacePersonId: z.uuidv4(),
    }),
  ])
  .meta({ id: 'FilterSuggestionPersonThumbnailDto' });

const FilterSuggestionsPersonSchema = z
  .object({
    id: z.string().describe('Opaque filter option ID'),
    name: z.string().describe('Person display name'),
    personIds: z.array(z.uuidv4()).default([]).describe('Personal person IDs represented by this option'),
    spacePersonIds: z.array(z.uuidv4()).default([]).describe('Shared-space person IDs represented by this option'),
    sources: z
      .array(FilterSuggestionPersonSourceSchema)
      .default([])
      .describe('Filter sources represented by this option'),
    thumbnail: FilterSuggestionPersonThumbnailSchema.optional().describe('Thumbnail source for this option'),
  })
  .meta({ id: 'FilterSuggestionsPersonDto' });
```

Extend `FilterSuggestionsRequestBaseSchema`:

```ts
peopleQuery: z.string().trim().min(1).max(100).optional().describe('Search people suggestions by accessible name'),
peopleLimit: z.coerce.number().int().min(1).max(250).optional().describe('Maximum people suggestions to return'),
selectedPersonIds: uuidArrayQuery.describe('Selected personal person IDs to rehydrate'),
selectedSpacePersonIds: uuidArrayQuery.describe('Selected shared-space person IDs to rehydrate'),
```

In `server/src/dtos/gallery-map.dto.ts`, add these fields to `FilteredMapMarkerSchema`:

```ts
spacePersonIds: uuidArrayQuery.describe('Filter by shared-space person IDs'),
personMatchAny: stringToBool.optional().describe('Match any selected personal or shared-space person source'),
```

In `server/src/dtos/time-bucket.dto.ts`, add this field to `TimeBucketQueryBaseSchema`:

```ts
personMatchAny: stringToBool.optional().describe('Match any selected personal or shared-space person source'),
```

- [ ] **Step 5: Run the targeted tests again**

Run:

```bash
cd server
pnpm test -- --run src/controllers/search.controller.spec.ts -t "accepts grouped people suggestion query params"
pnpm test -- --run src/dtos/time-bucket.dto.spec.ts -t "parses personMatchAny"
```

Expected: both tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/dtos/search.dto.ts server/src/dtos/gallery-map.dto.ts server/src/dtos/time-bucket.dto.ts server/src/controllers/search.controller.spec.ts server/src/dtos/time-bucket.dto.spec.ts
git commit -m "feat(server): add grouped people filter DTO fields"
```

---

### Task 2: Pure Grouping Helper

**Files:**

- Create: `server/src/utils/person-filter-options.ts`
- Create: `server/src/utils/person-filter-options.spec.ts`

- [ ] **Step 1: Write failing grouping tests**

Create `server/src/utils/person-filter-options.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { groupPersonFilterOptions, type PersonFilterCandidate } from './person-filter-options';

const spaceIdA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const spaceIdB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const personId = '11111111-1111-4111-8111-111111111111';
const spacePersonA = '22222222-2222-4222-8222-222222222222';
const spacePersonB = '33333333-3333-4333-8333-333333333333';

describe('groupPersonFilterOptions', () => {
  it('groups a personal person with linked space people and exposes all sources', () => {
    const candidates: PersonFilterCandidate[] = [
      {
        kind: 'person',
        personId,
        name: 'Alice',
        isFavorite: true,
        assetCount: 12,
      },
      {
        kind: 'space-person',
        spaceId: spaceIdA,
        spacePersonId: spacePersonA,
        name: 'Alice in Family',
        aliasName: 'Ally',
        linkedPersonIds: [personId],
        assetCount: 8,
      },
      {
        kind: 'space-person',
        spaceId: spaceIdB,
        spacePersonId: spacePersonB,
        name: 'Alice in Trip',
        linkedPersonIds: [personId],
        assetCount: 4,
      },
    ];

    const result = groupPersonFilterOptions(candidates, { limit: 100 });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        name: 'Alice',
        personIds: [personId],
        spacePersonIds: [spacePersonA, spacePersonB],
        thumbnail: { type: 'person', personId },
      }),
    );
    expect(result[0].sources).toEqual([
      { type: 'person', personId },
      { type: 'space-person', spaceId: spaceIdA, spacePersonId: spacePersonA },
      { type: 'space-person', spaceId: spaceIdB, spacePersonId: spacePersonB },
    ]);
  });

  it('does not group same-name space people without explicit linked person evidence', () => {
    const result = groupPersonFilterOptions(
      [
        {
          kind: 'space-person',
          spaceId: spaceIdA,
          spacePersonId: spacePersonA,
          name: 'Alice',
          linkedPersonIds: [],
          assetCount: 7,
        },
        {
          kind: 'space-person',
          spaceId: spaceIdB,
          spacePersonId: spacePersonB,
          name: 'Alice',
          linkedPersonIds: [],
          assetCount: 6,
        },
      ],
      { limit: 100 },
    );

    expect(result).toHaveLength(2);
    expect(result.map((option) => option.spacePersonIds)).toEqual([[spacePersonA], [spacePersonB]]);
  });

  it('keeps selected hydrated sources even after applying the default limit', () => {
    const result = groupPersonFilterOptions(
      [
        { kind: 'person', personId, name: 'Alice', isFavorite: false, assetCount: 10 },
        {
          kind: 'person',
          personId: '44444444-4444-4444-8444-444444444444',
          name: 'Bob',
          isFavorite: false,
          assetCount: 9,
        },
      ],
      { limit: 1, selectedPersonIds: ['44444444-4444-4444-8444-444444444444'] },
    );

    expect(result.map((option) => option.name)).toEqual(['Alice', 'Bob']);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
cd server
pnpm test -- --run src/utils/person-filter-options.spec.ts
```

Expected: FAIL because `server/src/utils/person-filter-options.ts` does not exist.

- [ ] **Step 3: Implement the pure helper**

Create `server/src/utils/person-filter-options.ts`:

```ts
export const DEFAULT_PEOPLE_LIMIT = 100;
export const MAX_PEOPLE_LIMIT = 250;

export type PersonFilterSource =
  | { type: 'person'; personId: string }
  | { type: 'space-person'; spaceId: string; spacePersonId: string };

export type PersonFilterThumbnail =
  | { type: 'person'; personId: string }
  | { type: 'space-person'; spaceId: string; spacePersonId: string };

export type PersonFilterCandidate =
  | {
      kind: 'person';
      personId: string;
      name: string;
      isFavorite: boolean;
      assetCount: number;
    }
  | {
      kind: 'space-person';
      spaceId: string;
      spacePersonId: string;
      name: string;
      aliasName?: string | null;
      linkedPersonIds: string[];
      assetCount: number;
    };

export type GroupedPersonFilterOption = {
  id: string;
  name: string;
  personIds: string[];
  spacePersonIds: string[];
  sources: PersonFilterSource[];
  thumbnail?: PersonFilterThumbnail;
};

type Group = {
  personal: Extract<PersonFilterCandidate, { kind: 'person' }>[];
  space: Extract<PersonFilterCandidate, { kind: 'space-person' }>[];
};

const sourceKey = (source: PersonFilterSource) =>
  source.type === 'person' ? `person:${source.personId}` : `space-person:${source.spaceId}:${source.spacePersonId}`;

class UnionFind {
  private parent = new Map<string, string>();

  find(key: string): string {
    const parent = this.parent.get(key);
    if (!parent) {
      this.parent.set(key, key);
      return key;
    }
    if (parent === key) {
      return key;
    }
    const root = this.find(parent);
    this.parent.set(key, root);
    return root;
  }

  union(a: string, b: string) {
    this.parent.set(this.find(b), this.find(a));
  }
}

export function groupPersonFilterOptions(
  candidates: PersonFilterCandidate[],
  options: { limit?: number; selectedPersonIds?: string[]; selectedSpacePersonIds?: string[] } = {},
): GroupedPersonFilterOption[] {
  const limit = Math.min(options.limit ?? DEFAULT_PEOPLE_LIMIT, MAX_PEOPLE_LIMIT);
  const selectedPersonIds = new Set(options.selectedPersonIds ?? []);
  const selectedSpacePersonIds = new Set(options.selectedSpacePersonIds ?? []);
  const unionFind = new UnionFind();
  const candidateKeys = new Map<PersonFilterCandidate, string>();

  for (const candidate of candidates) {
    const key =
      candidate.kind === 'person'
        ? `person:${candidate.personId}`
        : `space-person:${candidate.spaceId}:${candidate.spacePersonId}`;
    candidateKeys.set(candidate, key);
    unionFind.find(key);
    if (candidate.kind === 'space-person') {
      for (const linkedPersonId of candidate.linkedPersonIds) {
        unionFind.union(`person:${linkedPersonId}`, key);
      }
    }
  }

  const groups = new Map<string, Group>();
  for (const candidate of candidates) {
    const root = unionFind.find(candidateKeys.get(candidate)!);
    const group = groups.get(root) ?? { personal: [], space: [] };
    if (candidate.kind === 'person') {
      group.personal.push(candidate);
    } else {
      group.space.push(candidate);
    }
    groups.set(root, group);
  }

  const rows = [...groups.values()].map((group) => mapGroup(group));
  rows.sort(
    (a, b) => b.score - a.score || a.option.name.localeCompare(b.option.name) || a.option.id.localeCompare(b.option.id),
  );

  const limited = rows.slice(0, limit);
  const selected = rows.slice(limit).filter(({ option }) => {
    return (
      option.personIds.some((id) => selectedPersonIds.has(id)) ||
      option.spacePersonIds.some((id) => selectedSpacePersonIds.has(id))
    );
  });

  return [...limited, ...selected].map(({ option }) => option);
}

function mapGroup(group: Group): { option: GroupedPersonFilterOption; score: number } {
  group.personal.sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || b.assetCount - a.assetCount);
  group.space.sort((a, b) => b.assetCount - a.assetCount);

  const personIds = [...new Set(group.personal.map((person) => person.personId))].sort();
  const spacePeople = group.space
    .map((person) => ({ spaceId: person.spaceId, spacePersonId: person.spacePersonId }))
    .sort((a, b) => a.spacePersonId.localeCompare(b.spacePersonId));
  const spacePersonIds = spacePeople.map((person) => person.spacePersonId);
  const sources: PersonFilterSource[] = [
    ...personIds.map((personId) => ({ type: 'person' as const, personId })),
    ...spacePeople.map((person) => ({ type: 'space-person' as const, ...person })),
  ];

  const preferredPersonal = group.personal.find((person) => person.name.trim() !== '');
  const preferredSpace = group.space.find((person) => (person.aliasName || person.name).trim() !== '');
  const name = preferredPersonal?.name || preferredSpace?.aliasName || preferredSpace?.name || 'Unnamed person';
  const thumbnail = preferredPersonal
    ? ({ type: 'person', personId: preferredPersonal.personId } as const)
    : group.space[0]
      ? ({
          type: 'space-person',
          spaceId: group.space[0].spaceId,
          spacePersonId: group.space[0].spacePersonId,
        } as const)
      : undefined;

  const id = `group:${sources.map(sourceKey).sort().join('|')}`;
  const score =
    Math.max(...group.personal.map((person) => (person.isFavorite ? 1 : 0)), 0) * 1_000_000 +
    [...group.personal, ...group.space].reduce((sum, person) => sum + person.assetCount, 0);

  return { option: { id, name, personIds, spacePersonIds, sources, thumbnail }, score };
}
```

- [ ] **Step 4: Run the helper tests**

Run:

```bash
cd server
pnpm test -- --run src/utils/person-filter-options.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/utils/person-filter-options.ts server/src/utils/person-filter-options.spec.ts
git commit -m "feat(server): group linked people filter sources"
```

---

### Task 3: Repository Grouped People Suggestions

**Files:**

- Modify: `server/src/repositories/search.repository.ts`
- Modify: `server/src/repositories/search.repository.spec.ts`
- Modify: `server/src/services/search.service.ts`
- Modify: `server/src/services/search.service.spec.ts`

- [ ] **Step 1: Write failing service passthrough test**

Add this test in `server/src/services/search.service.spec.ts` inside `describe('getFilterSuggestions')`:

```ts
it('passes current user and grouped people filters to repository', async () => {
  const auth = AuthFactory.create();
  const selectedPersonId = newUuid();
  const selectedSpacePersonId = newUuid();
  mocks.partner.getAll.mockResolvedValue([]);
  mocks.sharedSpace.getSpaceIdsForTimeline.mockResolvedValue([]);
  mocks.search.getFilterSuggestions.mockResolvedValue(emptyResult);

  await sut.getFilterSuggestions(auth, {
    withSharedSpaces: true,
    peopleQuery: 'ali',
    peopleLimit: 25,
    selectedPersonIds: [selectedPersonId],
    selectedSpacePersonIds: [selectedSpacePersonId],
  });

  expect(mocks.search.getFilterSuggestions).toHaveBeenCalledWith(
    [auth.user.id],
    expect.objectContaining({
      currentUserId: auth.user.id,
      peopleQuery: 'ali',
      peopleLimit: 25,
      selectedPersonIds: [selectedPersonId],
      selectedSpacePersonIds: [selectedSpacePersonId],
    }),
  );
});
```

- [ ] **Step 2: Write failing SQL shape tests**

Add tests in `server/src/repositories/search.repository.spec.ts` under `describe('filter suggestions query shape')`:

```ts
it('timeline people suggestions include shared-space person candidates when timelineSpaceIds is set', () => {
  const sql = (sut as any)
    .buildFilteredTimelinePeopleCandidates(
      (sut as any).buildFilteredAssetIds(['00000000-0000-0000-0000-000000000000'], {
        timelineSpaceIds: ['11111111-1111-1111-1111-111111111111'],
      }),
      {
        currentUserId: '00000000-0000-0000-0000-000000000000',
        timelineSpaceIds: ['11111111-1111-1111-1111-111111111111'],
      },
    )
    .compile().sql;

  expect(sql).toContain('"shared_space_person"');
  expect(sql).toContain('"shared_space_person_face"');
  expect(sql).toContain('"shared_space_person_alias"');
  expect(sql).toMatch(/"shared_space_person"\."spaceId"\s*=\s*any/i);
});

it('peopleQuery narrows grouped people candidate lookup', () => {
  const sql = (sut as any)
    .buildFilteredTimelinePeopleCandidates(
      (sut as any).buildFilteredAssetIds(['00000000-0000-0000-0000-000000000000'], {
        timelineSpaceIds: ['11111111-1111-1111-1111-111111111111'],
      }),
      {
        currentUserId: '00000000-0000-0000-0000-000000000000',
        timelineSpaceIds: ['11111111-1111-1111-1111-111111111111'],
        peopleQuery: 'ali',
      },
    )
    .compile().sql;

  expect(sql).toMatch(/lower\(/i);
  expect(sql).toMatch(/like/i);
});

it('selected people hydration is bounded by selected IDs and not peopleQuery', () => {
  const sql = (sut as any)
    .buildSelectedTimelinePeopleCandidates(
      (sut as any).buildFilteredAssetIds(['00000000-0000-0000-0000-000000000000'], {
        timelineSpaceIds: ['11111111-1111-1111-1111-111111111111'],
      }),
      {
        currentUserId: '00000000-0000-0000-0000-000000000000',
        timelineSpaceIds: ['11111111-1111-1111-1111-111111111111'],
        peopleQuery: 'zzz',
        selectedPersonIds: ['22222222-2222-4222-8222-222222222222'],
        selectedSpacePersonIds: ['33333333-3333-4333-8333-333333333333'],
      },
    )
    .compile().sql;

  expect(sql).toContain('"person"."id" = any');
  expect(sql).toContain('"shared_space_person"."id" = any');
  expect(sql).not.toMatch(/lower\(/i);
});
```

- [ ] **Step 3: Run failing tests**

Run:

```bash
cd server
pnpm test -- --run src/services/search.service.spec.ts -t "passes current user and grouped people filters"
pnpm test -- --run src/repositories/search.repository.spec.ts -t "timeline people suggestions include shared-space person candidates"
pnpm test -- --run src/repositories/search.repository.spec.ts -t "peopleQuery narrows grouped people candidate lookup"
pnpm test -- --run src/repositories/search.repository.spec.ts -t "selected people hydration"
```

Expected: FAIL because `currentUserId` is not passed and the grouped candidate query helpers do not exist.

- [ ] **Step 4: Pass `currentUserId` from service to repository**

In `server/src/services/search.service.ts`, change:

```ts
return await this.searchRepository.getFilterSuggestions(userIds, { ...dto, timelineSpaceIds });
```

to:

```ts
return await this.searchRepository.getFilterSuggestions(userIds, {
  ...dto,
  currentUserId: auth.user.id,
  timelineSpaceIds,
});
```

- [ ] **Step 5: Add repository option and result types**

In `server/src/repositories/search.repository.ts`, import the grouping helper:

```ts
import {
  DEFAULT_PEOPLE_LIMIT,
  groupPersonFilterOptions,
  type GroupedPersonFilterOption,
  type PersonFilterCandidate,
} from 'src/utils/person-filter-options';
```

Extend `FilterSuggestionFilterOptions`:

```ts
peopleQuery?: string;
peopleLimit?: number;
selectedPersonIds?: string[];
selectedSpacePersonIds?: string[];
```

Extend `FilterSuggestionsOptions`:

```ts
export interface FilterSuggestionsOptions extends SuggestionScopeOptions, FilterSuggestionFilterOptions {
  currentUserId?: string;
}
```

Change `FilterSuggestionsResult.people`:

```ts
people: GroupedPersonFilterOption[];
```

- [ ] **Step 6: Add grouped candidate query methods**

In `SearchRepository`, add private methods after `buildFilteredGlobalPeopleQuery`:

```ts
private buildFilteredTimelinePeopleCandidates(
  filteredIds: SelectQueryBuilder<DB, 'asset', { id: string }>,
  options: FilterSuggestionsOptions,
) {
  const query = options.peopleQuery?.toLowerCase();
  const personal = this.db
    .selectFrom('person')
    .innerJoin('asset_face', 'asset_face.personId', 'person.id')
    .select([
      sql<'person'>`${sql.lit('person')}`.as('kind'),
      'person.id as personId',
      sql<string | null>`null`.as('spaceId'),
      sql<string | null>`null`.as('spacePersonId'),
      'person.name as name',
      sql<string | null>`null`.as('aliasName'),
      'person.isFavorite as isFavorite',
      sql<string[]>`array["person"."id"]::uuid[]`.as('linkedPersonIds'),
      (eb) => eb.fn.count('asset_face.assetId').distinct().$castTo<number>().as('assetCount'),
    ])
    .where('person.name', '!=', '')
    .where('person.isHidden', '=', false)
    .where('asset_face.assetId', 'in', filteredIds)
    .where('asset_face.deletedAt', 'is', null)
    .where('asset_face.isVisible', 'is', true)
    .$if(!!query, (qb) => qb.where(sql`lower("person"."name")`, 'like', `${query}%`))
    .groupBy(['person.id', 'person.name', 'person.isFavorite']);

  const space = this.db
    .selectFrom('shared_space_person')
    .innerJoin('shared_space_person_face', 'shared_space_person_face.personId', 'shared_space_person.id')
    .innerJoin('asset_face', 'asset_face.id', 'shared_space_person_face.assetFaceId')
    .leftJoin('shared_space_person_alias', (join) =>
      join
        .onRef('shared_space_person_alias.personId', '=', 'shared_space_person.id')
        .on('shared_space_person_alias.userId', '=', asUuid(options.currentUserId!)),
    )
    .select([
      sql<'space-person'>`${sql.lit('space-person')}`.as('kind'),
      sql<string | null>`null`.as('personId'),
      'shared_space_person.spaceId as spaceId',
      'shared_space_person.id as spacePersonId',
      'shared_space_person.name as name',
      'shared_space_person_alias.name as aliasName',
      sql<boolean>`false`.as('isFavorite'),
      sql<string[]>`array_remove(array_agg(distinct "asset_face"."personId"), null)::uuid[]`.as('linkedPersonIds'),
      (eb) => eb.fn.count('asset_face.assetId').distinct().$castTo<number>().as('assetCount'),
    ])
    .where('shared_space_person.isHidden', '=', false)
    .where('shared_space_person.spaceId', '=', anyUuid(options.timelineSpaceIds ?? []))
    .where('asset_face.assetId', 'in', filteredIds)
    .where('asset_face.deletedAt', 'is', null)
    .where('asset_face.isVisible', 'is', true)
    .$if(!!query, (qb) =>
      qb.where((eb) =>
        eb.or([
          eb(sql`lower("shared_space_person"."name")`, 'like', `${query}%`),
          eb(sql`lower("shared_space_person_alias"."name")`, 'like', `${query}%`),
        ]),
      ),
    )
    .groupBy([
      'shared_space_person.id',
      'shared_space_person.spaceId',
      'shared_space_person.name',
      'shared_space_person_alias.name',
    ]);

  return personal.unionAll(space);
}
```

- [ ] **Step 7: Add selected-source hydration query**

In `SearchRepository`, add:

```ts
private buildSelectedTimelinePeopleCandidates(
  filteredIds: SelectQueryBuilder<DB, 'asset', { id: string }>,
  options: FilterSuggestionsOptions,
) {
  const selectedPersonIds = options.selectedPersonIds ?? [];
  const selectedSpacePersonIds = options.selectedSpacePersonIds ?? [];

  const personal = this.db
    .selectFrom('person')
    .innerJoin('asset_face', 'asset_face.personId', 'person.id')
    .select([
      sql<'person'>`${sql.lit('person')}`.as('kind'),
      'person.id as personId',
      sql<string | null>`null`.as('spaceId'),
      sql<string | null>`null`.as('spacePersonId'),
      'person.name as name',
      sql<string | null>`null`.as('aliasName'),
      'person.isFavorite as isFavorite',
      sql<string[]>`array["person"."id"]::uuid[]`.as('linkedPersonIds'),
      (eb) => eb.fn.count('asset_face.assetId').distinct().$castTo<number>().as('assetCount'),
    ])
    .where('person.id', '=', anyUuid(selectedPersonIds.length > 0 ? selectedPersonIds : ['00000000-0000-0000-0000-000000000000']))
    .where('person.isHidden', '=', false)
    .where('asset_face.assetId', 'in', filteredIds)
    .where('asset_face.deletedAt', 'is', null)
    .where('asset_face.isVisible', 'is', true)
    .groupBy(['person.id', 'person.name', 'person.isFavorite']);

  const space = this.db
    .selectFrom('shared_space_person')
    .innerJoin('shared_space_person_face', 'shared_space_person_face.personId', 'shared_space_person.id')
    .innerJoin('asset_face', 'asset_face.id', 'shared_space_person_face.assetFaceId')
    .leftJoin('shared_space_person_alias', (join) =>
      join
        .onRef('shared_space_person_alias.personId', '=', 'shared_space_person.id')
        .on('shared_space_person_alias.userId', '=', asUuid(options.currentUserId!)),
    )
    .select([
      sql<'space-person'>`${sql.lit('space-person')}`.as('kind'),
      sql<string | null>`null`.as('personId'),
      'shared_space_person.spaceId as spaceId',
      'shared_space_person.id as spacePersonId',
      'shared_space_person.name as name',
      'shared_space_person_alias.name as aliasName',
      sql<boolean>`false`.as('isFavorite'),
      sql<string[]>`array_remove(array_agg(distinct "asset_face"."personId"), null)::uuid[]`.as('linkedPersonIds'),
      (eb) => eb.fn.count('asset_face.assetId').distinct().$castTo<number>().as('assetCount'),
    ])
    .where(
      'shared_space_person.id',
      '=',
      anyUuid(selectedSpacePersonIds.length > 0 ? selectedSpacePersonIds : ['00000000-0000-0000-0000-000000000000']),
    )
    .where('shared_space_person.isHidden', '=', false)
    .where('shared_space_person.spaceId', '=', anyUuid(options.timelineSpaceIds ?? []))
    .where('asset_face.assetId', 'in', filteredIds)
    .where('asset_face.deletedAt', 'is', null)
    .where('asset_face.isVisible', 'is', true)
    .groupBy([
      'shared_space_person.id',
      'shared_space_person.spaceId',
      'shared_space_person.name',
      'shared_space_person_alias.name',
    ]);

  return personal.unionAll(space);
}
```

- [ ] **Step 8: Use grouped candidates when `timelineSpaceIds` is set**

Replace the global branch in `getFilteredPeople`:

```ts
if (options.timelineSpaceIds?.length && options.currentUserId) {
  const [candidateRows, selectedRows] = await Promise.all([
    this.buildFilteredTimelinePeopleCandidates(filteredIds, options).execute(),
    this.buildSelectedTimelinePeopleCandidates(filteredIds, options).execute(),
  ]);
  const people = groupPersonFilterOptions([...candidateRows, ...selectedRows] as PersonFilterCandidate[], {
    limit: options.peopleLimit ?? DEFAULT_PEOPLE_LIMIT,
    selectedPersonIds: options.selectedPersonIds,
    selectedSpacePersonIds: options.selectedSpacePersonIds,
  });
  const hasUnnamedPeople = people.some((person) => person.name === 'Unnamed person');
  return { people, hasUnnamedPeople };
}
```

Keep the existing `spaceId` and global personal-only branches intact.

- [ ] **Step 9: Run targeted tests**

Run:

```bash
cd server
pnpm test -- --run src/services/search.service.spec.ts -t "passes current user and grouped people filters"
pnpm test -- --run src/repositories/search.repository.spec.ts -t "timeline people suggestions include shared-space person candidates"
pnpm test -- --run src/repositories/search.repository.spec.ts -t "peopleQuery narrows grouped people candidate lookup"
pnpm test -- --run src/repositories/search.repository.spec.ts -t "selected people hydration"
pnpm test -- --run src/utils/person-filter-options.spec.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add server/src/services/search.service.ts server/src/services/search.service.spec.ts server/src/repositories/search.repository.ts server/src/repositories/search.repository.spec.ts
git commit -m "feat(server): return grouped timeline people suggestions"
```

---

### Task 4: Cross-Source OR Search Filters

**Files:**

- Modify: `server/src/utils/database.ts`
- Modify: `server/src/repositories/search.repository.spec.ts`
- Modify: `server/src/repositories/asset.repository.ts`
- Modify: `server/src/dtos/gallery-map.dto.ts`
- Modify: `server/src/services/shared-space.service.ts`
- Modify: `server/src/services/shared-space.service.spec.ts`

- [ ] **Step 1: Write failing SQL tests for metadata search OR behavior**

Add this test in `server/src/repositories/search.repository.spec.ts` under `describe('searchAssetBuilder rating semantics')` or a new `describe('cross-source people filters')`:

```ts
it('searchAssetBuilder ORs personal and space person sources when personMatchAny is true', () => {
  const sql = buildAssetSearchSql({
    personIds: ['11111111-1111-4111-8111-111111111111'],
    spacePersonIds: ['22222222-2222-4222-8222-222222222222'],
    personMatchAny: true,
  });

  expect(sql).toMatch(/or/i);
  expect(sql).toContain('"asset_face"."personId"');
  expect(sql).toContain('"shared_space_person_face"."personId"');
  expect(countMatches(sql, /exists\s*\(select\b/gi)).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 2: Write failing service test for filtered map markers**

Add this test in `server/src/services/shared-space.service.spec.ts` near the filtered map marker tests:

```ts
it('passes grouped personal and space person IDs to global filtered map markers', async () => {
  mocks.sharedSpace.getSpaceIdsForTimeline.mockResolvedValue([{ spaceId: 'space-a' }]);
  mocks.sharedSpace.getFilteredMapMarkers.mockResolvedValue([]);

  await sut.getFilteredMapMarkers(authStub.user1, {
    withSharedSpaces: true,
    personIds: ['11111111-1111-4111-8111-111111111111'],
    spacePersonIds: ['22222222-2222-4222-8222-222222222222'],
    personMatchAny: true,
  });

  expect(mocks.sharedSpace.getFilteredMapMarkers).toHaveBeenCalledWith(
    expect.objectContaining({
      personIds: ['11111111-1111-4111-8111-111111111111'],
      spacePersonIds: ['22222222-2222-4222-8222-222222222222'],
      personMatchAny: true,
      timelineSpaceIds: ['space-a'],
    }),
  );
});
```

- [ ] **Step 3: Run failing tests**

Run:

```bash
cd server
pnpm test -- --run src/repositories/search.repository.spec.ts -t "ORs personal and space person sources"
pnpm test -- --run src/services/shared-space.service.spec.ts -t "passes grouped personal and space person IDs"
```

Expected: FAIL because `searchAssetBuilder` currently ANDs `personIds` and `spacePersonIds`, and map DTO/service does not pass global `spacePersonIds`.

- [ ] **Step 4: Add the reusable OR predicate**

In `server/src/utils/database.ts`, add:

```ts
export function hasAnyPersonSource<O>(
  qb: SelectQueryBuilder<DB, 'asset', O>,
  options: { personIds?: string[]; spacePersonIds?: string[] },
) {
  return qb.where((eb) => {
    const predicates = [];
    if (options.personIds?.length) {
      predicates.push(
        eb.exists(
          eb
            .selectFrom('asset_face')
            .whereRef('asset_face.assetId', '=', 'asset.id')
            .where('asset_face.deletedAt', 'is', null)
            .where('asset_face.isVisible', 'is', true)
            .where('asset_face.personId', '=', anyUuid(options.personIds)),
        ),
      );
    }
    if (options.spacePersonIds?.length) {
      predicates.push(
        eb.exists(
          eb
            .selectFrom('shared_space_person_face')
            .innerJoin('asset_face', 'asset_face.id', 'shared_space_person_face.assetFaceId')
            .whereRef('asset_face.assetId', '=', 'asset.id')
            .where('asset_face.deletedAt', 'is', null)
            .where('asset_face.isVisible', 'is', true)
            .where('shared_space_person_face.personId', '=', anyUuid(options.spacePersonIds)),
        ),
      );
    }
    return eb.or(predicates);
  });
}
```

Update `searchAssetBuilder` person filtering:

```ts
.$if(
  !!options.personMatchAny && (!!options.personIds?.length || !!options.spacePersonIds?.length),
  (qb) => hasAnyPersonSource(qb, { personIds: options.personIds, spacePersonIds: options.spacePersonIds }),
)
.$if(!options.personMatchAny && !!options.spacePersonIds?.length, (qb) => hasAnySpacePerson(qb, options.spacePersonIds!))
.$if(!options.personMatchAny && !!options.personIds?.length, (qb) =>
  options.personMatchAny ? hasAnyPerson(qb, options.personIds!) : hasPeople(qb, options.personIds!),
)
```

Simplify the last branch to:

```ts
.$if(!options.personMatchAny && !!options.personIds?.length, (qb) => hasPeople(qb, options.personIds!))
```

- [ ] **Step 5: Update time bucket queries**

In `server/src/repositories/asset.repository.ts`, import `hasAnyPersonSource` and replace both adjacent person filters:

```ts
.$if(
  !!options.personMatchAny && (!!options.personIds?.length || !!options.spacePersonIds?.length),
  (qb) => hasAnyPersonSource(qb, { personIds: options.personIds, spacePersonIds: options.spacePersonIds }),
)
.$if(!options.personMatchAny && !!options.personIds?.length, (qb) => hasAnyPerson(qb, options.personIds!))
.$if(!options.personMatchAny && !!options.spacePersonIds?.length, (qb) => hasAnySpacePerson(qb, options.spacePersonIds!))
```

Apply that replacement in both `getTimeBuckets` and `getTimeBucket`.

- [ ] **Step 6: Update filtered map marker passthrough**

In `server/src/services/shared-space.service.ts`, change:

```ts
spacePersonIds: dto.spaceId ? dto.personIds : undefined,
```

to:

```ts
spacePersonIds: dto.spaceId ? dto.personIds : dto.spacePersonIds,
```

Keep:

```ts
personMatchAny: true,
```

- [ ] **Step 7: Run targeted tests**

Run:

```bash
cd server
pnpm test -- --run src/repositories/search.repository.spec.ts -t "ORs personal and space person sources"
pnpm test -- --run src/services/shared-space.service.spec.ts -t "passes grouped personal and space person IDs"
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/src/utils/database.ts server/src/repositories/search.repository.spec.ts server/src/repositories/asset.repository.ts server/src/dtos/gallery-map.dto.ts server/src/services/shared-space.service.ts server/src/services/shared-space.service.spec.ts
git commit -m "feat(server): search grouped person sources with OR semantics"
```

---

### Task 5: Web Filter State and Expansion Helper

**Files:**

- Modify: `web/src/lib/components/filter-panel/filter-panel.ts`
- Modify: `web/src/lib/components/filter-panel/__tests__/filter-state.spec.ts`

- [ ] **Step 1: Write failing filter-state tests**

Add tests in `web/src/lib/components/filter-panel/__tests__/filter-state.spec.ts`:

```ts
import {
  buildFilterContext,
  clearFilters,
  createFilterState,
  expandPersonFilters,
  getActiveFilterCount,
} from '../filter-panel';
```

Add:

```ts
it('expands grouped selected people into personal and space person IDs', () => {
  const filters = createFilterState();
  filters.personIds = ['group:alice'];
  filters.personFilterSources = {
    'group:alice': [
      { type: 'person', personId: 'person-1' },
      { type: 'space-person', spaceId: 'space-1', spacePersonId: 'space-person-1' },
      { type: 'space-person', spaceId: 'space-2', spacePersonId: 'space-person-2' },
    ],
  };

  expect(expandPersonFilters(filters)).toEqual({
    personIds: ['person-1'],
    spacePersonIds: ['space-person-1', 'space-person-2'],
    personMatchAny: true,
  });
});

it('treats legacy person IDs as personal person IDs', () => {
  const filters = { ...createFilterState(), personIds: ['person-1'] };

  expect(expandPersonFilters(filters)).toEqual({
    personIds: ['person-1'],
    spacePersonIds: [],
    personMatchAny: true,
  });
});

it('clears grouped person source metadata when filters are cleared', () => {
  const filters = createFilterState();
  filters.personIds = ['group:alice'];
  filters.personFilterSources = {
    'group:alice': [{ type: 'person', personId: 'person-1' }],
  };

  const cleared = clearFilters(filters);

  expect(cleared.personIds).toEqual([]);
  expect(cleared.personFilterSources).toEqual({});
});

it('includes expanded selected sources in filter context', () => {
  const filters = createFilterState();
  filters.personIds = ['group:alice'];
  filters.personFilterSources = {
    'group:alice': [
      { type: 'person', personId: 'person-1' },
      { type: 'space-person', spaceId: 'space-1', spacePersonId: 'space-person-1' },
    ],
  };

  expect(buildFilterContext(filters)).toEqual({
    personIds: ['person-1'],
    spacePersonIds: ['space-person-1'],
    personMatchAny: true,
  });
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
cd web
pnpm exec vitest run src/lib/components/filter-panel/__tests__/filter-state.spec.ts
```

Expected: FAIL because `personFilterSources`, `expandPersonFilters`, `spacePersonIds`, and `personMatchAny` do not exist.

- [ ] **Step 3: Add web types and helper**

In `web/src/lib/components/filter-panel/filter-panel.ts`, extend `PersonOption`:

```ts
export type PersonFilterSource =
  | { type: 'person'; personId: string }
  | { type: 'space-person'; spaceId: string; spacePersonId: string };

export interface PersonOption {
  id: string;
  name: string;
  thumbnailUrl?: string;
  sources?: PersonFilterSource[];
}
```

Extend `FilterState`:

```ts
personFilterSources: Record<string, PersonFilterSource[]>;
```

Add default:

```ts
personFilterSources: {},
```

Extend `FilterContext`:

```ts
spacePersonIds?: string[];
personMatchAny?: boolean;
```

Add helper:

```ts
export function expandPersonFilters(state: Pick<FilterState, 'personIds' | 'personFilterSources'>): {
  personIds: string[];
  spacePersonIds: string[];
  personMatchAny: boolean;
} {
  const personIds = new Set<string>();
  const spacePersonIds = new Set<string>();

  for (const selectedId of state.personIds) {
    const sources = state.personFilterSources[selectedId];
    if (!sources) {
      personIds.add(selectedId);
      continue;
    }
    for (const source of sources) {
      if (source.type === 'person') {
        personIds.add(source.personId);
      } else {
        spacePersonIds.add(source.spacePersonId);
      }
    }
  }

  return {
    personIds: [...personIds],
    spacePersonIds: [...spacePersonIds],
    personMatchAny: personIds.size > 0 || spacePersonIds.size > 0,
  };
}
```

Update `buildFilterContext` person block:

```ts
if (includes('personIds') && state.personIds?.length > 0) {
  const expanded = expandPersonFilters(state);
  if (expanded.personIds.length > 0) {
    context.personIds = expanded.personIds;
  }
  if (expanded.spacePersonIds.length > 0) {
    context.spacePersonIds = expanded.spacePersonIds;
  }
  if (expanded.personMatchAny) {
    context.personMatchAny = true;
  }
}
```

Update `clearFilters`:

```ts
personFilterSources: {},
```

- [ ] **Step 4: Run targeted tests**

Run:

```bash
cd web
pnpm exec vitest run src/lib/components/filter-panel/__tests__/filter-state.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/components/filter-panel/filter-panel.ts web/src/lib/components/filter-panel/__tests__/filter-state.spec.ts
git commit -m "feat(web): track grouped people filter sources"
```

---

### Task 6: Photos and Map Option Expansion

**Files:**

- Modify: `web/src/lib/utils/photos-filter-options.ts`
- Modify: `web/src/lib/utils/__tests__/photos-filter-options.spec.ts`
- Modify: `web/src/lib/utils/map-filter-options.ts`
- Modify: `web/src/lib/utils/__tests__/map-filter-options.spec.ts`

- [ ] **Step 1: Write failing Photos option tests**

In `web/src/lib/utils/__tests__/photos-filter-options.spec.ts`, add:

```ts
it('expands grouped people into personal and space person timeline filters', () => {
  const filters = {
    ...createFilterState(),
    personIds: ['group:alice'],
    personFilterSources: {
      'group:alice': [
        { type: 'person' as const, personId: 'person-1' },
        { type: 'space-person' as const, spaceId: 'space-1', spacePersonId: 'space-person-1' },
      ],
    },
  };

  const options = buildPhotosTimelineOptions(filters);

  expect(options.personIds).toEqual(['person-1']);
  expect(options.spacePersonIds).toEqual(['space-person-1']);
  expect(options.personMatchAny).toBe(true);
});
```

Update the existing legacy test name to:

```ts
it('should use personIds for legacy people filter selections', () => {
```

- [ ] **Step 2: Write failing Map option tests**

In `web/src/lib/utils/__tests__/map-filter-options.spec.ts`, add:

```ts
it('expands grouped people for global map time bucket requests', () => {
  const filters = {
    ...createFilterState(),
    personIds: ['group:alice'],
    personFilterSources: {
      'group:alice': [
        { type: 'person' as const, personId: 'person-1' },
        { type: 'space-person' as const, spaceId: 'space-1', spacePersonId: 'space-person-1' },
      ],
    },
  };

  expect(buildMapTimeBucketOptions(filters)).toEqual(
    expect.objectContaining({
      personIds: ['person-1'],
      spacePersonIds: ['space-person-1'],
      personMatchAny: true,
    }),
  );
});

it('expands grouped people for global map cluster timelines', () => {
  const filters = {
    ...createFilterState(),
    personIds: ['group:alice'],
    personFilterSources: {
      'group:alice': [
        { type: 'person' as const, personId: 'person-1' },
        { type: 'space-person' as const, spaceId: 'space-1', spacePersonId: 'space-person-1' },
      ],
    },
  };
  const selectedClusterIds = new Set(['asset-1']);

  expect(buildMapTimelineOptions(filters, '1,2,3,4', selectedClusterIds)).toEqual(
    expect.objectContaining({
      personIds: ['person-1'],
      spacePersonIds: ['space-person-1'],
      personMatchAny: true,
    }),
  );
});
```

- [ ] **Step 3: Run failing tests**

Run:

```bash
cd web
pnpm exec vitest run src/lib/utils/__tests__/photos-filter-options.spec.ts src/lib/utils/__tests__/map-filter-options.spec.ts
```

Expected: FAIL because option builders still send selected UI IDs directly.

- [ ] **Step 4: Update Photos options**

In `web/src/lib/utils/photos-filter-options.ts`, import `expandPersonFilters`:

```ts
import { buildFilterContext, expandPersonFilters } from '$lib/components/filter-panel/filter-panel';
```

Replace the person block:

```ts
if (filters.personIds.length > 0) {
  const expanded = expandPersonFilters(filters);
  if (expanded.personIds.length > 0) {
    base.personIds = expanded.personIds;
  }
  if (expanded.spacePersonIds.length > 0) {
    base.spacePersonIds = expanded.spacePersonIds;
  }
  if (expanded.personMatchAny) {
    base.personMatchAny = true;
  }
}
```

- [ ] **Step 5: Update Map options**

In `web/src/lib/utils/map-filter-options.ts`, import `expandPersonFilters`:

```ts
import { buildFilterContext, expandPersonFilters, type FilterState } from '$lib/components/filter-panel/filter-panel';
```

In `applyCommonMapFilters`, replace the person block with:

```ts
if (includePersonIds && filters.personIds.length > 0) {
  const expanded = expandPersonFilters(filters);
  if (expanded.personIds.length > 0) {
    base.personIds = expanded.personIds;
  }
  if (expanded.spacePersonIds.length > 0) {
    base.spacePersonIds = expanded.spacePersonIds;
  }
  if (expanded.personMatchAny) {
    base.personMatchAny = true;
  }
}
```

In `buildMapTimelineOptions`, replace the global branch:

```ts
if (filters?.personIds && filters.personIds.length > 0) {
  if (spaceId) {
    base.spacePersonIds = filters.personIds;
  } else {
    const expanded = expandPersonFilters(filters);
    if (expanded.personIds.length > 0) {
      base.personIds = expanded.personIds;
    }
    if (expanded.spacePersonIds.length > 0) {
      base.spacePersonIds = expanded.spacePersonIds;
    }
    if (expanded.personMatchAny) {
      base.personMatchAny = true;
    }
  }
}
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
cd web
pnpm exec vitest run src/lib/utils/__tests__/photos-filter-options.spec.ts src/lib/utils/__tests__/map-filter-options.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/utils/photos-filter-options.ts web/src/lib/utils/__tests__/photos-filter-options.spec.ts web/src/lib/utils/map-filter-options.ts web/src/lib/utils/__tests__/map-filter-options.spec.ts
git commit -m "feat(web): expand grouped person filters for timelines"
```

---

### Task 7: Suggestion Mapping and Selected Source Hydration

**Files:**

- Modify: `web/src/lib/utils/map-filter-config.ts`
- Modify: `web/src/lib/utils/__tests__/map-filter-config.spec.ts`
- Modify: `web/src/routes/(user)/photos/[[assetId=id]]/+page.svelte`
- Modify: `web/src/routes/(user)/photos/[[assetId=id]]/photos-page.spec.ts`
- Modify: `web/src/lib/components/filter-panel/filter-panel.svelte`

- [ ] **Step 1: Write failing map suggestion mapping test**

In `web/src/lib/utils/__tests__/map-filter-config.spec.ts`, add:

```ts
it('maps grouped people suggestions with source metadata and thumbnail URL', async () => {
  vi.mocked(getFilterSuggestions).mockResolvedValueOnce({
    countries: [],
    cameraMakes: [],
    tags: [],
    people: [
      {
        id: 'group:alice',
        name: 'Alice',
        personIds: ['person-1'],
        spacePersonIds: ['space-person-1'],
        sources: [
          { type: 'person', personId: 'person-1' },
          { type: 'space-person', spaceId: 'space-1', spacePersonId: 'space-person-1' },
        ],
        thumbnail: { type: 'space-person', spaceId: 'space-1', spacePersonId: 'space-person-1' },
      },
    ],
    ratings: [],
    mediaTypes: [],
    hasUnnamedPeople: false,
  } as never);

  const config = buildMapFilterConfig();
  const result = await config.suggestionsProvider!(emptyFilters);

  expect(result.people[0]).toEqual(
    expect.objectContaining({
      id: 'group:alice',
      name: 'Alice',
      sources: [
        { type: 'person', personId: 'person-1' },
        { type: 'space-person', spaceId: 'space-1', spacePersonId: 'space-person-1' },
      ],
    }),
  );
  expect(result.people[0].thumbnailUrl).toContain('/shared-spaces/space-1/people/space-person-1/thumbnail');
});
```

- [ ] **Step 2: Write failing hydration request test**

In `web/src/lib/utils/__tests__/map-filter-config.spec.ts`, add:

```ts
it('sends expanded selected person sources for suggestion hydration', async () => {
  const config = buildMapFilterConfig();
  await config.suggestionsProvider!({
    ...emptyFilters,
    personIds: ['group:alice'],
    personFilterSources: {
      'group:alice': [
        { type: 'person', personId: 'person-1' },
        { type: 'space-person', spaceId: 'space-1', spacePersonId: 'space-person-1' },
      ],
    },
  });

  expect(getFilterSuggestions).toHaveBeenCalledWith(
    expect.objectContaining({
      selectedPersonIds: ['person-1'],
      selectedSpacePersonIds: ['space-person-1'],
    }),
  );
});
```

- [ ] **Step 3: Run failing tests**

Run:

```bash
cd web
pnpm exec vitest run src/lib/utils/__tests__/map-filter-config.spec.ts -t "grouped people|expanded selected"
```

Expected: FAIL because mapping assumes `/people/:id/thumbnail` and does not send selected source hydration fields.

- [ ] **Step 4: Add a mapping helper in `map-filter-config.ts`**

In `web/src/lib/utils/map-filter-config.ts`, add:

```ts
function getPersonThumbnailUrl(person: {
  id: string;
  thumbnail?: { type: 'person'; personId: string } | { type: 'space-person'; spaceId: string; spacePersonId: string };
}) {
  if (person.thumbnail?.type === 'space-person') {
    return createUrl(`/shared-spaces/${person.thumbnail.spaceId}/people/${person.thumbnail.spacePersonId}/thumbnail`);
  }
  return createUrl(`/people/${person.thumbnail?.personId ?? person.id}/thumbnail`);
}
```

Update person mapping:

```ts
people: response.people.map((p) => ({
  id: p.id,
  name: p.name,
  sources: p.sources,
  thumbnailUrl: getPersonThumbnailUrl(p),
})),
```

Before calling `getFilterSuggestions`, derive selected source IDs:

```ts
const expandedPeople = expandPersonFilters(filters);
```

Send:

```ts
selectedPersonIds: expandedPeople.personIds.length > 0 ? expandedPeople.personIds : undefined,
selectedSpacePersonIds: expandedPeople.spacePersonIds.length > 0 ? expandedPeople.spacePersonIds : undefined,
```

- [ ] **Step 5: Apply the same mapping to Photos page**

In `web/src/routes/(user)/photos/[[assetId=id]]/+page.svelte`, add the same local `getPersonThumbnailUrl` helper and map:

```ts
const mappedPeople = response.people.map((p) => ({
  id: p.id,
  name: p.name,
  sources: p.sources,
  thumbnailUrl: getPersonThumbnailUrl(p),
}));
```

Use `expandPersonFilters(filters)` before the `getFilterSuggestions` call and send `selectedPersonIds` / `selectedSpacePersonIds`.

Store names by option ID:

```ts
for (const p of response.people) {
  personNames.set(p.id, p.name);
}
```

- [ ] **Step 6: Preserve selected source metadata in FilterPanel**

In `web/src/lib/components/filter-panel/filter-panel.svelte`, update `handlePeopleChange`:

```ts
function handlePeopleChange(ids: string[]) {
  const nextSources: Record<string, PersonFilterSource[]> = {};
  for (const id of ids) {
    const option = people.find((person) => person.id === id);
    const sources = option?.sources ?? filters.personFilterSources[id];
    if (sources) {
      nextSources[id] = sources;
    }
  }
  filters = { ...filters, personIds: ids, personFilterSources: nextSources };
}
```

Add `PersonFilterSource` to the type import from `./filter-panel`.

- [ ] **Step 7: Run targeted tests**

Run:

```bash
cd web
pnpm exec vitest run src/lib/utils/__tests__/map-filter-config.spec.ts
pnpm exec vitest run src/routes/(user)/photos/[[assetId=id]]/photos-page.spec.ts
pnpm exec vitest run src/lib/components/filter-panel/__tests__/filter-panel.spec.ts
```

Expected: PASS after updating existing expectations that assumed every thumbnail is `/people/:id/thumbnail`.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/utils/map-filter-config.ts web/src/lib/utils/__tests__/map-filter-config.spec.ts "web/src/routes/(user)/photos/[[assetId=id]]/+page.svelte" "web/src/routes/(user)/photos/[[assetId=id]]/photos-page.spec.ts" web/src/lib/components/filter-panel/filter-panel.svelte
git commit -m "feat(web): map grouped people suggestions"
```

---

### Task 8: Server-Side People Search in the Filter Panel

**Files:**

- Modify: `web/src/lib/components/filter-panel/filter-panel.ts`
- Modify: `web/src/lib/components/filter-panel/filter-panel.svelte`
- Modify: `web/src/lib/components/filter-panel/people-filter.svelte`
- Modify: `web/src/lib/components/filter-panel/__tests__/filter-panel.spec.ts`
- Modify: `web/src/lib/components/filter-panel/__tests__/unified-suggestions.spec.ts`

- [ ] **Step 1: Write failing component test for people query search**

Add a test in `web/src/lib/components/filter-panel/__tests__/filter-panel.spec.ts`:

```ts
it('requests server-side people suggestions when the people search query changes', async () => {
  vi.useFakeTimers();
  const suggestionsProvider = vi.fn().mockResolvedValue({
    countries: [],
    cameraMakes: [],
    tags: [],
    people: [{ id: 'group:alice', name: 'Alice' }],
    ratings: [],
    mediaTypes: [],
    hasUnnamedPeople: false,
  });

  renderPanel(['people'], {
    ...createFilterState(),
  });

  await userEvent.type(screen.getByTestId('people-search-input'), 'ali');
  await vi.advanceTimersByTimeAsync(300);

  expect(suggestionsProvider).toHaveBeenCalledWith(expect.anything(), { peopleQuery: 'ali' });
  vi.useRealTimers();
});
```

Adjust the helper that renders `FilterPanel` in the test so it passes `suggestionsProvider` from the test into the config.

- [ ] **Step 2: Run the failing test**

Run:

```bash
cd web
pnpm exec vitest run src/lib/components/filter-panel/__tests__/filter-panel.spec.ts -t "server-side people suggestions"
```

Expected: FAIL because `suggestionsProvider` only accepts filters and PeopleFilter only performs local search.

- [ ] **Step 3: Extend suggestions provider type**

In `web/src/lib/components/filter-panel/filter-panel.ts`, add:

```ts
export type FilterSuggestionOptions = {
  peopleQuery?: string;
};
```

Change:

```ts
suggestionsProvider?: (filters: FilterState) => Promise<FilterSuggestionsResponse>;
```

to:

```ts
suggestionsProvider?: (filters: FilterState, options?: FilterSuggestionOptions) => Promise<FilterSuggestionsResponse>;
```

- [ ] **Step 4: Add query callback to PeopleFilter**

In `web/src/lib/components/filter-panel/people-filter.svelte`, extend props:

```ts
onSearchQueryChange?: (query: string) => void;
```

Destructure it:

```ts
let { people, selectedIds, onSelectionChange, onSearchQueryChange, emptyText = 'No people found' }: Props = $props();
```

Call it from the input handler:

```svelte
oninput={() => {
  showAll = false;
  onSearchQueryChange?.(searchQuery.trim());
}}
```

- [ ] **Step 5: Debounce people suggestion refetch in FilterPanel**

In `web/src/lib/components/filter-panel/filter-panel.svelte`, add state:

```ts
let peopleQuery = $state('');
```

Add handler:

```ts
function handlePeopleSearchQueryChange(query: string) {
  peopleQuery = query;
}
```

Pass to component:

```svelte
<PeopleFilter
  {people}
  selectedIds={filters.personIds}
  onSelectionChange={handlePeopleChange}
  onSearchQueryChange={handlePeopleSearchQueryChange}
  emptyText={hasUnnamedPeople ? 'Name people to use this filter' : undefined}
/>
```

Add a debounced effect:

```ts
$effect(() => {
  if (!config.suggestionsProvider || !config.sections.includes('people')) {
    return;
  }
  const query = peopleQuery.trim();
  const timeout = setTimeout(() => {
    void config.suggestionsProvider?.(filters, query ? { peopleQuery: query } : undefined).then((result) => {
      people = result.people;
      hasUnnamedPeople = result.hasUnnamedPeople;
    });
  }, 250);

  return () => clearTimeout(timeout);
});
```

- [ ] **Step 6: Ensure route/config providers forward `peopleQuery`**

Update `buildMapFilterConfig` and Photos page suggestion provider signatures to accept options:

```ts
suggestionsProvider: async (filters: FilterState, options) => {
```

Send:

```ts
peopleQuery: options?.peopleQuery,
```

- [ ] **Step 7: Run targeted tests**

Run:

```bash
cd web
pnpm exec vitest run src/lib/components/filter-panel/__tests__/filter-panel.spec.ts -t "server-side people suggestions"
pnpm exec vitest run src/lib/components/filter-panel/__tests__/unified-suggestions.spec.ts
pnpm exec vitest run src/lib/utils/__tests__/map-filter-config.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/components/filter-panel/filter-panel.ts web/src/lib/components/filter-panel/filter-panel.svelte web/src/lib/components/filter-panel/people-filter.svelte web/src/lib/components/filter-panel/__tests__/filter-panel.spec.ts web/src/lib/components/filter-panel/__tests__/unified-suggestions.spec.ts web/src/lib/utils/map-filter-config.ts "web/src/routes/(user)/photos/[[assetId=id]]/+page.svelte"
git commit -m "feat(web): search people filters on the server"
```

---

### Task 9: OpenAPI and SDK Sync

**Files:**

- Modify: `open-api/immich-openapi-specs.json`
- Modify: `open-api/typescript-sdk/src/fetch-client.ts`
- Modify: generated SDK declaration/build files produced by the repo scripts

- [ ] **Step 1: Build server and sync OpenAPI**

Run:

```bash
pnpm --filter immich run build
pnpm --filter immich run sync:open-api
```

Expected: generated OpenAPI and SDK files include:

- `FilterSuggestionPersonSourceDto`
- `FilterSuggestionPersonThumbnailDto`
- `FilterSuggestionsPersonDto.sources`
- `FilterSuggestionsPersonDto.personIds`
- `FilterSuggestionsPersonDto.spacePersonIds`
- `FilterSuggestionsRequestDto.peopleQuery`
- `FilterSuggestionsRequestDto.peopleLimit`
- `FilterSuggestionsRequestDto.selectedPersonIds`
- `FilterSuggestionsRequestDto.selectedSpacePersonIds`
- `MetadataSearchDto.personMatchAny`

- [ ] **Step 2: Build SDK package**

Run:

```bash
pnpm --filter @immich/sdk run build
```

Expected: PASS.

- [ ] **Step 3: Commit generated API files**

```bash
git add open-api
git commit -m "chore: sync grouped people filter API"
```

---

### Task 10: Full Verification

**Files:**

- No planned file edits.

- [ ] **Step 1: Run server targeted tests**

Run:

```bash
cd server
pnpm test -- --run src/utils/person-filter-options.spec.ts src/controllers/search.controller.spec.ts src/services/search.service.spec.ts src/repositories/search.repository.spec.ts src/services/shared-space.service.spec.ts src/dtos/time-bucket.dto.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run web targeted tests**

Run:

```bash
cd web
pnpm exec vitest run src/lib/components/filter-panel/__tests__/filter-state.spec.ts src/lib/components/filter-panel/__tests__/filter-panel.spec.ts src/lib/components/filter-panel/__tests__/unified-suggestions.spec.ts src/lib/utils/__tests__/photos-filter-options.spec.ts src/lib/utils/__tests__/map-filter-options.spec.ts src/lib/utils/__tests__/map-filter-config.spec.ts src/routes/(user)/photos/[[assetId=id]]/photos-page.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run type checks**

Run:

```bash
cd server
pnpm run check
cd ../web
pnpm run check:typescript
pnpm run check:svelte
```

Expected: PASS.

- [ ] **Step 4: Run formatting checks for changed packages**

Run:

```bash
cd server
pnpm run format
cd ../web
pnpm run format
cd ../docs
pnpm --filter documentation exec prettier --check docs/explorations/space-people-filter-interim-design.md
```

Expected: PASS.

- [ ] **Step 5: Inspect git state**

Run:

```bash
git status --short
git log --oneline -8
```

Expected: only intentional commits from this plan are present and the worktree is clean.

---

## Plan Self-Review

Spec coverage:

- Space people in personal timeline filters: Tasks 3, 7, and 8.
- Explicit dedupe only: Task 2 and Task 3.
- Select all linked sources: Tasks 5, 6, and 7.
- 20,000+ people performance: Tasks 1, 3, and 8.
- Privacy boundaries: Task 3 query scope, Task 2 display-source rules, and Task 10 targeted tests.
- Photos and Map coverage: Tasks 6 and 7.
- Smart search out of scope: Task 4 and Task 10 keep smart-search behavior separate.
- TDD discipline: every implementation task starts with failing tests and targeted red/green commands.

Type consistency:

- Server query fields: `peopleQuery`, `peopleLimit`, `selectedPersonIds`, `selectedSpacePersonIds`.
- Search fields: `personIds`, `spacePersonIds`, `personMatchAny`.
- Web state: `personIds` remains selected option IDs; `personFilterSources` maps option IDs to source refs.
- Response fields: `id`, `name`, `personIds`, `spacePersonIds`, `sources`, `thumbnail`.
