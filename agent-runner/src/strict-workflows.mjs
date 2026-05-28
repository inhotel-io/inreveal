const unsupported = Object.freeze({ kind: 'unsupported' });

const creationPhrasePattern = /\b(?:create|make|put together)\b/i;
const recentTripPattern = /\brecent\s+trip\b/i;
const albumPattern = /\balbum\b/i;
const highlightPattern = /\b(?:top|best|highlights?|favorite|pick|choose)\b/i;
const nonGenericPattern =
  /\b(?:add|invite|shared\s+space|set\s+the\s+description|set\s+description|metadata|rotate|archive|tag)\b/i;
const questionOnlyPattern = /^\s*(?:how many|what|which|when|where|who|why|can you tell me)\b/i;
const explicitAlbumNamePattern = /\b(?:called|named|as)\s+(?:"([^"]+)"|'([^']+)'|(.+?))\s*[.?!]?$/i;
const placePhrasePattern = /\brecent\s+trip\s+(?:to|in)\s+(.+?)\s*(?:\b(?:called|named|as)\b|[?!]|$)/i;
const uncertainPlacePattern = /^(?:somewhere|somewhere nice|there|that place|the trip|my trip)$/i;

const cleanSlot = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[.?!]+$/g, '')
    .replace(/^the\s+/i, '')
    .trim();

const cleanAlbumName = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizePlaceHint = (value) => {
  const cleaned = cleanSlot(value);
  if (!cleaned || uncertainPlacePattern.test(cleaned)) {
    return undefined;
  }

  if (/^(?:USA|U\.S\.?|US|United States|the United States)$/i.test(cleaned)) {
    return 'USA';
  }

  return cleaned.length <= 80 ? cleaned : undefined;
};

const extractPlaceHint = (prompt) => {
  const match = prompt.match(placePhrasePattern);
  return match ? normalizePlaceHint(match[1]) : undefined;
};

const extractAlbumName = (prompt, placeHint) => {
  const explicit = prompt.match(explicitAlbumNamePattern);
  if (explicit) {
    return cleanAlbumName(explicit[1] ?? explicit[2] ?? explicit[3]);
  }

  return placeHint ? `${placeHint} Trip` : 'Recent Trip';
};

const stripExplicitAlbumNameClause = (prompt) => prompt.replace(explicitAlbumNamePattern, '');

export const matchStrictWorkflow = (prompt) => {
  const text = String(prompt ?? '').trim();
  if (!text) {
    return unsupported;
  }

  if (
    !creationPhrasePattern.test(text) ||
    !albumPattern.test(text) ||
    !recentTripPattern.test(text) ||
    highlightPattern.test(stripExplicitAlbumNameClause(text)) ||
    nonGenericPattern.test(text) ||
    questionOnlyPattern.test(text)
  ) {
    return unsupported;
  }

  const placeHint = extractPlaceHint(text);
  const albumName = extractAlbumName(text, placeHint);
  if (!albumName) {
    return unsupported;
  }

  return placeHint
    ? { kind: 'create_recent_trip_album', albumName, placeHint }
    : { kind: 'create_recent_trip_album', albumName };
};

const assertCreateRecentTripWorkflow = (workflow) => {
  if (workflow?.kind !== 'create_recent_trip_album') {
    throw new Error('runCreateRecentTripAlbumWorkflow requires a create_recent_trip_album workflow');
  }
};

