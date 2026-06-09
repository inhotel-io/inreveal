import {
  AgentSessionStatus,
  AgentToolCallStatus,
  type AgentMessageResponseDto,
  type AgentSessionResponseDto,
  type AgentToolCallResponseDto,
} from '@immich/sdk';
import {
  activityEventBelongsToTurn,
  buildStableTurnAnchors,
  toolCallBelongsToTurn,
  type AgentActivityEvent,
} from './agent-session-activity-turns-ui';

// ── exported types ──────────────────────────────────────────────────────────

export type AgentTurnTimelineRowState = 'completed' | 'failed' | 'denied' | 'in-flight' | 'cancelled';

export type AgentTurnTimelineRow = {
  id: string;
  toolName: string;
  state: AgentTurnTimelineRowState;
  /** responseSummary ?? requestSummary ?? null — full text; one-line clamping is presentation (CSS truncate). */
  summaryText: string | null;
  durationMs: number | null; // completedAt - startedAt; null when completedAt is null (E8)
  detail: {
    requestSummary: string | null;
    responseSummary: string | null;
    assetCount: number | null;
    albumCount: number | null;
    resultSize: AgentToolCallResponseDto['resultSize'] | null;
    error: string | null;
    startedAt: string;
    completedAt: string | null;
  };
};

export type AgentTurnTimeline = {
  anchorMessageId: string;
  state: 'running' | 'settled';
  /** non-null only while state === 'running' */
  oneLiner: { kind: 'key'; key: string } | { kind: 'raw'; toolName: string } | null;
  /** null when rows.length === 0 (E1) */
  summary: { steps: number; durationMs: number | null; failedCount: number; cancelled: boolean } | null;
  /** latest strict_router_decision in the turn, parsed from its key=value summary; null when absent (E11) */
  routerAnnotation: { matched: boolean; workflow: string | null; via: string | null } | null;
  rows: AgentTurnTimelineRow[];
};

// ── constants ────────────────────────────────────────────────────────────────

const ACTIVE_SESSION_STATUSES = new Set([
  AgentSessionStatus.Running,
  AgentSessionStatus.WaitingForToolApproval,
  AgentSessionStatus.WaitingForPlanReview,
  AgentSessionStatus.Applying,
]);

const TOOL_VERB_KEYS: Record<string, string> = {
  searchAssets: 'assistant_timeline_verb_searching',
  resolveAssetSearchFilters: 'assistant_timeline_verb_filtering',
  readAssetMetadata: 'assistant_timeline_verb_reading_details',
  readAssetPreviews: 'assistant_timeline_verb_looking',
  readAssetOriginals: 'assistant_timeline_verb_looking_closely',
  findTripCandidates: 'assistant_timeline_verb_finding_trips',
  listAlbums: 'assistant_timeline_verb_browsing_albums',
  readAlbum: 'assistant_timeline_verb_reading_album',
  listSpaces: 'assistant_timeline_verb_browsing_spaces',
  readSpace: 'assistant_timeline_verb_reading_space',
  searchPeople: 'assistant_timeline_verb_finding_people',
  searchUsers: 'assistant_timeline_verb_finding_people',
  listDuplicateGroups: 'assistant_timeline_verb_finding_duplicates',
  curateSelection: 'assistant_timeline_verb_curating',
  resolveLocation: 'assistant_timeline_verb_locating',
  proposeAlbumFromSelection: 'assistant_timeline_verb_proposing',
  proposeAlbumOperations: 'assistant_timeline_verb_proposing',
  proposeAssetBatchFromSelection: 'assistant_timeline_verb_proposing',
  proposeSpaceFromSearch: 'assistant_timeline_verb_proposing',
  proposeAddAssetsToSpaceFromSearch: 'assistant_timeline_verb_proposing',
};

// ── helpers ──────────────────────────────────────────────────────────────────

const buildRowState = (
  toolCall: AgentToolCallResponseDto,
  turnIsRunning: boolean,
): AgentTurnTimelineRowState => {
  switch (toolCall.status) {
    case AgentToolCallStatus.Completed: {
      return 'completed';
    }
    case AgentToolCallStatus.Failed: {
      return 'failed';
    }
    case AgentToolCallStatus.Denied: {
      return 'denied';
    }
    default: {
      // pending_approval | approved | executing
      return turnIsRunning ? 'in-flight' : 'cancelled';
    }
  }
};

