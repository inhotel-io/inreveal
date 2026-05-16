import type { AgentApprovalMode, AgentPermissionPreset } from 'src/enum';
import type { AgentMessageContent } from 'src/types/agent-message.types';
import type { AgentCredentialSnapshot, AgentPermissionPlanSnapshot } from 'src/types/agent-session.types';

export type AgentRunnerCredentialMaterial = AgentCredentialSnapshot & {
  secret: string;
};

type AgentRunnerCreateSessionBase = {
  gallerySessionId: string;
  credential: AgentRunnerCredentialMaterial;
  model: string;
  permissionPreset: AgentPermissionPreset;
  permissionPlan: AgentPermissionPlanSnapshot;
  approvalMode: AgentApprovalMode;
  initialContext: Record<string, unknown>;
};

export type AgentRunnerMcpGateway = { url: string; token: string };

export type AgentRunnerCreateSessionRequest = AgentRunnerCreateSessionBase & {
  mcpGateway?: AgentRunnerMcpGateway | null;
};

export type AgentRunnerCreateSessionInput = AgentRunnerCreateSessionBase & {
  userId: string;
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
    }
  | {
      type: 'runner-error';
      sessionId: string;
      runnerSessionId: string;
      message: string;
    };
