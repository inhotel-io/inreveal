import {
  AgentOperationPlanStatus,
  AgentSessionStatus,
  AgentToolCallStatus,
  AgentToolName,
  type AgentMessageResponseDto,
  type AgentOperationPlanResponseDto,
  type AgentSessionActivityEventResponseDto,
  type AgentSessionResponseDto,
  type AgentToolCallResponseDto,
} from '@immich/sdk';
import type { Translations } from 'svelte-i18n';

export type AgentActivityKind =
  | 'understanding'
  | 'search'
  | 'metadata'
  | 'preview'
  | 'album'
  | 'space'
  | 'plan'
  | 'permission'
  | 'apply'
  | 'message'
  | 'error'
  | 'unknown';

export type AgentActivityStatus = 'pending' | 'running' | 'blocked' | 'completed' | 'failed' | 'skipped';

export type AgentActivityTechnicalDetails = {
  toolName?: string;
  toolCallIds?: string[];
  requestSummary?: string;
  responseSummary?: string;
  error?: string;
  assetCount?: number;
  albumCount?: number;
  startedAt?: string;
  completedAt?: string;
  resultSize?: AgentToolCallResponseDto['resultSize'];
};

export type AgentActivityEvent = AgentSessionActivityEventResponseDto;

export type AgentActivityTechnicalRow = {
  id: string;
  labelKey: Translations;
  value: string;
  valueKind?: 'text' | 'code' | 'timestamp' | 'number';
};

export type AgentActivityItem = {
  id: string;
  sessionId: string;
  kind: AgentActivityKind;
  status: AgentActivityStatus;
  title: string;
  summary?: string;
  count?: number;
  startedAt: string;
  completedAt?: string;
  technical?: AgentActivityTechnicalDetails;
};

export type AgentActivityModel = {
  items: AgentActivityItem[];
  verboseItems: AgentActivityItem[];
  activeItem: AgentActivityItem | null;
  verboseActiveItem: AgentActivityItem | null;
  summary: string | null;
};

export type BuildAgentActivityModelInput = {
  session: AgentSessionResponseDto;
  messages: AgentMessageResponseDto[];
  toolCalls: AgentToolCallResponseDto[];
  currentPlan: AgentOperationPlanResponseDto | null;
  appliedPlans: AgentOperationPlanResponseDto[];
  activityEvents?: AgentActivityEvent[];
  streamingText?: string;
  isAssistantActive?: boolean;
};

type ToolActivityDefinition = {
  kind: AgentActivityKind;
  title: string;
  completedSummary: string;
  runningSummary?: string;
  coalesceKey: string;
};

type ToolActivityCandidate = AgentActivityItem & {
  coalesceKey: string;
};

const unknownToolDefinition: ToolActivityDefinition = {
  kind: 'unknown',
  title: 'Working with Gallery',
  completedSummary: 'Checked Gallery data',
  runningSummary: 'Working with Gallery',
  coalesceKey: 'unknown',
};

const toolActivityDefinitions: Partial<Record<AgentToolName, ToolActivityDefinition>> = {
  [AgentToolName.ResolveAssetSearchFilters]: {
    kind: 'search',
    title: 'Resolving filters',
    completedSummary: 'Matched search filters',
    coalesceKey: 'resolve-search-filters',
  },
  [AgentToolName.SearchAssets]: {
    kind: 'search',
    title: 'Searching photos',
    completedSummary: 'Found matching photos',
    coalesceKey: 'search-assets',
  },
  [AgentToolName.ReadAssetMetadata]: {
    kind: 'metadata',
    title: 'Reading photo details',
    completedSummary: 'Read details for photos',
    coalesceKey: 'read-asset-metadata',
  },
  [AgentToolName.ReadAssetPreviews]: {
    kind: 'preview',
    title: 'Loading photo previews',
    completedSummary: 'Loaded photo previews',
    coalesceKey: 'read-asset-previews',
  },
  [AgentToolName.ReadAssetOriginals]: {
    kind: 'preview',
    title: 'Opening original files',
    completedSummary: 'Opened original files',
    coalesceKey: 'read-asset-originals',
  },
  [AgentToolName.ListAlbums]: {
    kind: 'album',
    title: 'Searching albums',
    completedSummary: 'Found matching albums',
    coalesceKey: 'list-albums',
  },
  [AgentToolName.ReadAlbum]: {
    kind: 'album',
    title: 'Reading album details',
    completedSummary: 'Read album details',
    coalesceKey: 'read-album',
  },
  [AgentToolName.ListSpaces]: {
    kind: 'space',
    title: 'Listing spaces',
    completedSummary: 'Found visible spaces',
    coalesceKey: 'list-spaces',
  },
  [AgentToolName.ReadSpace]: {
    kind: 'space',
    title: 'Reading space details',
    completedSummary: 'Read space details',
    coalesceKey: 'read-space',
  },
  [AgentToolName.ProposeAlbumOperations]: {
    kind: 'plan',
    title: 'Preparing a plan',
    completedSummary: 'Prepared a plan',
    coalesceKey: 'propose-plan',
  },
  [AgentToolName.ReviseProposedOperations]: {
    kind: 'plan',
    title: 'Revising the plan',
    completedSummary: 'Revised the plan',
    coalesceKey: 'revise-plan',
  },
  [AgentToolName.SummarizePlan]: {
    kind: 'plan',
    title: 'Summarizing the plan',
    completedSummary: 'Summarized the plan',
    coalesceKey: 'summarize-plan',
  },
};

