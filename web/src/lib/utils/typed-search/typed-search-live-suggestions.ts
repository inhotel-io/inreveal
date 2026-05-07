import {
  getAllPeople,
  getFilterSuggestions,
  getSearchSuggestions,
  searchPerson,
  SearchSuggestionType,
} from '@immich/sdk';
import type { TypedSearchParseResult, TypedSearchTokenSpan } from './typed-search-parser';

export type LiveTypedSearchKey = 'person' | 'tag' | 'country' | 'city';

export type LiveTypedSearchToken = TypedSearchTokenSpan & { key: LiveTypedSearchKey };

export type LiveTypedSearchChoice = {
  id: string;
  key: LiveTypedSearchKey;
  label: string;
  value: string;
  tokenStart: number;
  tokenEnd: number;
  entityId?: string;
  secondaryLabel?: string;
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

type TagSuggestion = { id: string; name?: string | null; value?: string | null };

export function isLiveTypedSearchToken(token: TypedSearchTokenSpan | undefined): token is LiveTypedSearchToken {
  return token?.key === 'person' || token?.key === 'tag' || token?.key === 'country' || token?.key === 'city';
}

function isLiveKey(key: string | undefined): key is LiveTypedSearchKey {
  return key === 'person' || key === 'tag' || key === 'country' || key === 'city';
}

function makeChoiceId(token: TypedSearchTokenSpan, entityId: string, key: LiveTypedSearchKey) {
  return `${key}:${token.start}:${token.end}:${entityId}`;
}

function liveSuggestionScope(context: LiveTypedSearchContext) {
  return context.spaceId ? { spaceId: context.spaceId } : { withSharedSpaces: true };
}

function personChoice(
  token: TypedSearchTokenSpan,
  person: { id: string; name?: string | null },
): LiveTypedSearchChoice {
  const label = person.name || person.id;

  return {
    id: makeChoiceId(token, person.id, 'person'),
    key: 'person',
    label,
    value: label,
    tokenStart: token.start,
    tokenEnd: token.end,
    entityId: person.id,
  };
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

async function resolvePersonLiveSuggestions(
  context: LiveTypedSearchContext,
  token: TypedSearchTokenSpan,
): Promise<LiveTypedSearchStatus> {
  try {
    const value = token.value.trim();
    const people = await (async () => {
      if (context.spaceId) {
        const response = await getFilterSuggestions({ spaceId: context.spaceId }, { signal: context.signal });
        return response.people;
      }

      if (value) {
        return searchPerson({ name: value, withHidden: false, withSharedSpaces: true }, { signal: context.signal });
      }

      const response = await getAllPeople({ size: 10, withSharedSpaces: true }, { signal: context.signal });
      return response.people;
    })();
    const normalizedValue = value.toLowerCase();
    const matches = people
      .filter((person) => !normalizedValue || (person.name || person.id).toLowerCase().includes(normalizedValue))
      .slice(0, LIVE_RESULT_LIMIT)
      .map((person) => personChoice(token, person));

    return matches.length === 0
      ? { status: 'empty', key: 'person' }
      : { status: 'ok', key: 'person', items: matches, total: matches.length };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }

    return {
      status: 'error',
      key: 'person',
      message: error instanceof Error ? error.message : 'Unable to load people',
    };
  }
}

async function resolveTagLiveSuggestions(
  context: LiveTypedSearchContext,
  token: TypedSearchTokenSpan,
): Promise<LiveTypedSearchStatus> {
  try {
    const value = token.value.trim().toLowerCase();
    const response = await getFilterSuggestions(liveSuggestionScope(context), { signal: context.signal });
    const matches = response.tags
      .filter((tag) => !value || tagLabel(tag).toLowerCase().includes(value))
      .slice(0, LIVE_RESULT_LIMIT)
      .map((tag) => tagChoice(token, tag));

    return matches.length === 0
      ? { status: 'empty', key: 'tag' }
      : { status: 'ok', key: 'tag', items: matches, total: matches.length };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }

    return {
      status: 'error',
      key: 'tag',
      message: error instanceof Error ? error.message : 'Unable to load tags',
    };
  }
}

async function resolveCountryLiveSuggestions(
  context: LiveTypedSearchContext,
  token: TypedSearchTokenSpan,
): Promise<LiveTypedSearchStatus> {
  try {
    const value = token.value.trim().toLowerCase();
    const response = await getFilterSuggestions(liveSuggestionScope(context), { signal: context.signal });
    const matches = response.countries
      .filter((country): country is string => typeof country === 'string')
      .filter((country) => !value || country.toLowerCase().includes(value))
      .slice(0, LIVE_RESULT_LIMIT)
      .map((country) => stringChoice(token, 'country', country));

    return matches.length === 0
      ? { status: 'empty', key: 'country' }
      : { status: 'ok', key: 'country', items: matches, total: matches.length };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }

    return {
      status: 'error',
      key: 'country',
      message: error instanceof Error ? error.message : 'Unable to load countries',
    };
  }
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

async function resolveCityLiveSuggestions(
  context: LiveTypedSearchContext,
  token: TypedSearchTokenSpan,
): Promise<LiveTypedSearchStatus> {
  const value = token.value.trim();
  if (!value) {
    return { status: 'idle' };
  }

  try {
    const country = await getCanonicalCountryForCity(context);
    const cities = await getSearchSuggestions(
      {
        $type: SearchSuggestionType.City,
        ...(country ? { country } : {}),
        ...liveSuggestionScope(context),
      },
      { signal: context.signal },
    );
    const normalizedValue = value.toLowerCase();
    const matches = cities
      .filter((city): city is string => typeof city === 'string')
      .filter((city) => city.toLowerCase().includes(normalizedValue))
      .slice(0, LIVE_RESULT_LIMIT)
      .map((city) => stringChoice(token, 'city', city, country));

    return matches.length === 0
      ? { status: 'empty', key: 'city' }
      : { status: 'ok', key: 'city', items: matches, total: matches.length };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }

    return {
      status: 'error',
      key: 'city',
      message: error instanceof Error ? error.message : 'Unable to load cities',
    };
  }
}