const tripCandidateDateRange = (candidate) => {
  const after = new Date(candidate.takenAfter);
  const before = new Date(candidate.takenBefore);
  const month = after.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${month} ${after.getUTCDate()}-${before.getUTCDate()}, ${before.getUTCFullYear()}`;
};

const tripCandidateLabel = (candidate) =>
  Array.isArray(candidate.placeLabels) && candidate.placeLabels.length > 0
    ? candidate.placeLabels.join(' and ')
    : candidate.title?.replace(/^Recent trip to\s+/i, '') || candidate.subtitle || 'that trip';

const tripDuplicateParts = (candidate) => {
  const duplicateCount = candidate.excludedDuplicateCount ?? 0;
  const stackCount = candidate.excludedStackChildCount ?? 0;
  const parts = [];
  if (duplicateCount > 0) {
    parts.push(`${duplicateCount} known duplicate variant${duplicateCount === 1 ? '' : 's'}`);
  }
  if (stackCount > 0) {
    parts.push(`${stackCount} stack child${stackCount === 1 ? '' : 'ren'}`);
  }
  return parts;
};

const duplicateExclusionText = (candidate) => {
  const parts = tripDuplicateParts(candidate);
  return parts.length > 0 ? ` I skipped ${parts.join(' and ')}.` : '';
};

const duplicateDescriptionText = (candidate) => {
  const parts = tripDuplicateParts(candidate);
  return parts.length > 0 ? ` ${parts.join(' and ')} were excluded when detected.` : '';
};

const extractPlanId = (toolResult) =>
  typeof toolResult?.planId === 'string'
    ? toolResult.planId
    : typeof toolResult?.plan?.id === 'string'
      ? toolResult.plan.id
      : undefined;

const workflowResult = (status, text, extra = {}) => ({ status, text, ...extra });

const redactSensitiveText = (value) =>
  String(value)
    .replace(/\bAuthorization:\s*Bearer\s+\S+/gi, 'Authorization: Bearer [redacted]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\bapi[_-]?key\s*[=:]\s*\S+/gi, (match) => match.replace(/\S+$/u, '[redacted]'))
    .replace(/\bapi-key\s+\S+/gi, 'api-key [redacted]')
    .replace(/\bpassword\s*[=:]\s*\S+/gi, (match) => match.replace(/\S+$/u, '[redacted]'))
    .replace(/\bsecret\s*[=:]\s*\S+/gi, (match) => match.replace(/\S+$/u, '[redacted]'))
    .replace(/\bsecret\s+value\s+\S+/gi, 'secret value [redacted]')
    .replace(/\bsecret[-_][A-Za-z0-9_-]+\b/gi, '[redacted]')
    .replace(/\btoken\s+[A-Za-z0-9._-]+\b/gi, 'token [redacted]');

const safeFailureText = (message) =>
  `I could not create a reviewable album plan. ${redactSensitiveText(
    message ?? 'Please try again or provide a more specific date range or place.',
  ).trim()}`;

const planFailureReason = (planResult) =>
  `The planning tool returned status "${planResult?.status ?? 'unknown'}" for proposeAlbumFromSelection.`;

const plannedResult = ({ planResult, candidate, workflow, label, assetCount, selectionHandleId }) => {
  if (planResult?.status === 'approval-required') {
    const toolCallId = planResult.toolCall?.id;
    if (typeof toolCallId === 'string' && toolCallId.length > 0) {
      return workflowResult('approval_required', '', { toolCallId, planResult });
    }

    return workflowResult(
      'failed',
      safeFailureText('The planning tool requested approval without a usable tool call id.'),
      { planResult, candidate },
    );
  }

  if (planResult?.status && planResult.status !== 'success') {
    return workflowResult('failed', safeFailureText(planFailureReason(planResult)), { planResult, candidate });
  }

  const planId = extractPlanId(planResult);
  if (!planId) {
    return workflowResult('failed', safeFailureText('The planning tool did not return a persisted plan id.'), {
      planResult,
      candidate,
    });
  }

  return workflowResult(
    'planned',
    `I found a likely ${label} trip from ${tripCandidateDateRange(candidate)} and proposed ${workflow.albumName} with ${assetCount} assets.${duplicateExclusionText(candidate)} Review the plan before applying it.`,
    {
      planId,
      planResult,
      candidate,
      selectionHandleId,
      assetCount,
    },
  );
};

export const runCreateRecentTripAlbumWorkflow = async ({ client, workflow, approvedPlanResult, signal }) => {
  assertCreateRecentTripWorkflow(workflow);

  const tripResult = await client.call(
    'findTripCandidates',
    workflow.placeHint ? { placeHint: workflow.placeHint } : {},
    { signal },
  );
  const candidates = Array.isArray(tripResult.candidates) ? tripResult.candidates : [];
  const recommendation = tripResult.recommendation;

  if (recommendation?.action === 'none' || candidates.length === 0) {
    return workflowResult(
      'needs_input',
      'I could not find a likely recent trip from the available date and location metadata. Which date range or place should I use for the album?',
    );
  }

  if (recommendation?.action === 'ask_user') {
    const labels = candidates.map(tripCandidateLabel).slice(0, 5).join('; ');
    return workflowResult(
      'needs_input',
      candidates.length === 1
        ? `I found one possible recent trip: ${labels}. Should I use it, or would you prefer to give me a date range or place?`
        : `I found multiple possible recent trips: ${labels}. Which one should I use?`,
      { candidates },
    );
  }

  const candidateDedupeKey = recommendation?.candidateDedupeKey;
  const candidate =
    typeof candidateDedupeKey === 'string'
      ? candidates.find((item) => item?.dedupeKey === candidateDedupeKey)
      : undefined;

  if (!candidate) {
    return workflowResult(
      'needs_input',
      'Gallery found trip candidates, but the recommended trip could not match an available candidate. Which date range or place should I use for the album?',
    );
  }

  const selectionHandleId = candidate.selectionHandle?.id;
  if (!selectionHandleId) {
    return workflowResult(
      'needs_input',
      'I found a trip candidate but could not get an album-ready selection handle. Please try again or give me a date range.',
    );
  }

  const assetCount = candidate.selectionHandle.assetCount ?? candidate.albumAssetCount ?? 0;
  if (assetCount <= 0) {
    return workflowResult(
      'needs_input',
      'I found the recommended trip, but it found no album-ready assets. Which date range or place should I use instead?',
      { candidate },
    );
  }

  const label = tripCandidateLabel(candidate);
  let planResult;
  try {
    planResult =
      approvedPlanResult ??
      (await client.call('proposeAlbumFromSelection', {
        summary: `Create ${workflow.albumName} with ${assetCount} trip assets from ${label}.`,
        albumName: workflow.albumName,
        description: `Album-ready trip selection from ${label}.${duplicateDescriptionText(candidate)}`,
        selectionHandleId,
      }, { signal }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return workflowResult('failed', safeFailureText(message), { candidate, selectionHandleId, assetCount });
  }

  return plannedResult({ planResult, candidate, workflow, label, assetCount, selectionHandleId });
};
