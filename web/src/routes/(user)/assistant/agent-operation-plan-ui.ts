import {
  AgentOperationRiskLevel,
  AgentOperationTargetKind,
  AgentOperationType,
  type AgentOperationPlanResponseDto,
  type AgentOperationResponseDto,
} from '@immich/sdk';
import type { Translations } from 'svelte-i18n';

export type OperationEnabledState = Record<string, boolean>;

export type AgentOperationSelectionPayload = {
  planId: string;
  operationIds: string[];
};

export type AgentReviewDestinationKind = 'album' | 'space' | 'assetBatch' | 'library' | 'imageEditBatch';

export type AgentReviewDestination = {
  kind: AgentReviewDestinationKind;
  id?: string;
  temporaryId?: string;
  name: string;
  subtitle?: string;
};

export type AgentReviewItemKind = 'asset' | 'album' | 'space' | 'person' | 'tag';

export type AgentReviewSelectionMode = 'all' | 'allExcept' | 'only' | 'none';

export type AgentReviewSelection = {
  itemKind: AgentReviewItemKind;
  totalCount: number;
  selectedCount: number;
  mode: AgentReviewSelectionMode;
  itemIds?: string[];
  supportsItemSelection: boolean;
};

export type AgentReviewThumbnailSummary = {
  totalCount: number;
  representativeAssetIds: string[];
  hasMore: boolean;
};

export type AgentReviewDependency = {
  operationId: string;
  summary: string;
  blocked: boolean;
};

export type AgentOperationReview = {
  operationId: string;
  operationType: string;
  destination: AgentReviewDestination;
  summary: string;
  riskLevel: AgentOperationRiskLevel | string;
  selection: AgentReviewSelection;
  thumbnails: AgentReviewThumbnailSummary;
  dependencies: AgentReviewDependency[];
};

export type OperationReviewDestination = AgentReviewDestination & {
  title: string;
  subtitle: string;
};

export type OperationReviewItem = {
  id: string;
  operation: AgentOperationResponseDto;
  review: AgentOperationReview;
  summary: string;
  risk: AgentOperationRiskLevel | string;
  selected: boolean;
  enabled: boolean;
  blocked: boolean;
  blockedBy: string[];
  typeLabelKey: Translations;
  riskLabelKey: Translations;
  assetCount: number;
  representativeAssetIds: string[];
};

export type OperationReviewGroup = {
  id: string;
  title: string;
  subtitle: string;
  destination: OperationReviewDestination;
  assetCount: number;
  thumbnailSummary: AgentReviewThumbnailSummary;
  representativeAssetIds: string[];
  operations: OperationReviewItem[];
};

export type OperationReviewModel = {
  plan: AgentOperationPlanResponseDto;
  groups: OperationReviewGroup[];
  operationsById: Map<string, OperationReviewItem>;
};

const typeLabelKeys = {
  [AgentOperationType.AlbumCreate]: 'assistant_operation_type_album_create' as Translations,
  [AgentOperationType.AlbumAddAssets]: 'assistant_operation_type_album_add_assets' as Translations,
  [AgentOperationType.AlbumUpdateDetails]: 'assistant_operation_type_album_update_details' as Translations,
  [AgentOperationType.AlbumSetCover]: 'assistant_operation_type_album_set_cover' as Translations,
} satisfies Record<AgentOperationType, Translations>;

const riskLabelKeys = {
  [AgentOperationRiskLevel.Low]: 'assistant_operation_risk_low' as Translations,
  [AgentOperationRiskLevel.Medium]: 'assistant_operation_risk_medium' as Translations,
  [AgentOperationRiskLevel.High]: 'assistant_operation_risk_high' as Translations,
} satisfies Record<AgentOperationRiskLevel, Translations>;

const fallbackTypeLabelKey = 'assistant_operation_type_unknown' as Translations;
const fallbackRiskLabelKey = 'assistant_operation_risk_unknown' as Translations;
const representativeAssetLimit = 12;

