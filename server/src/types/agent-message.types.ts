export type AgentMessageTextBlock = {
  type: 'text';
  text: string;
};

export type AgentMessageToolCallBlock = {
  type: 'tool-call';
  toolCallId: string;
  summary?: string;
};

export type AgentMessageAssetBlock = {
  type: 'asset';
  assetId: string;
  label?: string;
};

export type AgentMessagePlanBlock = {
  type: 'plan';
  planId: string;
  label?: string;
};

export type AgentMessageBlock =
  | AgentMessageTextBlock
  | AgentMessageToolCallBlock
  | AgentMessageAssetBlock
  | AgentMessagePlanBlock;

export type AgentMessageContent = {
  blocks: AgentMessageBlock[];
};
