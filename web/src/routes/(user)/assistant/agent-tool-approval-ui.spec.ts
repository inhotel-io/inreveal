import {
  AgentToolApprovalDecision,
  AgentToolCallStatus,
  AgentToolDataClass,
  AgentToolName,
  type AgentToolCallResponseDto,
} from '@immich/sdk';
import {
  buildToolApprovalPayload,
  getAgentToolCallCompletedText,
  getAgentToolCallPendingText,
  getAgentToolDataClassLabelKey,
  getAgentToolNameLabelKey,
  getPendingToolCalls,
  getRecentToolCalls,
} from './agent-tool-approval-ui';

const toolCall = (overrides: Partial<AgentToolCallResponseDto> = {}): AgentToolCallResponseDto => ({
  id: overrides.id ?? 'tool-call-1',
  sessionId: overrides.sessionId ?? 'session-1',
  toolName: overrides.toolName ?? AgentToolName.SearchAssets,
  status: overrides.status ?? AgentToolCallStatus.PendingApproval,
  approvalDecision: overrides.approvalDecision ?? null,
  requestSummary: overrides.requestSummary ?? 'Search assets',
  responseSummary: overrides.responseSummary ?? null,
  dataClass: overrides.dataClass ?? AgentToolDataClass.Metadata,
  assetCount: overrides.assetCount ?? 0,
  albumCount: overrides.albumCount ?? 0,
  startedAt: overrides.startedAt ?? '2026-05-16T10:00:00.000Z',
  completedAt: overrides.completedAt ?? null,
  error: overrides.error ?? null,
});

describe('agent tool approval UI helpers', () => {
  it('maps every current tool name to a label key', () => {
    for (const toolName of Object.values(AgentToolName)) {
      expect(getAgentToolNameLabelKey(toolName)).toBe(`assistant_agent_tool_name_${toolName}`);
    }
  });

  it('maps space tools to labels and user-facing pending/completed copy', () => {
    const listSpaces = toolCall({ toolName: AgentToolName.ListSpaces });
    const readSpace = toolCall({ toolName: AgentToolName.ReadSpace });

    expect(getAgentToolNameLabelKey(AgentToolName.ListSpaces)).toBe('assistant_agent_tool_name_listSpaces');
    expect(getAgentToolNameLabelKey(AgentToolName.ReadSpace)).toBe('assistant_agent_tool_name_readSpace');
    expect(getAgentToolCallPendingText(listSpaces)).toBe('Pi wants to check your spaces.');
    expect(getAgentToolCallPendingText(readSpace)).toBe('Pi wants to inspect a space.');
    expect(getAgentToolCallCompletedText(listSpaces)).toBe('Pi checked your spaces.');
    expect(getAgentToolCallCompletedText(readSpace)).toBe('Pi inspected a space.');
  });

  it('maps every current data class to a label key', () => {
    for (const dataClass of Object.values(AgentToolDataClass)) {
      expect(getAgentToolDataClassLabelKey(dataClass)).toBe(`assistant_agent_tool_data_class_${dataClass}`);
    }
  });

  it('falls back to the raw value for unknown future tool and data class values', () => {
    expect(getAgentToolNameLabelKey('futureTool' as AgentToolName)).toBe('futureTool');
    expect(getAgentToolDataClassLabelKey('futureClass' as AgentToolDataClass)).toBe('futureClass');
  });

  it('groups only pending approval calls as pending and sorts by started time then id', () => {
    const calls = [
      toolCall({ id: 'pending-c', startedAt: '2026-05-16T10:00:00.000Z' }),
      toolCall({ id: 'executing', status: AgentToolCallStatus.Executing }),
      toolCall({ id: 'pending-a', startedAt: '2026-05-16T09:00:00.000Z' }),
      toolCall({ id: 'pending-b', startedAt: '2026-05-16T09:00:00.000Z' }),
      toolCall({ id: 'approved', status: AgentToolCallStatus.Approved }),
      toolCall({ id: 'completed', status: AgentToolCallStatus.Completed }),
    ];

    expect(getPendingToolCalls(calls).map(({ id }) => id)).toEqual(['pending-a', 'pending-b', 'pending-c']);
  });

  it('groups handled calls as recent and sorts by completed or started time then id descending', () => {
    const calls = [
      toolCall({
        id: 'completed-b',
        status: AgentToolCallStatus.Completed,
        startedAt: '2026-05-16T07:00:00.000Z',
        completedAt: '2026-05-16T11:00:00.000Z',
      }),
      toolCall({ id: 'pending', status: AgentToolCallStatus.PendingApproval }),
      toolCall({ id: 'approved', status: AgentToolCallStatus.Approved }),
      toolCall({ id: 'executing', status: AgentToolCallStatus.Executing }),
      toolCall({
        id: 'failed-z',
        status: AgentToolCallStatus.Failed,
        startedAt: '2026-05-16T12:00:00.000Z',
      }),
      toolCall({
        id: 'denied-a',
        status: AgentToolCallStatus.Denied,
        startedAt: '2026-05-16T10:00:00.000Z',
        completedAt: '2026-05-16T11:00:00.000Z',
      }),
      toolCall({
        id: 'completed-a',
        status: AgentToolCallStatus.Completed,
        startedAt: '2026-05-16T07:00:00.000Z',
        completedAt: '2026-05-16T11:00:00.000Z',
      }),
    ];

    expect(getRecentToolCalls(calls).map(({ id }) => id)).toEqual([
      'failed-z',
      'denied-a',
      'completed-b',
      'completed-a',
      'approved',
    ]);
  });

  it('builds approve and deny payloads', () => {
    expect(buildToolApprovalPayload(AgentToolApprovalDecision.Approved)).toEqual({
      decision: AgentToolApprovalDecision.Approved,
    });
    expect(buildToolApprovalPayload(AgentToolApprovalDecision.Denied, '  Use fewer assets  ')).toEqual({
      decision: AgentToolApprovalDecision.Denied,
      reason: 'Use fewer assets',
    });
    expect(buildToolApprovalPayload(AgentToolApprovalDecision.Denied, '   ')).toEqual({
      decision: AgentToolApprovalDecision.Denied,
    });
    expect(buildToolApprovalPayload(AgentToolApprovalDecision.Denied)).toEqual({
      decision: AgentToolApprovalDecision.Denied,
    });
  });
});
