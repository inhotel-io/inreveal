import {
  AgentToolApprovalDecision,
  AgentToolCallStatus,
  AgentToolDataClass,
  AgentToolName,
  type AgentToolApprovalDto,
  type AgentToolCallResponseDto,
} from '@immich/sdk';
import type { Translations } from 'svelte-i18n';

const toolNameLabelKeys: Record<AgentToolName, Translations> = {
  [AgentToolName.SearchAssets]: 'assistant_agent_tool_name_searchAssets',
  [AgentToolName.ReadAssetMetadata]: 'assistant_agent_tool_name_readAssetMetadata',
  [AgentToolName.ReadAssetPreviews]: 'assistant_agent_tool_name_readAssetPreviews',
  [AgentToolName.ReadAssetOriginals]: 'assistant_agent_tool_name_readAssetOriginals',
  [AgentToolName.ListAlbums]: 'assistant_agent_tool_name_listAlbums',
  [AgentToolName.ReadAlbum]: 'assistant_agent_tool_name_readAlbum',
  [AgentToolName.ProposeAlbumOperations]: 'assistant_agent_tool_name_proposeAlbumOperations',
  [AgentToolName.ReviseProposedOperations]: 'assistant_agent_tool_name_reviseProposedOperations',
  [AgentToolName.SummarizePlan]: 'assistant_agent_tool_name_summarizePlan',
};

const dataClassLabelKeys: Record<AgentToolDataClass, Translations> = {
  metadata: 'assistant_agent_tool_data_class_metadata',
  previews: 'assistant_agent_tool_data_class_previews',
  originals: 'assistant_agent_tool_data_class_originals',
  plan: 'assistant_agent_tool_data_class_plan',
};

const handledStatuses = new Set<AgentToolCallStatus>([
  AgentToolCallStatus.Denied,
  AgentToolCallStatus.Completed,
  AgentToolCallStatus.Failed,
]);

export const getAgentToolNameLabelKey = (toolName: AgentToolName) => toolNameLabelKeys[toolName] ?? toolName;

export const getAgentToolDataClassLabelKey = (dataClass: AgentToolDataClass) =>
  dataClassLabelKeys[dataClass] ?? dataClass;

export const getPendingToolCalls = (toolCalls: AgentToolCallResponseDto[]) =>
  toolCalls
    .filter((toolCall) => toolCall.status === AgentToolCallStatus.PendingApproval)
    .sort((first, second) => first.startedAt.localeCompare(second.startedAt) || first.id.localeCompare(second.id));

export const getRecentToolCalls = (toolCalls: AgentToolCallResponseDto[]) =>
  toolCalls
    .filter((toolCall) => handledStatuses.has(toolCall.status))
    .sort((first, second) => {
      const firstTime = first.completedAt ?? first.startedAt;
      const secondTime = second.completedAt ?? second.startedAt;
      return secondTime.localeCompare(firstTime) || second.id.localeCompare(first.id);
    });

export const buildToolApprovalPayload = (
  decision: AgentToolApprovalDecision,
  reason?: string,
): AgentToolApprovalDto => {
  const trimmedReason = reason?.trim();

  return {
    decision,
    ...(decision === AgentToolApprovalDecision.Denied && trimmedReason ? { reason: trimmedReason } : {}),
  };
};
