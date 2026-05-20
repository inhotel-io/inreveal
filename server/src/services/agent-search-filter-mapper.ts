import { type AgentSearchAssetsToolRequestDto } from 'src/dtos/agent-tool.dto';
import { type MetadataSearchDto } from 'src/dtos/search.dto';
import { AssetOrder } from 'src/enum';
import { type AssetSearchOptions, type SearchPaginationOptions } from 'src/repositories/search.repository';

type AgentSearchExecutionScope = {
  owned: boolean;
  sharedSpaces: boolean;
  locked: boolean;
  timelineSpaceIds: string[];
};

export type AgentMetadataSearchBuildInput = {
  userId: string;
  request: AgentSearchAssetsToolRequestDto;
  scope: AgentSearchExecutionScope;
};

export type AgentMetadataSearchBuildResult = {
  pagination: SearchPaginationOptions;
  options: AssetSearchOptions;
};

const nonEmpty = <T>(values: T[] | undefined): T[] | undefined => (values && values.length > 0 ? values : undefined);

const omitUndefined = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, property]) => property !== undefined)) as T;

export const buildAgentMetadataSearch = ({
  userId,
  request,
  scope,
}: AgentMetadataSearchBuildInput): AgentMetadataSearchBuildResult => {
  const filters = request.filters ?? {};
  const limit = request.limit ?? 10_000;
  const page = request.page ?? 1;
  const hasAlbumFilter = (filters.albumIds?.length ?? 0) > 0;
  const wantsBroadSharedScope = filters.spaceId
    ? false
    : filters.withSharedSpaces === true ||
      (!scope.owned && scope.sharedSpaces) ||
      (hasAlbumFilter && scope.sharedSpaces);
  const timelineSpaceIds = wantsBroadSharedScope ? scope.timelineSpaceIds : undefined;
  const hasTimelineSpaces = !!timelineSpaceIds && timelineSpaceIds.length > 0;

  const galleryDto = omitUndefined({
    type: filters.type,
    isFavorite: filters.isFavorite,
    isNotInAlbum: filters.isNotInAlbum,
    takenAfter: filters.takenAfter,
    takenBefore: filters.takenBefore,
    createdAfter: filters.createdAfter,
    createdBefore: filters.createdBefore,
    updatedAfter: filters.updatedAfter,
    updatedBefore: filters.updatedBefore,
    city: filters.city,
    state: filters.state,
    country: filters.country,
    make: filters.make,
    model: filters.model,
    lensModel: filters.lensModel,
    rating: filters.rating,
    tagIds: nonEmpty(filters.tagIds),
    albumIds: nonEmpty(filters.albumIds),
    personIds: nonEmpty(filters.personIds),
    spaceId: filters.spaceId,
    spacePersonIds: nonEmpty(filters.spacePersonIds),
    visibility: filters.visibility,
    order: AssetOrder.Desc,
    page,
    size: limit,
  } satisfies Partial<MetadataSearchDto>);

  const options = omitUndefined({
    ...galleryDto,
    orderDirection: AssetOrder.Desc,
    userIds: filters.spaceId ? undefined : scope.owned ? [userId] : wantsBroadSharedScope ? [] : [userId],
    timelineSpaceIds: hasTimelineSpaces ? timelineSpaceIds : undefined,
    forceEmptyResult: wantsBroadSharedScope && !hasTimelineSpaces ? true : undefined,
  } satisfies Partial<AssetSearchOptions>) as AssetSearchOptions;

  return {
    pagination: { page, size: limit },
    options,
  };
};
