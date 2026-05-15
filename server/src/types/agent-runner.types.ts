import type { AgentApprovalMode, AgentPermissionPreset } from 'src/enum';
import type { AgentMessageContent } from 'src/types/agent-message.types';
import type { AgentCredentialSnapshot, AgentPermissionPlanSnapshot } from 'src/types/agent-session.types';

export type AgentRunnerCreateSessionRequest = {
  gallerySessionId: string;
  credential: AgentCredentialSnapshot;
  model: string;
  permissionPreset: AgentPermissionPreset;
  permissionPlan: AgentPermissionPlanSnapshot;
  approvalMode: AgentApprovalMode;
  initialContext: Record<string, unknown>;
};

export type AgentRunnerCreateSessionResult = {
  runnerSessionId: string;
  capabilities: Record<string, unknown>;
};

export type AgentRunnerMessageRequest = {
  gallerySessionId: string;
  messageId: string;
  content: AgentMessageContent;
};

export type AgentRunnerStreamEvent =
  | {
      type: 'assistant-message-delta';
      sessionId: string;
      runnerSessionId: string;
      delta: string;
      sequence: number;
    }
  | {
      type: 'assistant-message-completed';
      sessionId: string;
      runnerSessionId: string;
      providerMessageId: string | null;
      content: AgentMessageContent;
    };
