import { BadRequestException } from '@nestjs/common';
import { AgentToolName } from 'src/enum';
import { AgentMcpJsonObject, AgentMcpRecoverableToolErrorContent } from 'src/types/agent-mcp.types';

export class AgentMcpRecoverableToolError extends BadRequestException {
  constructor(public readonly content: AgentMcpRecoverableToolErrorContent & { recovery: AgentMcpJsonObject }) {
    super(content.error);
  }
}

export const isAgentMcpRecoverableToolError = (error: unknown): error is AgentMcpRecoverableToolError =>
  error instanceof AgentMcpRecoverableToolError;

export const invalidSelectionHandleError = (input: {
  toolName: AgentToolName;
  error: string;
  hint: string;
  recovery: AgentMcpJsonObject;
}) =>
  new AgentMcpRecoverableToolError({
    status: 'error',
    error: input.error,
    toolName: input.toolName,
    retryable: true,
    hint: input.hint,
    recovery: input.recovery,
  });
