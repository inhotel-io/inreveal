import {
  AgentMessageRole,
  AgentSessionStatus,
  type AgentMessageResponseDto,
  type AgentOperationPlanResponseDto,
  type AgentSessionResponseDto,
  type AgentToolCallResponseDto,
} from '@immich/sdk';
import { buildAgentActivityModel, type AgentActivityEvent, type AgentActivityModel } from './agent-activity-ui';

export type { AgentActivityEvent };

export type AgentSessionActivityTurn = {
  id: string;
  anchorMessageId: string;
  occurredAt: string;
  model: AgentActivityModel;
  coveredToolCallIds: Set<string>;
  appliedPlanKeys: Set<string>;
};

export type BuildAgentSessionActivityTurnsInput = {
  session: AgentSessionResponseDto;
  messages: AgentMessageResponseDto[];
  toolCalls: AgentToolCallResponseDto[];
  currentPlan: AgentOperationPlanResponseDto | null;
  appliedPlans: AgentOperationPlanResponseDto[];
  activityEvents?: AgentActivityEvent[];
  streamingText?: string;
  isAssistantActive?: boolean;
};

type UserTurnAnchor = {
  message: AgentMessageResponseDto;
  startAt: string;
  nextUserAt: string | null;
  terminalAssistantAt: string | null;
  isLatest: boolean;
};

const isValidActivityDate = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));

const compareByDateThenId = <T extends { id: string }>(
  getDate: (value: T) => string,
  getPriority?: (value: T) => number,
) => {
  return (first: T, second: T) =>
    getDate(first).localeCompare(getDate(second)) ||
    (getPriority?.(first) ?? 0) - (getPriority?.(second) ?? 0) ||
    first.id.localeCompare(second.id);
};

const getToolCallActivityAt = (toolCall: AgentToolCallResponseDto) => {
  if (isValidActivityDate(toolCall.startedAt)) {
    return toolCall.startedAt;
  }

  return isValidActivityDate(toolCall.completedAt) ? toolCall.completedAt : null;
};

const getPlanActivityAt = (plan: AgentOperationPlanResponseDto) => {
  if (isValidActivityDate(plan.updatedAt)) {
    return plan.updatedAt;
  }

  return isValidActivityDate(plan.createdAt) ? plan.createdAt : null;
};

const getEventActivityAt = (event: AgentActivityEvent) => (isValidActivityDate(event.createdAt) ? event.createdAt : null);

const isAtOrAfter = (value: string, boundary: string) => value >= boundary;

const isBefore = (value: string, boundary: string | null) => boundary === null || value < boundary;

const getAppliedPlanKey = (plan: AgentOperationPlanResponseDto) => `${plan.id}:${plan.revision}`;

const getCoveredToolCallIds = (model: AgentActivityModel) =>
  new Set(model.items.flatMap((item) => item.technical?.toolCallIds ?? []));

const buildStableTurnAnchors = (messages: AgentMessageResponseDto[]) => {
  const validUserMessages = messages
    .filter((message) => message.role === AgentMessageRole.User && isValidActivityDate(message.createdAt))
    .toSorted(compareByDateThenId((message) => message.createdAt));
  const validAssistantMessages = messages
    .filter((message) => message.role === AgentMessageRole.Assistant && isValidActivityDate(message.createdAt))
    .toSorted(compareByDateThenId((message) => message.createdAt));

  return validUserMessages.map((message, index): UserTurnAnchor => {
    const nextUser = validUserMessages[index + 1] ?? null;
    const terminalAssistant =
      validAssistantMessages.find(
        (assistantMessage) =>
          isAtOrAfter(assistantMessage.createdAt, message.createdAt) &&
          isBefore(assistantMessage.createdAt, nextUser?.createdAt ?? null),
      ) ?? null;

    return {
      message,
      startAt: message.createdAt,
      nextUserAt: nextUser?.createdAt ?? null,
      terminalAssistantAt: terminalAssistant?.createdAt ?? null,
      isLatest: index === validUserMessages.length - 1,
    };
  });
};