const buildRow = (toolCall: AgentToolCallResponseDto, turnIsRunning: boolean): AgentTurnTimelineRow => {
  const state = buildRowState(toolCall, turnIsRunning);
  const durationMs =
    toolCall.completedAt === null
      ? null
      : Date.parse(toolCall.completedAt) - Date.parse(toolCall.startedAt);

  return {
    id: toolCall.id,
    toolName: toolCall.toolName,
    state,
    summaryText: toolCall.responseSummary ?? toolCall.requestSummary ?? null,
    durationMs,
    detail: {
      requestSummary: toolCall.requestSummary ?? null,
      responseSummary: toolCall.responseSummary ?? null,
      assetCount: toolCall.assetCount ?? null,
      albumCount: toolCall.albumCount ?? null,
      resultSize: toolCall.resultSize ?? null,
      error: toolCall.error ?? null,
      startedAt: toolCall.startedAt,
      completedAt: toolCall.completedAt ?? null,
    },
  };
};

const sortRows = (rows: AgentTurnTimelineRow[]): AgentTurnTimelineRow[] =>
  [...rows].sort(
    (a, b) => a.detail.startedAt.localeCompare(b.detail.startedAt) || a.id.localeCompare(b.id),
  );

const buildOneLiner = (
  rows: AgentTurnTimelineRow[],
): AgentTurnTimeline['oneLiner'] => {
  if (rows.length === 0) {
    return { kind: 'key', key: 'assistant_timeline_understanding' };
  }

  // newest in-flight row (last by sort = already sorted)
  const inFlightRows = rows.filter((r) => r.state === 'in-flight');
  if (inFlightRows.length > 0) {
    const newest = inFlightRows.at(-1)!;
    const verbKey = TOOL_VERB_KEYS[newest.toolName];
    if (verbKey === undefined) {
      return { kind: 'raw', toolName: newest.toolName };
    }
    return { kind: 'key', key: verbKey };
  }

  // rows exist but none in-flight — between calls
  return { kind: 'key', key: 'assistant_timeline_thinking' };
};

const buildSummary = (rows: AgentTurnTimelineRow[]): AgentTurnTimeline['summary'] => {
  if (rows.length === 0) {
    return null;
  }

  const steps = rows.length;
  const failedCount = rows.filter((r) => r.state === 'failed').length;
  const cancelled = rows.some((r) => r.state === 'cancelled');

  // wall-clock: first row startedAt → last non-null completedAt
  const firstStartedAt = rows[0].detail.startedAt;
  const lastCompletedAt = [...rows].reverse().find((r) => r.detail.completedAt !== null)?.detail.completedAt ?? null;
  const durationMs =
    lastCompletedAt === null ? null : Date.parse(lastCompletedAt) - Date.parse(firstStartedAt);

  return { steps, durationMs, failedCount, cancelled };
};

const parseRouterAnnotation = (
  summary: string | null,
): { matched: boolean; workflow: string | null; via: string | null } | null => {
  if (summary === null) {
    return null;
  }

  const kv: Record<string, string> = {};
  for (const part of summary.split(/\s+/)) {
    const eqIndex = part.indexOf('=');
    if (eqIndex !== -1) {
      kv[part.slice(0, eqIndex)] = part.slice(eqIndex + 1);
    }
  }

  return {
    matched: kv['matched'] === 'true',
    workflow: kv['workflow'] ?? null,
    via: kv['via'] ?? null,
  };
};

const buildRouterAnnotation = (events: AgentActivityEvent[]): AgentTurnTimeline['routerAnnotation'] => {
  const routerEvents = events.filter((e) => e.kind === 'strict_router_decision');
  if (routerEvents.length === 0) {
    return null;
  }

  // last by createdAt
  const sorted = [...routerEvents].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const last = sorted.at(-1)!;
  return parseRouterAnnotation(last.summary);
};

// ── main export ──────────────────────────────────────────────────────────────

export const buildAgentTurnTimelines = (input: {
  session: AgentSessionResponseDto;
  messages: AgentMessageResponseDto[];
  toolCalls: AgentToolCallResponseDto[];
  activityEvents: AgentActivityEvent[];
}): AgentTurnTimeline[] => {
  const { session, messages, toolCalls, activityEvents } = input;
  const anchors = buildStableTurnAnchors(messages);
  const anchorCount = anchors.length;

  return anchors.map((anchor): AgentTurnTimeline => {
    const turnIsRunning = anchor.isLatest && ACTIVE_SESSION_STATUSES.has(session.status);

    const turnToolCalls = toolCalls.filter((tc) => toolCallBelongsToTurn(tc, anchor, anchorCount));
    const turnEvents = activityEvents.filter((e) => activityEventBelongsToTurn(e, anchor));

    const unsortedRows = turnToolCalls.map((tc) => buildRow(tc, turnIsRunning));
    const rows = sortRows(unsortedRows);

    const oneLiner = turnIsRunning ? buildOneLiner(rows) : null;
    const summary = buildSummary(rows);
    const routerAnnotation = buildRouterAnnotation(turnEvents);

    return {
      anchorMessageId: anchor.message.id,
      state: turnIsRunning ? 'running' : 'settled',
      oneLiner,
      summary,
      routerAnnotation,
      rows,
    };
  });
};
