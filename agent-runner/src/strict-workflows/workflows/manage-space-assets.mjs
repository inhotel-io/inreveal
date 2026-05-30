import { SUBJECTIVE_PATTERN } from '../asset-source-resolver.mjs';
import { handoffOpen } from '../protocol.mjs';

const KIND = 'manage_space_assets';

const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const cleanSource = (value) => clean(value).replace(/[.?!]+$/u, '').trim();

const normalizeSpaceRef = (value) =>
  clean(value)
    .replace(/^(?:the|my|this|that|our)\s+/i, '')
    .replace(/^shared\s+space\s+/i, '')
    .replace(/\s+(?:shared\s+)?space$/i, '')
    .trim();

const mentionsSpace = (ref) => /\bspaces?\b/i.test(clean(ref));

// REQUIRE a photo-ish source (the inverse of manage_space_members' decline) so a bare
// member name ("Alex", "Alex and Sam") never matches.
const PHOTO_SOURCE_RE =
  /\b(?:photos?|pics?|pictures?|images?|videos?|clips?|screenshots?|snaps?|shots?|newest|latest|most\s+recent)\b/i;
const looksLikePhotoSource = (text) => PHOTO_SOURCE_RE.test(clean(text));

const tripSourcePattern = /\brecent\s+trip\b/i;
const declinesSource = (source) => SUBJECTIVE_PATTERN.test(source) || tripSourcePattern.test(source);

// Infer add/remove from the prompt verb when the LLM omits the action slot.
const inferAction = (prompt) => {
  const text = clean(prompt).toLowerCase();
  if (/\b(?:remove|take\s+out|drop|delete|pull)\b/.test(text)) {
    return 'remove';
  }
  if (/\b(?:add|put|move|include|stick)\b/.test(text)) {
    return 'add';
  }
  return undefined;
};

const ADD_PATTERN = /\b(?:add|put|move|stick)\s+(?<source>.+)\s+(?:to|into)\s+(?<space>.+?space)\b/i;
const REMOVE_PATTERN = /\b(?:remove|take|pull)\s+(?<source>.+)\s+(?:from|out\s+of)\s+(?<space>.+?space)\b/i;

const VALID_ACTIONS = new Set(['add', 'remove']);

const tryMatch = (prompt) => {
  let action;
  let match = ADD_PATTERN.exec(prompt);
  if (match?.groups) {
    action = 'add';
  } else {
    match = REMOVE_PATTERN.exec(prompt);
    if (match?.groups) {
      action = 'remove';
    }
  }
  if (!match?.groups) {
    return undefined;
  }
  const sourceDescription = cleanSource(match.groups.source);
  const spaceText = clean(match.groups.space);
  if (!sourceDescription || !mentionsSpace(spaceText)) {
    return undefined;
  }
  if (!looksLikePhotoSource(sourceDescription) || declinesSource(sourceDescription)) {
    return undefined; // member add / subjective / recent-trip → not ours
  }
  const spaceRef = normalizeSpaceRef(spaceText);
  return spaceRef ? { action, spaceRef, sourceDescription } : undefined;
};

export const manageSpaceAssetsWorkflow = () => ({
  kind: KIND,
  flow: 'hybrid',

  match(prompt) {
    const text = clean(prompt);
    if (!text) {
      return undefined;
    }
    const matched = tryMatch(text);
    return matched ? { slots: matched } : undefined;
  },

  parseSlots(rawSlots, prompt) {
    let action = clean(rawSlots?.action).toLowerCase();
    if (!VALID_ACTIONS.has(action)) {
      action = inferAction(prompt) ?? '';
    }
    if (!VALID_ACTIONS.has(action)) {
      return null;
    }
    const spaceRef = normalizeSpaceRef(rawSlots?.spaceRef);
    const sourceDescription = cleanSource(rawSlots?.sourceDescription);
    if (!spaceRef || !sourceDescription) {
      return null;
    }
    return { action, spaceRef, sourceDescription };
  },

  // Execution lands in Slice 14.
  async run() {
    return handoffOpen({ reason: 'manage_space_assets execution is implemented in Slice 14.' });
  },
});