export const createInitialOperationEnabledState = (plan: AgentOperationPlanResponseDto): OperationEnabledState =>
  Object.fromEntries(plan.operations.map((operation) => [operation.id, operation.enabled]));

export const getOperationAssetCount = (operations: Pick<AgentOperationResponseDto, 'assetIds'>[]) =>
  new Set(operations.flatMap((operation) => operation.assetIds)).size;

export const buildGroupEnabledState = (
  enabledByOperationId: OperationEnabledState,
  group: OperationReviewGroup,
  enabled: boolean,
): OperationEnabledState => ({
  ...enabledByOperationId,
  ...Object.fromEntries(group.operations.map((operation) => [operation.id, enabled])),
});

export const buildApprovedOperationIds = (model: OperationReviewModel) =>
  model.plan.operations
    .map((operation) => model.operationsById.get(operation.id))
    .filter((operation): operation is OperationReviewItem => operation !== undefined)
    .filter((operation) => operation.enabled && !operation.blocked)
    .map((operation) => operation.id);

export const buildSelectionPayload = (model: OperationReviewModel): AgentOperationSelectionPayload => ({
  planId: model.plan.id,
  operationIds: buildApprovedOperationIds(model),
});

export const buildOperationReviewModel = (
  plan: AgentOperationPlanResponseDto,
  enabledByOperationId: OperationEnabledState,
): OperationReviewModel => {
  const operationById = new Map(plan.operations.map((operation) => [operation.id, operation]));
  const blockedByCache = new Map<string, string[]>();

  const collectBlockingDependencySummaries = (
    operation: AgentOperationResponseDto,
    visitedOperationIds = new Set<string>(),
  ): string[] => {
    const cached = blockedByCache.get(operation.id);
    if (cached) {
      return cached;
    }

    const blockedBy: string[] = [];
    const nextVisitedOperationIds = new Set([...visitedOperationIds, operation.id]);

    for (const dependencyId of operation.dependencyIds) {
      const dependency = operationById.get(dependencyId);
      if (!dependency) {
        blockedBy.push('Missing dependency');
        continue;
      }

      if (visitedOperationIds.has(dependency.id)) {
        blockedBy.push(dependency.summary);
        continue;
      }

      const dependencyBlockedBy = collectBlockingDependencySummaries(dependency, nextVisitedOperationIds);
      const dependencyEnabled = enabledByOperationId[dependency.id] ?? dependency.enabled;

      if (!dependencyEnabled || dependencyBlockedBy.length > 0) {
        blockedBy.push(dependency.summary);
      }
    }

    blockedByCache.set(operation.id, blockedBy);
    return blockedBy;
  };

  const items = plan.operations.map((operation) => {
    const blockedBy = collectBlockingDependencySummaries(operation);
    const blocked = blockedBy.length > 0;
    const selected = enabledByOperationId[operation.id] ?? operation.enabled;
    const review = buildOperationReview(
      operation,
      operationById,
      enabledByOperationId,
      (dependency) => collectBlockingDependencySummaries(dependency).length > 0,
      selected,
      blocked,
    );

    return {
      id: operation.id,
      operation,
      review,
      summary: review.summary,
      risk: review.riskLevel,
      selected,
      enabled: !blocked && selected,
      blocked,
      blockedBy,
      typeLabelKey: typeLabelKeys[operation.type] ?? fallbackTypeLabelKey,
      riskLabelKey: riskLabelKeys[operation.riskLevel] ?? fallbackRiskLabelKey,
      assetCount: review.selection.totalCount,
      representativeAssetIds: review.thumbnails.representativeAssetIds,
    };
  });

  const groupsById = new Map<string, OperationReviewGroup>();

  for (const item of items) {
    const groupId = getGroupId(item.operation);
    const group = groupsById.get(groupId) ?? {
      id: groupId,
      title: getGroupTitle(item.operation),
      subtitle: '',
      destination: getDestination(item.operation, operationById, ''),
      assetCount: 0,
      thumbnailSummary: { totalCount: 0, representativeAssetIds: [], hasMore: false },
      representativeAssetIds: [],
      operations: [],
    };

    const operations = [...group.operations, item];
    const subtitle = `${operations.length} ${operations.length === 1 ? 'operation' : 'operations'}`;
    const thumbnailSummary = getThumbnailSummary(operations.map(({ operation }) => operation));
    groupsById.set(groupId, {
      ...group,
      subtitle,
      destination: {
        ...group.destination,
        subtitle,
      },
      assetCount: getOperationAssetCount(operations.map(({ operation }) => operation)),
      thumbnailSummary,
      representativeAssetIds: thumbnailSummary.representativeAssetIds,
      operations,
    });
  }

  return {
    plan,
    groups: [...groupsById.values()],
    operationsById: new Map(items.map((item) => [item.id, item])),
  };
};

