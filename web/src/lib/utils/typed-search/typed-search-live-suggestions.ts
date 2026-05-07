import { getAllPeople, getFilterSuggestions, searchPerson } from '@immich/sdk';
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

export function isLiveTypedSearchToken(token: TypedSearchTokenSpan | undefined): token is LiveTypedSearchToken {
  return token?.key === 'person' || token?.key === 'tag' || token?.key === 'country' || token?.key === 'city';
}

function isLiveKey(key: string | undefined): key is LiveTypedSearchKey {
  return key === 'person' || key === 'tag' || key === 'country' || key === 'city';
}

function makeChoiceId(token: TypedSearchTokenSpan, entityId: string, key: LiveTypedSearchKey) {
  return `${key}:${token.start}:${token.end}:${entityId}`;
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