const statusPriority: Record<AgentActivityStatus, number> = {
  failed: 0,
  blocked: 1,
  running: 2,
  completed: 3,
  skipped: 4,
  pending: 5,
};

const typePriority: Record<AgentActivityKind, number> = {
  permission: 0,
  search: 1,
  album: 2,
  space: 3,
  metadata: 4,
  preview: 5,
  plan: 6,
  apply: 7,
  message: 8,
  error: 9,
  unknown: 10,
  understanding: 11,
};

const activeStatuses = new Set<AgentActivityStatus>(['blocked', 'running', 'pending']);
const terminalStatuses = new Set<AgentActivityStatus>(['completed', 'failed', 'skipped']);

const isValidIsoDate = (value: string | null | undefined): value is string => {
  if (!value) {
    return false;
  }

  return !Number.isNaN(Date.parse(value));
};

const normalizeStartedAt = (value: string | null | undefined, fallback: string) =>
  isValidIsoDate(value) ? value : fallback;

const compareActivityItems = (first: AgentActivityItem, second: AgentActivityItem) => {
  const firstValid = isValidIsoDate(first.startedAt);
  const secondValid = isValidIsoDate(second.startedAt);

  if (firstValid && secondValid) {
    const timeComparison = first.startedAt.localeCompare(second.startedAt);
    if (timeComparison !== 0) {
      return timeComparison;
    }
  } else if (firstValid !== secondValid) {
    return firstValid ? -1 : 1;
  }

  return typePriority[first.kind] - typePriority[second.kind] || first.id.localeCompare(second.id);
};

const sortedBy = <T>(values: T[], compare: (first: T, second: T) => number) => [...values].sort(compare);

const mapToolCallStatus = (status: AgentToolCallStatus): AgentActivityStatus => {
  switch (status) {
    case AgentToolCallStatus.PendingApproval: {
      return 'blocked';
    }

    case AgentToolCallStatus.Approved:
    case AgentToolCallStatus.Executing: {
      return 'running';
    }

    case AgentToolCallStatus.Completed: {
      return 'completed';
    }

    case AgentToolCallStatus.Failed: {
      return 'failed';
    }

    case AgentToolCallStatus.Denied: {
      return 'skipped';
    }

    default: {
      return 'pending';
    }
  }
};

const getDefinitionForTool = (toolName: AgentToolName) => toolActivityDefinitions[toolName] ?? unknownToolDefinition;

const technicalTextLimit = 500;
const unsafePromptPattern = /\b(raw prompt|system prompt|chain-of-thought|reasoning trace)\s*:/i;
const secretAssignmentPattern =
  /\b(token|api_key|apikey|api-key|access_token|refresh_token|runner_token)=([^&\s,;]+)/gi;

