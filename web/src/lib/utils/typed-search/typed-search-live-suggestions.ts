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

export function isLiveTypedSearchToken(token: TypedSearchTokenSpan | undefined): token is LiveTypedSearchToken {
  return token?.key === 'person' || token?.key === 'tag' || token?.key === 'country' || token?.key === 'city';
}

export async function resolveLiveTypedSearchSuggestions(
  _context: LiveTypedSearchContext,
): Promise<LiveTypedSearchStatus> {
  return { status: 'idle' };
}
