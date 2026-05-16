import {
  AgentOperationPlanStatus,
  AgentOperationRiskLevel,
  AgentOperationStatus,
  AgentOperationTargetKind,
  AgentOperationType,
} from 'src/enum';

export type AgentOperationPayload = Record<string, unknown>;

export type AgentOperationAssetResult = {
  id: string;
  success: boolean;
  error?: string;
  errorMessage?: string;
};

export type AgentOperationAssetResult = {
  id: string;
  success: boolean;
  error?: string;
  errorMessage?: string;
};

export type AgentOperationResult = {
  albumId?: string;
  spaceId?: string;
  tagId?: string;
  assetIds?: string[];
  assetResults?: AgentOperationAssetResult[];
  skippedReason?: string;
};

export type AgentAlbumOperationInput = {
  type: AgentOperationType;
  summary: string;
  targetKind: AgentOperationTargetKind;
  targetId?: string;
  temporaryTargetId?: string;
  assetIds?: string[];
  payload?: AgentOperationPayload;
  dependencyIds?: string[];
  riskLevel: AgentOperationRiskLevel;
  enabled: boolean;
};

export type AgentOperationPlanCreate = {
  sessionId: string;
  revision: number;
  status: AgentOperationPlanStatus;
  summary: string;
};

export type AgentOperationCreate = {
  planId: string;
  type: AgentOperationType;
  summary: string;
  targetKind: AgentOperationTargetKind;
  targetId: string | null;
  temporaryTargetId: string | null;
  assetIds: string[];
  payload: AgentOperationPayload;
  dependencyIds: string[];
  riskLevel: AgentOperationRiskLevel;
  enabled: boolean;
  status: AgentOperationStatus;
  result: AgentOperationResult | null;
  error: string | null;
};
