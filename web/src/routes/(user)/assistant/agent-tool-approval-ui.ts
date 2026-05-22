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
  [AgentToolName.ResolveAssetSearchFilters]: 'assistant_agent_tool_name_resolveAssetSearchFilters',
  [AgentToolName.ReadAssetMetadata]: 'assistant_agent_tool_name_readAssetMetadata',
  [AgentToolName.ReadAssetPreviews]: 'assistant_agent_tool_name_readAssetPreviews',
  [AgentToolName.ReadAssetOriginals]: 'assistant_agent_tool_name_readAssetOriginals',
  [AgentToolName.ListAlbums]: 'assistant_agent_tool_name_listAlbums',
  [AgentToolName.ReadAlbum]: 'assistant_agent_tool_name_readAlbum',
  [AgentToolName.ListSpaces]: 'assistant_agent_tool_name_listSpaces',
  [AgentToolName.ReadSpace]: 'assistant_agent_tool_name_readSpace',
  [AgentToolName.SearchUsers]: 'assistant_agent_tool_name_searchUsers',
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
  AgentToolCallStatus.Approved,
  AgentToolCallStatus.Denied,
  AgentToolCallStatus.Completed,
  AgentToolCallStatus.Failed,
]);

const timelineStatuses = new Set<AgentToolCallStatus>([
  AgentToolCallStatus.PendingApproval,
  AgentToolCallStatus.Approved,
  AgentToolCallStatus.Executing,
  AgentToolCallStatus.Completed,
  AgentToolCallStatus.Failed,
  AgentToolCallStatus.Denied,
]);

export const getAgentToolNameLabelKey = (toolName: AgentToolName) => toolNameLabelKeys[toolName] ?? toolName;

export const getAgentToolDataClassLabelKey = (dataClass: AgentToolDataClass) =>
  dataClassLabelKeys[dataClass] ?? dataClass;

const pendingActionText: Partial<Record<AgentToolName, string>> = {
  [AgentToolName.SearchAssets]: 'Pi wants to search your photos.',
  [AgentToolName.ResolveAssetSearchFilters]: 'Pi wants to match your search terms to gallery filters.',
  [AgentToolName.SearchUsers]: 'Pi wants to find visible Gallery users.',
  [AgentToolName.ReadAssetMetadata]: 'Pi wants to read photo details.',
  [AgentToolName.ReadAssetPreviews]: 'Pi wants to view photo previews.',
  [AgentToolName.ReadAssetOriginals]: 'Pi wants to open original files.',
  [AgentToolName.ListAlbums]: 'Pi wants to check your albums.',
  [AgentToolName.ReadAlbum]: 'Pi wants to inspect an album.',
  [AgentToolName.ListSpaces]: 'Pi wants to check your spaces.',
  [AgentToolName.ReadSpace]: 'Pi wants to inspect a space.',
  [AgentToolName.ProposeAlbumOperations]: 'Pi wants to draft album changes.',
  [AgentToolName.ReviseProposedOperations]: 'Pi wants to revise album changes.',
  [AgentToolName.SummarizePlan]: 'Pi wants to summarize the plan.',
};

const completedActionText: Partial<Record<AgentToolName, string>> = {
  [AgentToolName.SearchAssets]: 'Pi searched your photos.',
  [AgentToolName.ResolveAssetSearchFilters]: 'Pi matched your search terms to gallery filters.',
  [AgentToolName.ReadAssetMetadata]: 'Pi read photo details.',
  [AgentToolName.ReadAssetPreviews]: 'Pi viewed photo previews.',
  [AgentToolName.ReadAssetOriginals]: 'Pi opened original files.',
  [AgentToolName.ListAlbums]: 'Pi checked your albums.',
  [AgentToolName.ReadAlbum]: 'Pi inspected an album.',
  [AgentToolName.ListSpaces]: 'Pi checked your spaces.',
  [AgentToolName.ReadSpace]: 'Pi inspected a space.',
  [AgentToolName.ProposeAlbumOperations]: 'Pi drafted album changes.',
  [AgentToolName.ReviseProposedOperations]: 'Pi revised album changes.',
  [AgentToolName.SummarizePlan]: 'Pi summarized the plan.',
};

const pluralize = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

export const getAgentToolCallScopeText = (toolCall: AgentToolCallResponseDto) => {
  const parts = [
    toolCall.assetCount > 0 ? pluralize(toolCall.assetCount, 'photo', 'photos') : null,
    toolCall.albumCount > 0 ? pluralize(toolCall.albumCount, 'album', 'albums') : null,
  ].filter(Boolean);

  if (parts.length === 0) {
    return 'no photos and no albums';
  }

  return parts.join(' and ');
};

export const getAgentToolCallPendingText = (toolCall: AgentToolCallResponseDto) =>
  pendingActionText[toolCall.toolName] ?? 'Pi wants to use your gallery.';

export const getAgentToolCallCompletedText = (toolCall: AgentToolCallResponseDto) =>
  completedActionText[toolCall.toolName] ?? 'Pi used your gallery.';

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

export const getTimelineToolCalls = (toolCalls: AgentToolCallResponseDto[]) =>
  toolCalls
    .filter((toolCall) => timelineStatuses.has(toolCall.status))
    .sort((first, second) => first.startedAt.localeCompare(second.startedAt) || first.id.localeCompare(second.id));

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