export const redactAgentActivityTechnicalText = (value: string) => {
  if (unsafePromptPattern.test(value)) {
    return '[redacted unsafe prompt/reasoning text]';
  }

  const redacted = value
    .replaceAll(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replaceAll(/\bBasic\s+[^\s,;]+/gi, 'Basic [redacted]')
    .replaceAll(secretAssignmentPattern, '$1=[redacted]')
    .replaceAll(/\brunner\s+token\s+[^\s,;]+/gi, 'runner token [redacted]')
    .replaceAll(/\bprovider\s+key\s+[^\s,;]+/gi, 'provider key [redacted]')
    .replaceAll(/\bsk-[A-Za-z0-9_-]+/g, '[redacted]');

  if (redacted.length <= technicalTextLimit) {
    return redacted;
  }

  return `${redacted.slice(0, technicalTextLimit).trimEnd()} [truncated]`;
};

const optionalRedacted = (value: string | null | undefined) => {
  if (!value) {
    return undefined;
  }

  return redactAgentActivityTechnicalText(value);
};

const formatToolCallIds = (toolCallIds: string[]) => {
  const visibleIds = toolCallIds.slice(0, 5);
  const hiddenCount = toolCallIds.length - visibleIds.length;

  return hiddenCount > 0 ? `${visibleIds.join(', ')}, +${hiddenCount} more` : visibleIds.join(', ');
};

const technicalTextRow = (
  id: string,
  labelKey: Translations,
  value: string | number | null | undefined,
  valueKind: AgentActivityTechnicalRow['valueKind'] = 'text',
): AgentActivityTechnicalRow | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return {
    id,
    labelKey,
    value: redactAgentActivityTechnicalText(String(value)),
    valueKind,
  };
};

