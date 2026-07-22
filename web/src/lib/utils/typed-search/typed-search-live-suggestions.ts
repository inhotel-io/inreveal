import { getFilterSuggestions, getSearchSuggestions, searchPerson, SearchSuggestionType } from '@immich/sdk';
import type { TypedSearchParseResult, TypedSearchTokenSpan } from './typed-search-parser';

export type LiveTypedSearchKey = 'person' | 'tag' | 'country' | 'city';

export type LiveTypedSearchToken = TypedSearchTokenSpan & { key: LiveTypedSearchKey };

export type ScopedPersonProfile = { type?: string; id?: string; spaceId?: string };

export type LiveTypedSearchPersonPreview = {
  id: string;
  filterId?: string | null;
  name?: string | null;
  primaryProfile?: ScopedPersonProfile;
  updatedAt?: string;
  numberOfAssets?: number;
};

export type LiveTypedSearchTagPreview = { id: string; name?: string | null; value?: string | null };

export type LiveTypedSearchPreview =
  | { kind: 'person'; data: LiveTypedSearchPersonPreview }
  | { kind: 'tag'; data: LiveTypedSearchTagPreview };

export type LiveTypedSearchChoice = {
  id: string;
  key: LiveTypedSearchKey;
  label: string;
  value: string;
  tokenStart: number;
  tokenEnd: number;
  entityId?: string;
  secondaryLabel?: string;
  preview?: LiveTypedSearchPreview;
};

export type LiveTypedSearchStatus =
  | { status: 'idle' }
  | { status: 'loading'; key: LiveTypedSearchKey }
  | { status: 'ok'; key: LiveTypedSearchKey; items: LiveTypedSearchChoice[]; total: number }
  | { status: 'empty'; key: LiveTypedSearchKey }
  | { status: 'timeout'; key: LiveTypedSearchKey }
  | { status: 'error'; key: LiveTypedSearchKey; message: string };

export type LiveTypedSearchContext = {
  parsed: TypedSearchParseResult;
  activeToken?: TypedSearchTokenSpan;
  spaceId?: string;
  signal?: AbortSignal;
};

const LIVE_RESULT_LIMIT = 5;

type TagSuggestion = LiveTypedSearchTagPreview;

export function isLiveTypedSearchToken(token: TypedSearchTokenSpan | undefined): token is LiveTypedSearchToken {
  return token?.key === 'person' || token?.key === 'tag' || token?.key === 'country' || token?.key === 'city';
}

function isLiveKey(key: string | undefined): key is LiveTypedSearchKey {
  return key === 'person' || key === 'tag' || key === 'country' || key === 'city';
}

function makeChoiceId(token: TypedSearchTokenSpan, entityId: string, key: LiveTypedSearchKey) {
  return `${key}:${token.start}:${token.end}:${entityId}`;
}

export function liveTypedSearchChoiceValue(choice: LiveTypedSearchChoice) {
  return `filter:${choice.id}:${choice.label}`;
}

function liveSuggestionScope(context: LiveTypedSearchContext) {
  return context.spaceId ? { spaceId: context.spaceId } : { withSharedSpaces: true };
}

function personChoice(
  token: TypedSearchTokenSpan,
  person: LiveTypedSearchPersonPreview,
  scope: 'global' | 'space',
): LiveTypedSearchChoice {
  const label = getPersonLabel(person);
  const entityId = scope === 'global' ? getGlobalPersonFilterId(person) : person.id;

  return {
    id: makeChoiceId(token, entityId, 'person'),
    key: 'person',
    label,
    value: label,
    tokenStart: token.start,
    tokenEnd: token.end,
    entityId,
    preview: { kind: 'person', data: { ...person, filterId: entityId } },
  };
}

function getPersonLabel(person: { name?: string | null }) {
  return person.name?.trim() ?? '';
}

function getGlobalPersonFilterId(person: {
  id: string;
  filterId?: string | null;
  primaryProfile?: ScopedPersonProfile;
}) {
  if (person.filterId) {
    return person.filterId;
  }

  if (person.primaryProfile?.type === 'space-person' && person.primaryProfile.id) {
    return `space-person:${person.primaryProfile.id}`;
  }

  if (person.primaryProfile?.type === 'user-person' && person.primaryProfile.id) {
    return `person:${person.primaryProfile.id}`;
  }

  return person.id;
}

function tagLabel(tag: TagSuggestion) {
  return tag.value || tag.name || tag.id;
}

function tagChoice(token: TypedSearchTokenSpan, tag: TagSuggestion): LiveTypedSearchChoice {
  const label = tagLabel(tag);

  return {
    id: makeChoiceId(token, tag.id, 'tag'),
    key: 'tag',
    label,
    value: label,
    tokenStart: token.start,
    tokenEnd: token.end,
    entityId: tag.id,
    preview: { kind: 'tag', data: { ...tag, name: label } },
  };
}

function stringChoice(
  token: TypedSearchTokenSpan,
  key: 'country' | 'city',
  value: string,
  secondaryLabel?: string,
): LiveTypedSearchChoice {
  return {
    id: makeChoiceId(token, value, key),
    key,
    label: value,
    value,
    tokenStart: token.start,
    tokenEnd: token.end,
    secondaryLabel,
  };
}

