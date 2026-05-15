import { AgentProviderType, AssetType, AssetVisibility } from 'src/enum';

export type AgentToolProviderSnapshot = {
  providerCredentialId: string | null;
  providerType: AgentProviderType;
  label: string;
  baseUrl: string | null;
  model: string;
};

export type AgentToolReadAssetMetadataRequestMetadata = AgentToolReadAssetIdsRequestMetadata;

export type AgentToolReadAssetMetadataResponseMetadata = AgentToolResponseIdsMetadata;

export type AgentToolSearchAssetsRequestMetadata = {
  filters: AgentSearchAssetsFilters;
  limit: number;
};

export type AgentToolReadAssetIdsRequestMetadata = {
  assetIds: string[];
};

export type AgentToolReadAlbumRequestMetadata = {
  albumId: string;
};

export type AgentToolListAlbumsRequestMetadata = Record<string, never>;

export type AgentToolResponseIdsMetadata = {
  assetIds?: string[];
  albumIds?: string[];
};

export type AgentSearchAssetsFilters = {
  takenAfter?: Date;
  takenBefore?: Date;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  make?: string | null;
  model?: string | null;
  lensModel?: string | null;
  isFavorite?: boolean;
  isNotInAlbum?: boolean;
  type?: AssetType;
  rating?: number | null;
  tagIds?: string[];
  albumIds?: string[];
};

export type AgentAssetMediaReference = {
  assetId: string;
  mediaUrl: string;
  mimeType: string;
  fileName: string;
  width: number | null;
  height: number | null;
};

export type AgentAlbumSummary = {
  id: string;
  albumName: string;
  description: string;
  ownerId: string;
  assetCount: number;
  startDate: Date | null;
  endDate: Date | null;
  albumThumbnailAssetId: string | null;
};

export type AgentAlbumDetail = AgentAlbumSummary & {
  assetIds: string[];
};

export type AgentToolRequestMetadata =
  | AgentToolSearchAssetsRequestMetadata
  | AgentToolReadAssetIdsRequestMetadata
  | AgentToolReadAlbumRequestMetadata
  | AgentToolListAlbumsRequestMetadata;

export type AgentToolResponseMetadata = AgentToolResponseIdsMetadata;

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