const buildOperationReview = (
  operation: AgentOperationResponseDto,
  operationById: Map<string, AgentOperationResponseDto>,
  enabledByOperationId: OperationEnabledState,
  isOperationBlocked: (operation: AgentOperationResponseDto) => boolean,
  selected: boolean,
  blocked: boolean,
): AgentOperationReview => ({
  operationId: operation.id,
  operationType: operation.type,
  destination: getReviewDestination(operation, operationById),
  summary: getOperationReviewSummary(operation),
  riskLevel: operation.riskLevel,
  selection: buildOperationReviewSelection(operation, selected && !blocked),
  thumbnails: getThumbnailSummary([operation]),
  dependencies: operation.dependencyIds.map((operationId) => {
    const dependency = operationById.get(operationId);
    const dependencySelected = dependency ? (enabledByOperationId[dependency.id] ?? dependency.enabled) : false;
    const dependencyBlocked = dependency ? isOperationBlocked(dependency) : false;

    return {
      operationId,
      summary: dependency?.summary ?? 'Missing dependency',
      blocked: dependency === undefined || !dependencySelected || dependencyBlocked,
    };
  }),
});

const buildOperationReviewSelection = (
  operation: Pick<AgentOperationResponseDto, 'assetIds'>,
  included: boolean,
): AgentReviewSelection => {
  const totalCount = getOperationAssetCount([operation]);

  return {
    itemKind: 'asset',
    totalCount,
    selectedCount: included ? totalCount : 0,
    mode: included ? 'all' : 'none',
    supportsItemSelection: false,
  };
};

const getThumbnailSummary = (operations: Pick<AgentOperationResponseDto, 'assetIds'>[]): AgentReviewThumbnailSummary => {
  const totalCount = getOperationAssetCount(operations);
  const representativeAssetIds = getRepresentativeAssetIds(operations);

  return {
    totalCount,
    representativeAssetIds,
    hasMore: totalCount > representativeAssetIds.length,
  };
};

const getRepresentativeAssetIds = (operations: Pick<AgentOperationResponseDto, 'assetIds'>[]) => {
  const representativeAssetIds: string[] = [];
  const seenAssetIds = new Set<string>();

  for (const [operationIndex, operation] of operations.entries()) {
    if (representativeAssetIds.length >= representativeAssetLimit) {
      break;
    }

    const remainingOperationsWithAssets = operations
      .slice(operationIndex + 1)
      .filter((operation) => operation.assetIds.length > 0).length;
    const remainingSlots = representativeAssetLimit - representativeAssetIds.length;
    const assetLimit = Math.max(1, remainingSlots - remainingOperationsWithAssets);
    let addedAssetCount = 0;

    for (const assetId of operation.assetIds) {
      if (representativeAssetIds.length >= representativeAssetLimit || addedAssetCount >= assetLimit) {
        break;
      }

      if (seenAssetIds.has(assetId)) {
        continue;
      }

      seenAssetIds.add(assetId);
      representativeAssetIds.push(assetId);
      addedAssetCount++;
    }
  }

  return representativeAssetIds;
};

