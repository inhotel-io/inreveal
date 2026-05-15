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

export type OperationReviewItem = {
  id: string;
  operation: AgentOperationResponseDto;
  enabled: boolean;
  blocked: boolean;
  blockedBy: string[];
  typeLabelKey: Translations;
  riskLabelKey: Translations;
  assetCount: number;
};

export type OperationReviewGroup = {
  id: string;
  title: string;
  subtitle: string;
  assetCount: number;
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
    .filter((operation): operation is OperationReviewItem => Boolean(operation))
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

    return {
      id: operation.id,
      operation,
      enabled: !blocked && (enabledByOperationId[operation.id] ?? operation.enabled),
      blocked,
      blockedBy,
      typeLabelKey: typeLabelKeys[operation.type],
      riskLabelKey: riskLabelKeys[operation.riskLevel],
      assetCount: getOperationAssetCount([operation]),
    };
  });

  const groupsById = new Map<string, OperationReviewGroup>();

  for (const item of items) {
    const groupId = getGroupId(item.operation);
    const group = groupsById.get(groupId) ?? {
      id: groupId,
      title: getGroupTitle(item.operation),
      subtitle: '',
      assetCount: 0,
      operations: [],
    };

    const operations = [...group.operations, item];
    groupsById.set(groupId, {
      ...group,
      subtitle: `${operations.length} ${operations.length === 1 ? 'operation' : 'operations'}`,
      assetCount: getOperationAssetCount(operations.map(({ operation }) => operation)),
      operations,
    });
  }

  return {
    plan,
    groups: [...groupsById.values()],
    operationsById: new Map(items.map((item) => [item.id, item])),
  };
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

const getAlbumName = (operation: AgentOperationResponseDto) => {
  const albumName = operation.payload.albumName;

  return typeof albumName === 'string' && albumName.trim().length > 0 ? albumName.trim() : undefined;
};