const formatBytes = (bytes: number | null | undefined) => {
  if (bytes === null || bytes === undefined) {
    return 'not estimated';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return `${Math.round(bytes / 1024)} KB`;
};

export const buildAgentActivityTechnicalRows = (item: AgentActivityItem): AgentActivityTechnicalRow[] => {
  const technical = item.technical;
  if (!technical) {
    return [];
  }

  const toolCallIds = technical.toolCallIds?.filter(Boolean) ?? [];
  const rows = [
    technicalTextRow('tool-name', 'assistant_activity_technical_tool', technical.toolName, 'code'),
    technicalTextRow(
      'tool-call-ids',
      toolCallIds.length === 1 ? 'assistant_activity_technical_tool_call' : 'assistant_activity_technical_tool_calls',
      toolCallIds.length > 0 ? formatToolCallIds(toolCallIds) : undefined,
      'code',
    ),
    technicalTextRow('asset-count', 'assistant_activity_technical_assets', technical.assetCount, 'number'),
    technicalTextRow('album-count', 'assistant_activity_technical_albums', technical.albumCount, 'number'),
    technicalTextRow('request-summary', 'assistant_activity_technical_request', technical.requestSummary),
    technicalTextRow('response-summary', 'assistant_activity_technical_response', technical.responseSummary),
    technicalTextRow(
      'result-size',
      'assistant_activity_technical_result_size',
      technical.resultSize ? formatBytes(technical.resultSize.estimatedBytes) : undefined,
      'number',
    ),
    technicalTextRow(
      'result-items',
      'assistant_activity_technical_result_items',
      technical.resultSize?.returnedItems,
      'number',
    ),
    technicalTextRow(
      'result-truncated',
      'assistant_activity_technical_truncated',
      technical.resultSize ? (technical.resultSize.truncated ? 'yes' : 'no') : undefined,
    ),
    technicalTextRow(
      'result-omitted-fields',
      'assistant_activity_technical_omitted_fields',
      technical.resultSize?.omittedFields.length ? technical.resultSize.omittedFields.join(', ') : undefined,
    ),
    technicalTextRow('result-next-page', 'assistant_activity_technical_next_page', technical.resultSize?.nextPage),
    technicalTextRow('error', 'assistant_activity_technical_error', technical.error),
    technicalTextRow('started-at', 'assistant_activity_technical_started', technical.startedAt, 'timestamp'),
    technicalTextRow('completed-at', 'assistant_activity_technical_completed', technical.completedAt, 'timestamp'),
  ];

  return rows.filter((row): row is AgentActivityTechnicalRow => row !== null);
};

const getSummaryForStatus = (
  definition: ToolActivityDefinition,
  status: AgentActivityStatus,
  toolName: AgentToolName,
  responseSummary: string | null | undefined,
) => {
  if (status === 'failed') {
    return 'Gallery step failed';
  }

  if (status === 'running') {
    return definition.runningSummary ?? definition.title;
  }

  if (status === 'skipped') {
    return 'Skipped this step';
  }

  return status === 'completed' && toolName === AgentToolName.SearchAssets
    ? (optionalRedacted(responseSummary) ?? definition.completedSummary)
    : definition.completedSummary;
};

const buildToolActivityCandidate = (toolCall: AgentToolCallResponseDto): ToolActivityCandidate => {
  const toolName = toolCall.toolName;
  const status = mapToolCallStatus(toolCall.status);
  const baseDefinition = getDefinitionForTool(toolName);
  const definition =
    toolCall.status === AgentToolCallStatus.PendingApproval
      ? {
          kind: 'permission' as const,
          title: 'Waiting for approval',
          completedSummary: 'Needs your approval to continue',
          coalesceKey: `permission-${toolName}`,
        }
      : baseDefinition;
  const count =
    toolCall.assetCount > 0 ? toolCall.assetCount : toolCall.albumCount > 0 ? toolCall.albumCount : undefined;

  return {
    id: `tool-${definition.kind}-${toolCall.id}`,
    sessionId: toolCall.sessionId,
    kind: definition.kind,
    status,
    title: definition.title,
    summary: getSummaryForStatus(definition, status, toolName, toolCall.responseSummary),
    count,
    startedAt: normalizeStartedAt(toolCall.startedAt, toolCall.id),
    ...(isValidIsoDate(toolCall.completedAt) && terminalStatuses.has(status)
      ? { completedAt: toolCall.completedAt }
      : {}),
    technical: {
      toolName,
      toolCallIds: [toolCall.id],
      requestSummary: optionalRedacted(toolCall.requestSummary),
      responseSummary: optionalRedacted(toolCall.responseSummary),
      error: optionalRedacted(toolCall.error),
      ...(toolCall.assetCount > 0 ? { assetCount: toolCall.assetCount } : {}),
      ...(toolCall.albumCount > 0 ? { albumCount: toolCall.albumCount } : {}),
      ...(toolCall.resultSize ? { resultSize: toolCall.resultSize } : {}),
      startedAt: toolCall.startedAt,
      ...(toolCall.completedAt ? { completedAt: toolCall.completedAt } : {}),
    },
    coalesceKey: `${definition.kind}:${definition.coalesceKey}`,
  };
};

const pickStatus = (statuses: AgentActivityStatus[]) =>
  sortedBy(statuses, (first, second) => statusPriority[first] - statusPriority[second])[0] ?? 'pending';

const coalesceToolActivities = (candidates: ToolActivityCandidate[]): AgentActivityItem[] => {
  const candidatesByKey = new Map<string, ToolActivityCandidate[]>();

  for (const candidate of candidates) {
    const existing = candidatesByKey.get(candidate.coalesceKey) ?? [];
    existing.push(candidate);
    candidatesByKey.set(candidate.coalesceKey, existing);
  }

  return [...candidatesByKey.values()].map((group) => {
    const sortedGroup = sortedBy(group, compareActivityItems);
    const first = sortedGroup[0];
    const status = pickStatus(sortedGroup.map((item) => item.status));
    const assetCount = sortedGroup.reduce((total, item) => total + (item.technical?.assetCount ?? 0), 0);
    const albumCount = sortedGroup.reduce((total, item) => total + (item.technical?.albumCount ?? 0), 0);
    const resultSize = sortedGroup.find((item) => item.technical?.resultSize)?.technical?.resultSize;
    const validCompletedDates = sortedBy(
      sortedGroup.map((item) => item.completedAt).filter(isValidIsoDate),
      (firstDate, secondDate) => firstDate.localeCompare(secondDate),
    );
    const allTerminal = sortedGroup.every((item) => terminalStatuses.has(item.status));
    const completedAt = allTerminal ? validCompletedDates.at(-1) : undefined;
    const summary =
      sortedGroup.length > 1 && first.kind === 'search' && status === 'completed' && assetCount > 0
        ? `Returned metadata for ${assetCount} ${assetCount === 1 ? 'asset' : 'assets'}`
        : (sortedGroup.find((item) => item.status === status && item.summary)?.summary ??
          sortedGroup.find((item) => item.summary)?.summary);

    return {
      id: sortedGroup.length === 1 ? first.id : `tool-${first.coalesceKey.replaceAll(/[^a-z0-9-]/gi, '-')}`,
      sessionId: first.sessionId,
      kind: first.kind,
      status,
      title: first.title,
      ...(summary ? { summary } : {}),
      ...(assetCount > 0 ? { count: assetCount } : albumCount > 0 ? { count: albumCount } : {}),
      startedAt: first.startedAt,
      ...(completedAt ? { completedAt } : {}),
      technical: {
        toolName: first.technical?.toolName,
        toolCallIds: sortedGroup.flatMap((item) => item.technical?.toolCallIds ?? []),
        requestSummary: sortedGroup.find((item) => item.technical?.requestSummary)?.technical?.requestSummary,
        responseSummary: sortedGroup.find((item) => item.technical?.responseSummary)?.technical?.responseSummary,
        error: sortedGroup.find((item) => item.technical?.error)?.technical?.error,
        ...(assetCount > 0 ? { assetCount } : {}),
        ...(albumCount > 0 ? { albumCount } : {}),
        ...(resultSize ? { resultSize } : {}),
        startedAt: first.technical?.startedAt,
        ...(completedAt ? { completedAt } : {}),
      },
    };
  });
};

const buildCurrentPlanItem = (session: AgentSessionResponseDto, currentPlan: AgentOperationPlanResponseDto | null) => {
  if (currentPlan?.status === AgentOperationPlanStatus.Proposed) {
    return {
      id: `plan-${currentPlan.id}-${currentPlan.revision}`,
      sessionId: currentPlan.sessionId,
      kind: 'plan' as const,
      status: 'completed' as const,
      title: 'Preparing a plan',
      summary: 'Prepared a plan',
      count: currentPlan.operations.length,
      startedAt: normalizeStartedAt(currentPlan.createdAt, currentPlan.id),
      ...(isValidIsoDate(currentPlan.updatedAt) ? { completedAt: currentPlan.updatedAt } : {}),
    };
  }

  if (session.status === AgentSessionStatus.WaitingForPlanReview) {
    return {
      id: `plan-session-${session.id}`,
      sessionId: session.id,
      kind: 'plan' as const,
      status: 'completed' as const,
      title: 'Preparing a plan',
      summary: 'Prepared a plan',
      startedAt: normalizeStartedAt(session.updatedAt, session.id),
      ...(isValidIsoDate(session.updatedAt) ? { completedAt: session.updatedAt } : {}),
    };
  }

  return null;
};

const buildApplyItem = (session: AgentSessionResponseDto, appliedPlans: AgentOperationPlanResponseDto[]) => {
  if (session.status === AgentSessionStatus.Applying) {
    return {
      id: `apply-session-${session.id}`,
      sessionId: session.id,
      kind: 'apply' as const,
      status: 'running' as const,
      title: 'Applying changes',
      summary: 'Applying selected changes',
      startedAt: normalizeStartedAt(session.updatedAt, session.id),
    };
  }

  if (appliedPlans.length === 0) {
    return null;
  }

  const sortedPlans = sortedBy(appliedPlans, (first, second) =>
    normalizeStartedAt(first.createdAt, first.id).localeCompare(normalizeStartedAt(second.createdAt, second.id)),
  );
  const latestUpdatedAt = sortedBy(sortedPlans.map((plan) => plan.updatedAt).filter(isValidIsoDate), (first, second) =>
    first.localeCompare(second),
  ).at(-1);

  return {
    id: `apply-plans-${sortedPlans.map((plan) => `${plan.id}-${plan.revision}`).join('-')}`,
    sessionId: session.id,
    kind: 'apply' as const,
    status: 'completed' as const,
    title: 'Applying changes',
    summary: 'Applied selected changes',
    count: sortedPlans.reduce((total, plan) => total + plan.operations.length, 0),
    startedAt: normalizeStartedAt(sortedPlans[0]?.createdAt, session.id),
    ...(latestUpdatedAt ? { completedAt: latestUpdatedAt } : {}),
  };
};

const eventStatusToActivityStatus = (status: AgentActivityEvent['status']): AgentActivityStatus => {
  switch (status) {
    case 'completed':
    case 'failed':
    case 'running':
    case 'skipped': {
      return status;
    }
  }

  return 'running';
};

const getApplyProgressSummary = (event: AgentActivityEvent, status: AgentActivityStatus) => {
  if (status === 'failed') {
    return 'Applying changes failed';
  }

  if (status === 'skipped') {
    return 'Skipped applying changes';
  }

  if (status === 'completed') {
    return 'Applied selected changes';
  }

  const appliedCount = event.counts?.applied ?? 0;
  const totalCount = event.counts?.total ?? 0;

  return totalCount > 0 ? `Applied ${appliedCount} of ${totalCount} changes` : 'Applying selected changes';
};

const buildEventActivityItem = (event: AgentActivityEvent): AgentActivityItem => {
  const status = eventStatusToActivityStatus(event.status);
  const safeSummary = optionalRedacted(event.summary);
  const startedAt = normalizeStartedAt(event.createdAt, event.id);
  const terminal = terminalStatuses.has(status);

  switch (event.kind) {
    case 'start-processing': {
      return {
        id: `event-${event.id}`,
        sessionId: event.sessionId,
        kind: 'understanding',
        status,
        title: 'Understanding request',
        summary:
          status === 'failed' ? 'Request setup failed' : status === 'completed' ? 'Started working' : 'Getting started',
        startedAt,
        ...(terminal ? { completedAt: startedAt } : {}),
        technical: {
          requestSummary: safeSummary,
          startedAt: event.createdAt,
          ...(terminal ? { completedAt: event.createdAt } : {}),
        },
      };
    }

    case 'plan-composing': {
      return {
        id: `event-${event.id}`,
        sessionId: event.sessionId,
        kind: 'plan',
        status,
        title: 'Preparing a plan',
        summary:
          status === 'completed'
            ? 'Prepared a plan'
            : status === 'failed'
              ? 'Plan preparation failed'
              : 'Preparing the plan',
        startedAt,
        ...(terminal ? { completedAt: startedAt } : {}),
        technical: {
          requestSummary: safeSummary,
          startedAt: event.createdAt,
          ...(terminal ? { completedAt: event.createdAt } : {}),
        },
      };
    }

    case 'apply-progress': {
      return {
        id: `event-${event.id}`,
        sessionId: event.sessionId,
        kind: 'apply',
        status,
        title: 'Applying changes',
        summary: getApplyProgressSummary(event, status),
        ...(event.counts?.total && event.counts.total > 0 ? { count: event.counts.total } : {}),
        startedAt,
        ...(terminal ? { completedAt: startedAt } : {}),
        technical: {
          requestSummary: safeSummary,
          ...(event.counts?.total && event.counts.total > 0 ? { assetCount: event.counts.total } : {}),
          startedAt: event.createdAt,
          ...(terminal ? { completedAt: event.createdAt } : {}),
        },
      };
    }

    case 'runner-recovery': {
      return {
        id: `event-${event.id}`,
        sessionId: event.sessionId,
        kind: 'message',
        status,
        title: 'Resuming work',
        summary:
          status === 'failed' ? 'Resume failed' : status === 'completed' ? 'Resumed work' : 'Resuming after a pause',
        startedAt,
        ...(terminal ? { completedAt: startedAt } : {}),
        technical: {
          requestSummary: safeSummary,
          startedAt: event.createdAt,
          ...(terminal ? { completedAt: event.createdAt } : {}),
        },
      };
    }

    case 'unknown': {
      return {
        id: `event-${event.id}`,
        sessionId: event.sessionId,
        kind: 'unknown',
        status,
        title: 'Working with Gallery',
        summary:
          status === 'failed'
            ? 'Gallery step failed'
            : status === 'skipped'
              ? 'Skipped this step'
              : 'Working with Gallery',
        startedAt,
        ...(terminal ? { completedAt: startedAt } : {}),
        technical: {
          requestSummary: safeSummary,
          startedAt: event.createdAt,
          ...(terminal ? { completedAt: event.createdAt } : {}),
        },
      };
    }
  }

  return {
    id: `event-${event.id}`,
    sessionId: event.sessionId,
    kind: 'unknown',
    status,
    title: 'Working with Gallery',
    summary: 'Working with Gallery',
    startedAt,
    ...(terminal ? { completedAt: startedAt } : {}),
    technical: {
      requestSummary: safeSummary,
      startedAt: event.createdAt,
      ...(terminal ? { completedAt: event.createdAt } : {}),
    },
  };
};

const dedupeActivityEvents = (events: AgentActivityEvent[]) => {
  const eventsById = new Map<string, AgentActivityEvent>();

  for (const event of events) {
    eventsById.set(event.id, event);
  }

  return [...eventsById.values()];
};

const filterSecondaryEventItems = (eventItems: AgentActivityItem[], primaryItems: AgentActivityItem[]) => {
  const hasPrimaryPlan = primaryItems.some((item) => item.kind === 'plan');
  const hasPrimaryApply = primaryItems.some((item) => item.kind === 'apply');

  return eventItems.filter((item) => {
    if (item.kind === 'plan' && hasPrimaryPlan) {
      return false;
    }

    if (item.kind === 'apply' && hasPrimaryApply) {
      return false;
    }

    return true;
  });
};

const buildMessageItem = (input: BuildAgentActivityModelInput, existingItems: AgentActivityItem[]) => {
  if (!input.streamingText?.trim() && !input.isAssistantActive) {
    return null;
  }

  if (existingItems.some((item) => item.status === 'blocked' || item.kind === 'apply' || item.kind === 'plan')) {
    return null;
  }

  return {
    id: `message-writing-${input.session.id}`,
    sessionId: input.session.id,
    kind: 'message' as const,
    status: 'running' as const,
    title: 'Writing response',
    summary: 'Writing a response',
    startedAt: normalizeStartedAt(input.session.updatedAt, input.session.id),
  };
};

const buildSummary = (items: AgentActivityItem[]) => {
  const parts = items
    .filter((item) => terminalStatuses.has(item.status))
    .map((item) => item.summary ?? item.title)
    .filter(Boolean)
    .slice(0, 3);

  return parts.length > 0 ? parts.join(', ') : null;
};

const hasLaterPrimaryActivity = (item: AgentActivityItem, items: AgentActivityItem[]) =>
  item.kind === 'understanding' &&
  item.status === 'running' &&
  items.some(
    (candidate) =>
      candidate.id !== item.id &&
      candidate.kind !== 'understanding' &&
      isValidIsoDate(candidate.startedAt) &&
      isValidIsoDate(item.startedAt) &&
      candidate.startedAt > item.startedAt,
  );

const compareActiveActivityItems = (first: AgentActivityItem, second: AgentActivityItem) => {
  const statusComparison = statusPriority[first.status] - statusPriority[second.status];
  if (statusComparison !== 0) {
    return statusComparison;
  }

  const firstValid = isValidIsoDate(first.startedAt);
  const secondValid = isValidIsoDate(second.startedAt);

  if (firstValid && secondValid) {
    const timeComparison = second.startedAt.localeCompare(first.startedAt);
    if (timeComparison !== 0) {
      return timeComparison;
    }
  } else if (firstValid !== secondValid) {
    return firstValid ? -1 : 1;
  }

  return typePriority[first.kind] - typePriority[second.kind] || first.id.localeCompare(second.id);
};

const pickActiveActivityItem = (items: AgentActivityItem[]) =>
  sortedBy(
    items.filter((item) => activeStatuses.has(item.status) && !hasLaterPrimaryActivity(item, items)),
    compareActiveActivityItems,
  )[0] ?? null;

export const buildAgentActivityModel = (input: BuildAgentActivityModelInput): AgentActivityModel => {
  const verboseToolItems = input.toolCalls.map((toolCall) => buildToolActivityCandidate(toolCall));
  const toolItems = coalesceToolActivities(verboseToolItems);
  const items = [...toolItems];
  const verboseItems: AgentActivityItem[] = [...verboseToolItems];
  const currentPlanItem = buildCurrentPlanItem(input.session, input.currentPlan);
  const applyItem = buildApplyItem(input.session, input.appliedPlans);

  if (currentPlanItem && !items.some((item) => item.kind === 'plan')) {
    items.push(currentPlanItem);
  }
  if (currentPlanItem && !verboseItems.some((item) => item.kind === 'plan')) {
    verboseItems.push(currentPlanItem);
  }

  if (applyItem) {
    items.push(applyItem);
    verboseItems.push(applyItem);
  }

  const eventItems = dedupeActivityEvents(input.activityEvents ?? []).map((event) => buildEventActivityItem(event));
  items.push(...filterSecondaryEventItems(eventItems, items));
  verboseItems.push(...filterSecondaryEventItems(eventItems, verboseItems));

  const messageItem = buildMessageItem(input, items);
  if (messageItem) {
    items.push(messageItem);
    verboseItems.push(messageItem);
  }

  const sortedItems = sortedBy(items, compareActivityItems);
  const sortedVerboseItems = sortedBy(verboseItems, compareActivityItems);

  return {
    items: sortedItems,
    verboseItems: sortedVerboseItems,
    activeItem: pickActiveActivityItem(sortedItems),
    verboseActiveItem: pickActiveActivityItem(sortedVerboseItems),
    summary: buildSummary(sortedItems),
  };
};