const getGroupId = (operation: AgentOperationResponseDto) => {
  if (operation.targetKind === AgentOperationTargetKind.NewAlbum) {
    return `new-album:${operation.temporaryTargetId ?? operation.id}`;
  }

  if (operation.targetKind === AgentOperationTargetKind.ExistingAlbum && operation.targetId) {
    return `existing-album:${operation.targetId}`;
  }

  return `operation:${operation.id}`;
};

const getGroupTitle = (operation: AgentOperationResponseDto) => {
  if (operation.targetKind === AgentOperationTargetKind.NewAlbum) {
    return `New album "${getAlbumName(operation) ?? operation.temporaryTargetId ?? 'Untitled album'}"`;
  }

  if (operation.targetKind === AgentOperationTargetKind.ExistingAlbum) {
    return operation.targetId ? `Existing album ${operation.targetId}` : 'Existing album';
  }

  return operation.summary;
};

const getOperationReviewSummary = (operation: AgentOperationResponseDto) => {
  switch (operation.type) {
    case AgentOperationType.AlbumCreate:
      return `Create album "${getAlbumName(operation) ?? operation.temporaryTargetId ?? 'Untitled album'}"`;
    case AgentOperationType.AlbumAddAssets:
      return `Add ${formatPhotoCount(getOperationAssetCount([operation]))}`;
    case AgentOperationType.AlbumSetCover:
      return 'Set cover photo';
    case AgentOperationType.AlbumUpdateDetails: {
      const albumName = getAlbumName(operation);
      if (albumName) {
        return `Rename album to "${albumName}"`;
      }

      return 'Update album details';
    }
    default:
      return operation.summary;
  }
};

const formatPhotoCount = (count: number) => `${count} ${count === 1 ? 'photo' : 'photos'}`;

const getReviewDestination = (
  operation: AgentOperationResponseDto,
  operationById: Map<string, AgentOperationResponseDto>,
): AgentReviewDestination => {
  if (
    operation.targetKind === AgentOperationTargetKind.NewAlbum ||
    operation.targetKind === AgentOperationTargetKind.ExistingAlbum
  ) {
    const createOperation =
      operation.temporaryTargetId === null
        ? undefined
        : [...operationById.values()].find(
            (candidate) =>
              candidate.type === AgentOperationType.AlbumCreate &&
              candidate.temporaryTargetId === operation.temporaryTargetId,
          );
    const albumName = getAlbumName(operation) ?? (createOperation ? getAlbumName(createOperation) : undefined);
    const destination: AgentReviewDestination = {
      kind: 'album',
      name: albumName ?? getGroupTitle(operation),
      subtitle: operation.targetKind === AgentOperationTargetKind.NewAlbum ? 'New album' : 'Existing album',
    };

    if (operation.targetId) {
      destination.id = operation.targetId;
    }

    if (operation.temporaryTargetId) {
      destination.temporaryId = operation.temporaryTargetId;
    }

    return destination;
  }

  const rawTargetKind = String(operation.targetKind);
  if (rawTargetKind.includes('space')) {
    return { kind: 'space', name: operation.summary };
  }

  if (rawTargetKind.includes('asset') || rawTargetKind.includes('image')) {
    return { kind: rawTargetKind.includes('image') ? 'imageEditBatch' : 'assetBatch', name: operation.summary };
  }

  return { kind: 'library', name: operation.summary };
};

const getDestination = (
  operation: AgentOperationResponseDto,
  operationById: Map<string, AgentOperationResponseDto>,
  subtitle: string,
): OperationReviewDestination => ({
  ...getReviewDestination(operation, operationById),
  title: getGroupTitle(operation),
  subtitle,
});

const getAlbumName = (operation: AgentOperationResponseDto) => {
  const albumName = operation.payload.albumName;

  return typeof albumName === 'string' && albumName.trim().length > 0 ? albumName.trim() : undefined;
};
