import { failed, handoffOpen, needsInput } from '../protocol.mjs';
import { gatePlanResult, safeFailureText } from './plan-gate.mjs';

const KIND = 'add_photos_to_album';

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeAlbumRef = (value) =>
  clean(value)
    .replace(/^(?:the|my|this|that)\s+/i, '')
    .replace(/\s+album$/i, '')
    .trim();

// Subjective/visual source terms Gallery cannot resolve from metadata alone.
// A subjective source must hand off to open orchestration rather than fabricate
// a metadata search — Gallery never guesses "the good ones".
const SUBJECTIVE_PATTERN = /\b(?:best|good|nice|great|favou?rite|favou?rites|highlights?|blurry|bad|cute|pretty|beautiful|nicest|prettiest)\b/i;

// Regex fast-path: "add <source> to <album>". The trailing album reference is
// captured non-greedily up to the final "to <album>"; the LLM classifier covers
// paraphrases via the manifest entry.
const ADD_PATTERN = /\badd\s+(?<source>.+?)\s+to\s+(?<albumRef>[^.?!]+?)(?:\s+album)?[.?!]*$/i;

// Conservative fast-path guard: a "recent trip" source is owned by the dedicated
// create_recent_trip_album workflow, and a subjective source must hand off. The
// fast-path declines both so they flow to the LLM classifier / open orchestration
// rather than being coerced into a metadata add here.
const tripSourcePattern = /\brecent\s+trip\b/i;
const declinesAddFastPath = (source) => tripSourcePattern.test(source) || SUBJECTIVE_PATTERN.test(source);

// A recency source ("newest/latest/last/most recent N") is the one metadata
// source this strict path can resolve deterministically: newest-first, capped to
// N, via a plain metadata search (no filters, no free-text query). It requires
// an explicit count so we never guess how many. Date / location / semantic
// sources need filters this workflow cannot extract from free text and hand off
// to open orchestration instead.
const RECENCY_PATTERN = /\b(?:newest|latest|last|most\s+recent|recent)\b/i;
const COUNT_PATTERN = /\b(\d{1,4})\b/;
const MAX_RECENCY_LIMIT = 1000;
const parseRecencyLimit = (source) => {
  if (!RECENCY_PATTERN.test(source)) {
    return undefined;
  }
  const match = COUNT_PATTERN.exec(source);
  if (!match) {
    return undefined;
  }
  const count = Number(match[1]);
  return Number.isInteger(count) && count >= 1 ? Math.min(count, MAX_RECENCY_LIMIT) : undefined;
};

const resolveAlbum = async ({ client, albumRef, signal }) => {
  const ref = normalizeAlbumRef(albumRef);
  const result = await client.call('listAlbums', {}, { signal });
  const albums = Array.isArray(result?.albums) ? result.albums : [];
  const matches = albums.filter((album) => clean(album?.albumName).toLowerCase() === ref.toLowerCase());
  return { ref, matches };
};

export const addPhotosToAlbumWorkflow = () => ({
  kind: KIND,
  flow: 'hybrid',

  match(prompt) {
    const text = clean(prompt);
    const match = ADD_PATTERN.exec(text);
    if (!match?.groups) {
      return undefined;
    }
    const albumRef = normalizeAlbumRef(match.groups.albumRef);
    const sourceDescription = clean(match.groups.source);
    if (!albumRef || !sourceDescription || declinesAddFastPath(sourceDescription)) {
      return undefined;
    }
    return { slots: { albumRef, sourceDescription } };
  },

  parseSlots(rawSlots) {
    const albumRef = normalizeAlbumRef(rawSlots?.albumRef);
    const sourceDescription = clean(rawSlots?.sourceDescription);
    if (!albumRef || !sourceDescription) {
      return null;
    }
    return { albumRef, sourceDescription };
  },

  async run({ client, slots, signal }) {
    const sourceDescription = clean(slots?.sourceDescription);

    // 1. Resolve the target album (none/ambiguous → ask).
    const { ref, matches } = await resolveAlbum({ client, albumRef: slots.albumRef, signal });
    if (matches.length === 0) {
      return needsInput({ text: `I could not find an album called "${ref}". Which album do you mean?` });
    }
    if (matches.length > 1) {
      return needsInput({ text: `Multiple albums are called "${ref}". Which one do you mean?` });
    }
    const album = matches[0];

    // 2. Subjective sources hand off to open orchestration — never plan a guess.
    if (SUBJECTIVE_PATTERN.test(sourceDescription)) {
      return handoffOpen({
        reason: `Source "${sourceDescription}" is subjective and cannot be resolved from metadata alone.`,
      });
    }

    // 3. Only a recency source is deterministically resolvable here. Date,
    //    location, and semantic sources need filters this strict path cannot
    //    extract from free text, so they hand off to open orchestration (the LLM
    //    composes the searchAssets call) rather than fail or fabricate a search.
    const recencyLimit = parseRecencyLimit(sourceDescription);
    if (recencyLimit === undefined) {
      return handoffOpen({
        reason: `Source "${sourceDescription}" needs filters this workflow cannot resolve from metadata alone.`,
      });
    }

    // 4. Resolve the recency source into a selection handle via a bounded
    //    metadata search (newest-first, capped to N). No free-text query: the
    //    metadata search mode does not accept one, and there are no named
    //    entities to resolve, so resolveAssetSearchFilters is not used.
    let handleResult;
    try {
      handleResult = await client.call(
        'searchAssets',
        { mode: 'metadata', order: 'desc', limit: recencyLimit, detail: 'handle' },
        { signal },
      );
    } catch (error) {
      return failed({ text: safeFailureText(error?.message ?? 'The search tool failed.') });
    }

    const selectionHandle = handleResult?.selectionHandle;
    const selectionHandleId = clean(selectionHandle?.id);
    const assetCount = typeof selectionHandle?.assetCount === 'number' ? selectionHandle.assetCount : undefined;

    if (!selectionHandleId || assetCount === 0) {
      return needsInput({
        text: `I could not find any photos matching "${sourceDescription}". Can you describe them differently?`,
      });
    }

    // 5. Propose a duplicate-safe add via the selection handle (server owns the
    // duplicate-safe semantics). No raw asset ids ever reach the model.
    let planResult;
    try {
      planResult = await client.call(
        'proposeAlbumOperations',
        {
          summary: `Add matching photos to "${clean(album.albumName) || ref}".`,
          operations: [
            {
              type: 'album.addAssets',
              summary: 'Add matching photos.',
              targetKind: 'existing_album',
              targetId: album.id,
              assetSource: { kind: 'selectionHandle', selectionHandleId },
            },
          ],
        },
        { signal },
      );
    } catch (error) {
      return failed({ text: safeFailureText(error?.message ?? 'The planning tool failed.') });
    }

    const albumName = clean(album.albumName) || ref;
    return gatePlanResult({
      planResult,
      successText: `I prepared a plan to add ${assetCount} matching ${assetCount === 1 ? 'photo' : 'photos'} to the "${albumName}" album. Review the plan before applying it.`,
      successSummary: { workflowKind: KIND, albumName, assetCount },
    });
  },
});