export async function resolveLiveTypedSearchSuggestions(
  context: LiveTypedSearchContext,
): Promise<LiveTypedSearchStatus> {
  const token = context.activeToken;
  if (!token || !isLiveKey(token.key)) {
    return { status: 'idle' };
  }

  if (token.key === 'person') {
    return resolvePersonLiveSuggestions(context, token);
  }

  if (token.key === 'tag') {
    return resolveTagLiveSuggestions(context, token);
  }

  if (token.key === 'country') {
    return resolveCountryLiveSuggestions(context, token);
  }

  if (token.key === 'city') {
    return resolveCityLiveSuggestions(context, token);
  }

  return { status: 'idle' };
}

/**
 * Shared shape of every live-suggestion resolver: fetch candidates, keep the ones whose label
 * contains the typed value, cap the list, map to choices. `getLabel` returning `undefined` drops the
 * candidate outright (unnamed people, non-string API entries). AbortErrors propagate — a superseded
 * request must not settle the status — everything else becomes an `error` status.
 */
async function runLiveSuggestion<TCandidate>(options: {
  key: LiveTypedSearchKey;
  value: string;
  errorMessage: string;
  fetchCandidates: () => Promise<TCandidate[]>;
  getLabel: (candidate: TCandidate) => string | undefined;
  toChoice: (candidate: TCandidate) => LiveTypedSearchChoice;
}): Promise<LiveTypedSearchStatus> {
  const { key, value, errorMessage, fetchCandidates, getLabel, toChoice } = options;

  try {
    const candidates = await fetchCandidates();
    const normalizedValue = value.trim().toLowerCase();
    const items = candidates
      .filter((candidate) => {
        const label = getLabel(candidate);
        return label !== undefined && (!normalizedValue || label.toLowerCase().includes(normalizedValue));
      })
      .slice(0, LIVE_RESULT_LIMIT)
      .map((candidate) => toChoice(candidate));

    return items.length === 0 ? { status: 'empty', key } : { status: 'ok', key, items, total: items.length };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }

    return { status: 'error', key, message: error instanceof Error ? error.message : errorMessage };
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function resolvePersonLiveSuggestions(
  context: LiveTypedSearchContext,
  token: TypedSearchTokenSpan,
): Promise<LiveTypedSearchStatus> {
  const value = token.value.trim();
  const scope = context.spaceId ? 'space' : 'global';

  return runLiveSuggestion<LiveTypedSearchPersonPreview>({
    key: 'person',
    value,
    errorMessage: 'Unable to load people',
    fetchCandidates: async () => {
      if (context.spaceId) {
        const response = await getFilterSuggestions({ spaceId: context.spaceId }, { signal: context.signal });
        return response.people;
      }

      if (value) {
        return searchPerson({ name: value, withHidden: false, withSharedSpaces: true }, { signal: context.signal });
      }

      const response = await getFilterSuggestions({ withSharedSpaces: true }, { signal: context.signal });
      return response.people;
    },
    getLabel: (person) => getPersonLabel(person) || undefined,
    toChoice: (person) => personChoice(token, person, scope),
  });
}

function resolveTagLiveSuggestions(
  context: LiveTypedSearchContext,
  token: TypedSearchTokenSpan,
): Promise<LiveTypedSearchStatus> {
  return runLiveSuggestion<TagSuggestion>({
    key: 'tag',
    value: token.value,
    errorMessage: 'Unable to load tags',
    fetchCandidates: async () => {
      const response = await getFilterSuggestions(liveSuggestionScope(context), { signal: context.signal });
      return response.tags;
    },
    getLabel: (tag) => tagLabel(tag),
    toChoice: (tag) => tagChoice(token, tag),
  });
}

function resolveCountryLiveSuggestions(
  context: LiveTypedSearchContext,
  token: TypedSearchTokenSpan,
): Promise<LiveTypedSearchStatus> {
  return runLiveSuggestion<string>({
    key: 'country',
    value: token.value,
    errorMessage: 'Unable to load countries',
    fetchCandidates: async () => {
      const response = await getFilterSuggestions(liveSuggestionScope(context), { signal: context.signal });
      return response.countries;
    },
    getLabel: asString,
    toChoice: (country) => stringChoice(token, 'country', country),
  });
}

function canonicalExactMatch(candidates: string[], value: string) {
  return candidates.find((candidate) => candidate.toLowerCase() === value.toLowerCase()) ?? value;
}

async function getCanonicalCountryForCity(context: LiveTypedSearchContext) {
  const countryToken = context.parsed.scalarTokens.find((token) => token.key === 'country');
  if (!countryToken) {
    return undefined;
  }

  const value = String(countryToken.normalizedValue);
  const response = await getFilterSuggestions(liveSuggestionScope(context), { signal: context.signal });
  return canonicalExactMatch(
    response.countries.filter((country): country is string => typeof country === 'string'),
    value,
  );
}

function resolveCityLiveSuggestions(
  context: LiveTypedSearchContext,
  token: TypedSearchTokenSpan,
): Promise<LiveTypedSearchStatus> {
  // The canonical country is resolved inside the fetch so its failures land on the same error path,
  // and captured for the choice's secondary label.
  let country: string | undefined;

  return runLiveSuggestion<string>({
    key: 'city',
    value: token.value,
    errorMessage: 'Unable to load cities',
    fetchCandidates: async () => {
      country = await getCanonicalCountryForCity(context);
      return getSearchSuggestions(
        {
          $type: SearchSuggestionType.City,
          ...(country ? { country } : {}),
          ...liveSuggestionScope(context),
        },
        { signal: context.signal },
      );
    },
    getLabel: asString,
    toChoice: (city) => stringChoice(token, 'city', city, country),
  });
}
