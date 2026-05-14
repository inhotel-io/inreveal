import { AgentProviderType, AssetType, AssetVisibility } from 'src/enum';

export type AgentToolProviderSnapshot = {
  providerCredentialId: string | null;
  providerType: AgentProviderType;
  label: string;
  baseUrl: string | null;
  model: string;
};

export type AgentToolReadAssetMetadataRequestMetadata = {
  assetIds: string[];
};

export type AgentToolReadAssetMetadataResponseMetadata = {
  assetIds: string[];
};

export type AgentAssetMetadata = {
  id: string;
  ownerId: string;
  type: AssetType;
  originalFileName: string;
  localDateTime: Date;
  fileCreatedAt: Date;
  fileModifiedAt: Date;
  isFavorite: boolean;
  visibility: AssetVisibility;
  exifInfo: {
    dateTimeOriginal: Date | null;
    city: string | null;
    state: string | null;
    country: string | null;
    make: string | null;
    model: string | null;
    lensModel: string | null;
    latitude: number | null;
    longitude: number | null;
    rating: number | null;
  } | null;
  tags: Array<{
    id: string;
    value: string;
    color: string | null;
  }>;
};