const toolCallBelongsToTurn = (
  toolCall: AgentToolCallResponseDto,
  turn: UserTurnAnchor,
  userTurnCount: number,
) => {
  const activityAt = getToolCallActivityAt(toolCall);

  if (!activityAt) {
    return userTurnCount === 1;
  }

  const turnEnd = turn.terminalAssistantAt ?? turn.nextUserAt;

  return isAtOrAfter(activityAt, turn.startAt) && isBefore(activityAt, turnEnd);
};

const appliedPlanBelongsToTurn = (plan: AgentOperationPlanResponseDto, turn: UserTurnAnchor) => {
  const activityAt = getPlanActivityAt(plan);

  if (!activityAt) {
    return false;
  }

  return isAtOrAfter(activityAt, turn.startAt) && isBefore(activityAt, turn.nextUserAt);
};

const activityEventBelongsToTurn = (event: AgentActivityEvent, turn: UserTurnAnchor) => {
  const activityAt = getEventActivityAt(event);

  if (!activityAt) {
    return false;
  }

  const turnEnd = turn.terminalAssistantAt ?? turn.nextUserAt;

  return isAtOrAfter(activityAt, turn.startAt) && isBefore(activityAt, turnEnd);
};

const dedupeActivityEvents = (events: AgentActivityEvent[]) => {
  const eventsById = new Map<string, AgentActivityEvent>();

  for (const event of events) {
    eventsById.set(event.id, event);
  }

  return [...eventsById.values()];
};

const getTurnSession = (session: AgentSessionResponseDto, turn: UserTurnAnchor, hasAppliedPlans: boolean) => {
  if (turn.isLatest) {
    if (session.status === AgentSessionStatus.Applying && hasAppliedPlans) {
      return { ...session, status: AgentSessionStatus.Running };
    }

    return session;
  }

  return { ...session, status: AgentSessionStatus.Completed };
};

export const buildAgentSessionActivityTurns = (input: BuildAgentSessionActivityTurnsInput) => {
  const anchors = buildStableTurnAnchors(input.messages);
  const activityEvents = dedupeActivityEvents(input.activityEvents ?? []);

  return anchors
    .map((turn): AgentSessionActivityTurn | null => {
      const turnToolCalls = input.toolCalls.filter((toolCall) =>
        toolCallBelongsToTurn(toolCall, turn, anchors.length),
      );
      const turnAppliedPlans = input.appliedPlans.filter((plan) => appliedPlanBelongsToTurn(plan, turn));
      const turnActivityEvents = activityEvents.filter((event) => activityEventBelongsToTurn(event, turn));
      const model = buildAgentActivityModel({
        session: getTurnSession(input.session, turn, turnAppliedPlans.length > 0),
        messages: input.messages,
        toolCalls: turnToolCalls,
        currentPlan: turn.isLatest ? input.currentPlan : null,
        appliedPlans: turnAppliedPlans,
        activityEvents: turnActivityEvents,
        streamingText: turn.isLatest ? input.streamingText : undefined,
        isAssistantActive: turn.isLatest ? input.isAssistantActive : false,
      });

      if (model.items.length === 0) {
        return null;
      }

      return {
        id: `activity-turn-${turn.message.id}`,
        anchorMessageId: turn.message.id,
        occurredAt: turn.startAt,
        model,
        coveredToolCallIds: getCoveredToolCallIds(model),
        appliedPlanKeys: new Set(turnAppliedPlans.map(getAppliedPlanKey)),
      };
    })
    .filter((turn): turn is AgentSessionActivityTurn => turn !== null);
};

export const getCoveredToolCallIdsForActivityTurns = (turns: AgentSessionActivityTurn[]) =>
  new Set(turns.flatMap((turn) => [...turn.coveredToolCallIds]));

export const getAppliedPlanKeysForActivityTurns = (turns: AgentSessionActivityTurn[]) =>
  new Set(turns.flatMap((turn) => [...turn.appliedPlanKeys]));
