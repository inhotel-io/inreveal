import type { AgentToolName } from 'src/enum';

export type AgentMcpRequestId = string | number;

export type AgentMcpJsonObject = Record<string, unknown>;

export type AgentMcpToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export type AgentMcpToolDefinition = {
  name: AgentToolName;
  title: string;
  description: string;
  inputSchema: AgentMcpJsonObject;
  annotations: AgentMcpToolAnnotations;
};

export type AgentMcpToolsListResult = {
  tools: AgentMcpToolDefinition[];
};

export type AgentMcpError = {
  code: number;
  message: string;
  data?: unknown;
};

export type AgentMcpSuccessResponse = {
  jsonrpc: '2.0';
  id: AgentMcpRequestId;
  result: unknown;
};

export type AgentMcpErrorResponse = {
  jsonrpc: '2.0';
  id: AgentMcpRequestId | null;
  error: AgentMcpError;
};

export type AgentMcpHandleResponse = AgentMcpSuccessResponse | AgentMcpErrorResponse | undefined;

export type AgentMcpInitializeResult = {
  protocolVersion: string;
  serverInfo: {
    name: string;
    version: string;
  };
  capabilities: {
    tools: Record<string, never>;
  };
};
