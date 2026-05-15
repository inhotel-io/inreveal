import { AgentPermissionPreset, AgentProviderType } from 'src/enum';

export type AgentCredentialSnapshot = {
  id: string;
  providerType: AgentProviderType;
  label: string;
  baseUrl: string | null;
  models: string[];
  defaultModel: string | null;
};

export type AgentModelSnapshot = {
  providerCredentialId: string;
  model: string;
};

export type AgentRunnerCapabilitiesSnapshot = Record<string, unknown> | null;

export type AgentPermissionPlanSnapshot = {
  read: {
    metadata: boolean;
    previews: boolean;
    originals: boolean;
  };
  providerExposure: {
    metadata: boolean;
    previews: boolean;
    originals: boolean;
    allowOriginalsForExternalProviders: boolean;
  };
  assetScope: {
    owned: boolean;
    sharedSpaces: boolean;
    locked: boolean;
  };
  writeScope: {
    createAlbum: boolean;
    addAssets: boolean;
    updateDetails: boolean;
    setCover: boolean;
  };
  limits: {
    maxAssetsPerToolCall: number;
    maxAssetsPerSession: number;
    maxPreviewsPerToolCall: number;
    maxPreviewsPerSession?: number;
    maxOriginalsPerToolCall: number;
    maxOriginalsPerSession?: number;
    expiresInMinutes: number | null;
  };
};

export type AgentInitialContextSnapshot = Record<string, unknown>;

export type AgentPermissionPresetMap = Record<
  Exclude<AgentPermissionPreset, AgentPermissionPreset.Custom>,
  AgentPermissionPlanSnapshot
>;
