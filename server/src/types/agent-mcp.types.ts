export type AgentMcpRequestId = string | number;

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
  capabilities: Record<string, never>;
};
