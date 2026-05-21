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

export type AgentSearchAssetsMode = 'metadata' | 'smart' | 'description' | 'ocr' | 'filename';

export type AgentSearchAssetsOrder = 'asc' | 'desc' | 'relevance';

export type AgentToolSearchAssetsRequestMetadata = {
  mode: AgentSearchAssetsMode;
  query?: string;
  filters: AgentSearchAssetsFilters;
  limit: number;
  page: number;
  order?: AgentSearchAssetsOrder;
};

export type AgentResolveAssetSearchFiltersScope = {
  spaceId?: string;
  withSharedSpaces?: boolean;
  takenAfter?: Date;
  takenBefore?: Date;
};

export type AgentToolResolveAssetSearchFiltersRequestMetadata = {
  people?: string[];
  tags?: string[];
  albums?: string[];
  spaces?: string[];
  cameraMakes?: string[];
  cameraModels?: string[];
  lensModels?: string[];
  scope?: AgentResolveAssetSearchFiltersScope;
};

export type AgentToolReadAssetIdsRequestMetadata = {
  assetIds: string[];
};

export type AgentToolReadAlbumRequestMetadata = {
  albumId: string;
};

export type AgentToolListAlbumsRequestMetadata = Record<string, never>;

export type AgentToolReadSpaceRequestMetadata = {
  spaceId: string;
};

export type AgentToolListSpacesRequestMetadata = Record<string, never>;

export type AgentToolSearchUsersRequestMetadata = {
  query: string;
  limit: number;
};

export type AgentToolResponseIdsMetadata = {
  assetIds?: string[];
  albumIds?: string[];
  spaceIds?: string[];
  userIds?: string[];
};

export type AgentToolOperationPlanRequestMetadata = {
  planId?: string;
  operationCount: number;
  operationTypes: string[];
  albumIds: string[];
  spaceIds?: string[];
  tagIds?: string[];
  userIds?: string[];
  assetIds: string[];
};

export type AgentToolOperationPlanResponseMetadata = {
  planId: string | null;
  operationIds: string[];
};

export type AgentSearchAssetsFilters = {
  takenAfter?: Date;
  takenBefore?: Date;
  createdAfter?: Date;
  createdBefore?: Date;
  updatedAfter?: Date;
  updatedBefore?: Date;
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
  personIds?: string[];
  spaceId?: string;
  spacePersonIds?: string[];
  withSharedSpaces?: boolean;
  visibility?: AssetVisibility;
};

export type AgentResolvedAssetSearchFilterKind =
  | 'person'
  | 'tag'
  | 'album'
  | 'space'
  | 'cameraMake'
  | 'cameraModel'
  | 'lensModel';

export type AgentResolvedAssetSearchFilterStatus = 'matched' | 'ambiguous' | 'not_found';

export type AgentResolvedAssetSearchFilterChoice = {
  id?: string;
  value: string;
  label: string;
  searchFilter?: Partial<AgentSearchAssetsFilters>;
};

export type AgentResolvedAssetSearchFilterResult = {
  kind: AgentResolvedAssetSearchFilterKind;
  query: string;
  status: AgentResolvedAssetSearchFilterStatus;
  value?: string;
  id?: string;
  searchFilter?: Partial<AgentSearchAssetsFilters>;
  choices: AgentResolvedAssetSearchFilterChoice[];
  message: string;
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

export type AgentSpaceMemberSummary = {
  userId: string;
  name: string;
  role: string;
  avatarColor: string | null;
  profileImagePath: string | null;
};

export type AgentSpaceSummary = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  createdById: string;
  assetCount: number;
  memberCount: number;
  thumbnailAssetId: string | null;
  recentAssetIds: string[];
};

export type AgentSpaceDetail = AgentSpaceSummary & {
  members: AgentSpaceMemberSummary[];
  assetIds: string[];
  assetIdsReturned: number;
  assetIdsTruncated: boolean;
};

export type AgentUserLookupResult = {
  userId: string;
  name: string;
  email: string | null;
  avatarColor: string | null;
  profileImagePath: string | null;
};

export type AgentToolRequestMetadata =
  | AgentToolSearchAssetsRequestMetadata
  | AgentToolResolveAssetSearchFiltersRequestMetadata
  | AgentToolReadAssetIdsRequestMetadata
  | AgentToolReadAlbumRequestMetadata
  | AgentToolListAlbumsRequestMetadata
  | AgentToolReadSpaceRequestMetadata
  | AgentToolListSpacesRequestMetadata
  | AgentToolSearchUsersRequestMetadata
  | AgentToolOperationPlanRequestMetadata;

export type AgentToolResponseMetadata = AgentToolResponseIdsMetadata | AgentToolOperationPlanResponseMetadata;

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
