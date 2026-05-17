import {
  AgentOperationItemKind,
  AgentOperationRiskLevel,
  AgentOperationTargetKind,
  AgentOperationType,
  type AgentOperationItemSelection,
  type AgentOperationPlanResponseDto,
  type AgentOperationResponseDto,
} from '@immich/sdk';
import type { Translations } from 'svelte-i18n';

export type OperationEnabledState = Record<string, boolean>;

export type OperationItemSelectionState = Record<string, AgentOperationItemSelectionPayload>;

export type OperationFieldOverrideState = Record<string, Record<string, unknown>>;

export type AgentOperationItemSelectionPayload = {
  itemKind: AgentReviewItemKind;
  mode: AgentReviewSelectionMode;
  itemIds?: string[];
};

export type AgentOperationSelectionPayload = {
  planId: string;
  planRevision: number;
  operationIds: string[];
  itemSelections?: Record<string, AgentOperationItemSelectionPayload>;
  fieldOverrides?: OperationFieldOverrideState;
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

export type AgentOperationEditableField =
  | {
      key: 'albumName' | 'description';
      label: string;
      input: 'text' | 'textarea';
      originalValue: string;
      value: string;
      required: boolean;
      maxLength: number;
    }
  | {
      key: 'albumThumbnailAssetId';
      label: string;
      input: 'coverAsset';
      originalValue: string | undefined;
      value: string | undefined;
      assetIds: string[];
      required: boolean;
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
  mixed: boolean;
  blockedBy: string[];
  typeLabelKey: Translations;
  riskLabelKey: Translations;
  assetCount: number;
  excludedAssetCount: number;
  selectedAssetIds: string[];
  representativeAssetIds: string[];
  editableFields: AgentOperationEditableField[];
  fieldErrors: Record<string, string>;
  fieldOverrides: Record<string, unknown>;
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
  fieldErrors: { operationId: string; fieldKey: string; message: string }[];
};

export type OperationReviewImpactSummary = {
  destinationCount: number;
  totalOperationCount: number;
  selectedOperationCount: number;
  blockedOperationCount: number;
  totalAssetCount: number;
  selectedAssetCount: number;
};

export type AgentPlanThumbnailStripModel = {
  totalCount: number;
  assetIds: string[];
  overflowCount: number;
  hasMore: boolean;
  hasThumbnails: boolean;
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
export const AGENT_PLAN_ITEM_REVIEW_VISIBLE_LIMIT = 48;
export const AGENT_PLAN_THUMBNAIL_STRIP_DEFAULT_LIMIT = 6;
export const AGENT_PLAN_THUMBNAIL_STRIP_MAX_LIMIT = 12;

export const createInitialOperationEnabledState = (plan: AgentOperationPlanResponseDto): OperationEnabledState =>
  Object.fromEntries(plan.operations.map((operation) => [operation.id, operation.enabled]));

export const createInitialOperationItemSelectionState = (
  _: AgentOperationPlanResponseDto,
): OperationItemSelectionState => ({});

export const createInitialOperationFieldOverrideState = (
  _: AgentOperationPlanResponseDto,
): OperationFieldOverrideState => ({});

export const setOperationFieldOverride = (
  state: OperationFieldOverrideState,
  operationId: string,
  fieldKey: string,
  value: unknown,
): OperationFieldOverrideState => ({
  ...state,
  [operationId]: {
    ...(state[operationId] ?? {}),
    [fieldKey]: value,
  },
});

export const resetOperationFieldOverride = (
  state: OperationFieldOverrideState,
  operationId: string,
  fieldKey?: string,
): OperationFieldOverrideState => {
  if (!fieldKey) {
    const { [operationId]: _, ...remaining } = state;
    return remaining;
  }

  const nextFields = { ...(state[operationId] ?? {}) };
  delete nextFields[fieldKey];
  const { [operationId]: _, ...remaining } = state;

  return Object.keys(nextFields).length === 0 ? remaining : { ...remaining, [operationId]: nextFields };
};

export const setOperationItemSelection = (
  state: OperationItemSelectionState,
  operationId: string,
  selection: AgentOperationItemSelectionPayload,
): OperationItemSelectionState => ({
  ...state,
  [operationId]: normalizeSelection(selection),
});

export const resetOperationItemSelection = (
  state: OperationItemSelectionState,
  operationId: string,
): OperationItemSelectionState => {
  const { [operationId]: _, ...remaining } = state;
  return remaining;
};

export const buildOperationItemSelectionState = (
  plan: AgentOperationPlanResponseDto,
  state: OperationItemSelectionState,
  operationId: string,
  assetId: string,
  selected: boolean,
): OperationItemSelectionState => {
  const operation = plan.operations.find((candidate) => candidate.id === operationId);
  if (!operation || !operation.assetIds.includes(assetId)) {
    return state;
  }

  const currentSelection = state[operationId] ?? { itemKind: 'asset', mode: 'all' };
  const currentItemIds = currentSelection.itemIds ?? [];

  if (currentSelection.mode === 'all') {
    return selected
      ? state
      : setOperationItemSelection(state, operationId, {
          itemKind: 'asset',
          mode: 'allExcept',
          itemIds: [assetId],
        });
  }

  if (currentSelection.mode === 'allExcept') {
    const nextItemIds = selected
      ? currentItemIds.filter((itemId) => itemId !== assetId)
      : normalizeItemIds([...currentItemIds, assetId]);

    return nextItemIds.length === 0
      ? resetOperationItemSelection(state, operationId)
      : setOperationItemSelection(state, operationId, {
          itemKind: 'asset',
          mode: 'allExcept',
          itemIds: nextItemIds,
        });
  }

  if (currentSelection.mode === 'only') {
    const nextItemIds = selected
      ? normalizeItemIds([...currentItemIds, assetId])
      : currentItemIds.filter((itemId) => itemId !== assetId);

    return nextItemIds.length === 0
      ? setOperationItemSelection(state, operationId, { itemKind: 'asset', mode: 'none' })
      : setOperationItemSelection(state, operationId, {
          itemKind: 'asset',
          mode: 'only',
          itemIds: nextItemIds,
        });
  }

  return selected
    ? setOperationItemSelection(state, operationId, { itemKind: 'asset', mode: 'only', itemIds: [assetId] })
    : state;
};

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

export const buildSelectionPayload = (model: OperationReviewModel): AgentOperationSelectionPayload => {
  const operationIds = buildApprovedOperationIds(model);
  const itemSelections = Object.fromEntries(
    operationIds
      .map((operationId) => model.operationsById.get(operationId))
      .filter((operation): operation is OperationReviewItem => operation !== undefined)
      .filter((operation) => operation.review.selection.supportsItemSelection)
      .filter((operation) => operation.review.selection.mode !== 'all')
      .map((operation) => [
        operation.id,
        {
          itemKind: operation.review.selection.itemKind,
          mode: operation.review.selection.mode,
          ...(operation.review.selection.itemIds ? { itemIds: operation.review.selection.itemIds } : {}),
        },
      ]),
  );
  const fieldOverrides = Object.fromEntries(
    operationIds
      .map((operationId) => model.operationsById.get(operationId))
      .filter((operation): operation is OperationReviewItem => operation !== undefined)
      .filter((operation) => Object.keys(operation.fieldOverrides).length > 0)
      .map((operation) => [operation.id, operation.fieldOverrides]),
  );

  return {
    planId: model.plan.id,
    planRevision: model.plan.revision,
    operationIds,
    ...(Object.keys(itemSelections).length > 0 ? { itemSelections } : {}),
    ...(Object.keys(fieldOverrides).length > 0 ? { fieldOverrides } : {}),
  };
};

export const toAgentOperationItemSelections = (
  itemSelections: Record<string, AgentOperationItemSelectionPayload> | undefined,
): Record<string, AgentOperationItemSelection> | undefined => {
  if (!itemSelections) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(itemSelections).map(([operationId, selection]) => [
      operationId,
      {
        ...selection,
        itemKind: AgentOperationItemKind.Asset,
      } as AgentOperationItemSelection,
    ]),
  );
};

export const buildOperationReviewImpactSummary = (model: OperationReviewModel): OperationReviewImpactSummary => {
  const selectedOperations = model.plan.operations
    .map((operation) => model.operationsById.get(operation.id))
    .filter((operation): operation is OperationReviewItem => operation !== undefined)
    .filter((operation) => operation.enabled && !operation.blocked);

  return {
    destinationCount: model.groups.length,
    totalOperationCount: model.plan.operations.length,
    selectedOperationCount: selectedOperations.length,
    blockedOperationCount: [...model.operationsById.values()].filter((operation) => operation.blocked).length,
    totalAssetCount: getOperationAssetCount(model.plan.operations),
    selectedAssetCount: new Set(selectedOperations.flatMap((operation) => operation.selectedAssetIds)).size,
  };
};

const normalizeThumbnailStripLimit = (requestedLimit: number) =>
  Math.min(AGENT_PLAN_THUMBNAIL_STRIP_MAX_LIMIT, Math.max(0, Math.floor(requestedLimit)));

export const buildAgentPlanThumbnailStrip = (
  group: OperationReviewGroup,
  requestedLimit = AGENT_PLAN_THUMBNAIL_STRIP_DEFAULT_LIMIT,
): AgentPlanThumbnailStripModel => {
  const visibleLimit = normalizeThumbnailStripLimit(requestedLimit);
  const totalCount = group.thumbnailSummary.totalCount;
  const assetIds = group.thumbnailSummary.representativeAssetIds.slice(0, visibleLimit);
  const overflowCount = assetIds.length > 0 ? Math.max(totalCount - assetIds.length, 0) : 0;

  return {
    totalCount,
    assetIds,
    overflowCount,
    hasMore: overflowCount > 0,
    hasThumbnails: assetIds.length > 0,
  };
};

export const buildAgentPlanItemReviewAssetIds = (
  item: OperationReviewItem,
  requestedLimit = AGENT_PLAN_ITEM_REVIEW_VISIBLE_LIMIT,
) => item.operation.assetIds.slice(0, Math.max(0, Math.floor(requestedLimit)));

export const isAssetSelectedForOperation = (item: OperationReviewItem, assetId: string) => {
  const selection = item.review.selection;
  if (!selection.supportsItemSelection) {
    return item.enabled;
  }

  if (selection.mode === 'all') {
    return true;
  }

  if (selection.mode === 'allExcept') {
    return !(selection.itemIds ?? []).includes(assetId);
  }

  if (selection.mode === 'only') {
    return (selection.itemIds ?? []).includes(assetId);
  }

  return false;
};

export const buildOperationReviewModel = (
  plan: AgentOperationPlanResponseDto,
  enabledByOperationId: OperationEnabledState,
  itemSelectionByOperationId: OperationItemSelectionState = {},
  fieldOverrideByOperationId: OperationFieldOverrideState = {},
): OperationReviewModel => {
  const operationById = new Map(
    plan.operations.map((operation) => [
      operation.id,
      applyOperationFieldOverrides(operation, fieldOverrideByOperationId[operation.id]),
    ]),
  );
  const blockedByCache = new Map<string, string[]>();

  const getBaseSelection = (operation: AgentOperationResponseDto) =>
    buildOperationReviewSelection(
      operation,
      enabledByOperationId[operation.id] ?? operation.enabled,
      itemSelectionByOperationId[operation.id],
    );

  const isOperationRequested = (operation: AgentOperationResponseDto) => {
    const enabled = enabledByOperationId[operation.id] ?? operation.enabled;
    if (!enabled) {
      return false;
    }

    const selection = getBaseSelection(operation);
    return selection.supportsItemSelection ? selection.selectedCount > 0 : true;
  };

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
      if (!isOperationRequested(dependency) || dependencyBlockedBy.length > 0) {
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
    const effectiveOperation = operationById.get(operation.id) ?? operation;
    const review = buildOperationReview(
      effectiveOperation,
      operationById,
      enabledByOperationId,
      (dependency) => collectBlockingDependencySummaries(dependency).length > 0,
      selected,
      blocked,
      itemSelectionByOperationId[operation.id],
    );
    const editableFields = buildEditableFields(operation, fieldOverrideByOperationId[operation.id]);
    const selectedAssetIds = getSelectedAssetIds(operation, review.selection);
    const fieldErrors = validateEditableFields(editableFields, selectedAssetIds);
    const enabled =
      !blocked &&
      selected &&
      Object.keys(fieldErrors).length === 0 &&
      (!review.selection.supportsItemSelection || review.selection.selectedCount > 0);

    return {
      id: operation.id,
      operation,
      review,
      summary: review.summary,
      risk: review.riskLevel,
      selected,
      enabled,
      blocked,
      mixed:
        review.selection.supportsItemSelection &&
        review.selection.selectedCount > 0 &&
        review.selection.selectedCount < review.selection.totalCount,
      blockedBy,
      typeLabelKey: typeLabelKeys[operation.type] ?? fallbackTypeLabelKey,
      riskLabelKey: riskLabelKeys[operation.riskLevel] ?? fallbackRiskLabelKey,
      assetCount: review.selection.totalCount,
      excludedAssetCount: Math.max(review.selection.totalCount - review.selection.selectedCount, 0),
      selectedAssetIds,
      representativeAssetIds: review.thumbnails.representativeAssetIds,
      editableFields,
      fieldErrors,
      fieldOverrides: buildSparseOperationFieldOverrides(editableFields),
    };
  });

  const groupsById = new Map<string, OperationReviewGroup>();

  for (const item of items) {
    const groupId = getGroupId(item.operation);
    const group = groupsById.get(groupId) ?? {
      id: groupId,
      title: getReviewGroupTitle(item),
      subtitle: '',
      destination: getDestination(item.operation, operationById, '', item.review.destination.name),
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
        name: item.review.destination.name,
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
    fieldErrors: items.flatMap((item) =>
      Object.entries(item.fieldErrors).map(([fieldKey, message]) => ({
        operationId: item.id,
        fieldKey,
        message,
      })),
    ),
  };
};

const getReviewGroupTitle = (item: Pick<OperationReviewItem, 'operation' | 'review'>) => {
  if (item.operation.targetKind === AgentOperationTargetKind.NewAlbum) {
    return `New album "${item.review.destination.name}"`;
  }

  return getGroupTitle(item.operation);
};

const buildOperationReview = (
  operation: AgentOperationResponseDto,
  operationById: Map<string, AgentOperationResponseDto>,
  enabledByOperationId: OperationEnabledState,
  isOperationBlocked: (operation: AgentOperationResponseDto) => boolean,
  selected: boolean,
  blocked: boolean,
  itemSelection?: AgentOperationItemSelectionPayload,
): AgentOperationReview => ({
  operationId: operation.id,
  operationType: operation.type,
  destination: getReviewDestination(operation, operationById),
  summary: getOperationReviewSummary(operation),
  riskLevel: operation.riskLevel,
  selection: buildOperationReviewSelection(operation, selected && !blocked, itemSelection),
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

const buildEditableFields = (
  operation: AgentOperationResponseDto,
  fieldOverrides: Record<string, unknown> | undefined,
): AgentOperationEditableField[] => {
  if (operation.type === AgentOperationType.AlbumCreate || operation.type === AgentOperationType.AlbumUpdateDetails) {
    const albumName = getRawStringPayloadValue(operation, 'albumName');
    const description = getRawStringPayloadValue(operation, 'description');

    return [
      {
        key: 'albumName',
        label: 'Album name',
        input: 'text',
        originalValue: albumName,
        value: getStringOverride(fieldOverrides, 'albumName') ?? albumName,
        required: true,
        maxLength: 200,
      },
      {
        key: 'description',
        label: 'Description',
        input: 'textarea',
        originalValue: description,
        value: getStringOverride(fieldOverrides, 'description') ?? description,
        required: false,
        maxLength: 1000,
      },
    ];
  }

  if (operation.type === AgentOperationType.AlbumSetCover && operation.assetIds.length > 1) {
    const originalValue = operation.assetIds[0];
    const overrideValue = getStringOverride(fieldOverrides, 'albumThumbnailAssetId');

    return [
      {
        key: 'albumThumbnailAssetId',
        label: 'Cover photo',
        input: 'coverAsset',
        originalValue,
        value: overrideValue ?? originalValue,
        assetIds: [...new Set(operation.assetIds)],
        required: true,
      },
    ];
  }

  return [];
};

const validateEditableFields = (
  editableFields: AgentOperationEditableField[],
  selectedAssetIds: string[],
): Record<string, string> => {
  const errors: Record<string, string> = {};

  for (const field of editableFields) {
    if (field.key === 'albumName') {
      const trimmedValue = field.value.trim();
      const shouldValidateBlankName = field.originalValue.trim().length > 0 || field.value !== field.originalValue;
      if (trimmedValue.length === 0 && shouldValidateBlankName) {
        errors[field.key] = 'Album name is required.';
      } else if (trimmedValue.length > field.maxLength) {
        errors[field.key] = 'Album name must be 200 characters or fewer.';
      }
      continue;
    }

    if (field.key === 'description' && field.value.trim().length > field.maxLength) {
      errors[field.key] = 'Description must be 1,000 characters or fewer.';
      continue;
    }

    if (field.key === 'albumThumbnailAssetId' && (!field.value || !selectedAssetIds.includes(field.value))) {
      errors[field.key] = 'Choose a selected cover photo.';
    }
  }

  return errors;
};

const buildSparseOperationFieldOverrides = (editableFields: AgentOperationEditableField[]): Record<string, unknown> =>
  Object.fromEntries(
    editableFields
      .filter((field) => field.value !== field.originalValue)
      .map((field) => [
        field.key,
        field.input === 'textarea' || field.input === 'text' ? field.value.trim() : field.value,
      ]),
  );

const applyOperationFieldOverrides = (
  operation: AgentOperationResponseDto,
  fieldOverrides: Record<string, unknown> | undefined,
) => {
  if (
    !fieldOverrides ||
    (operation.type !== AgentOperationType.AlbumCreate && operation.type !== AgentOperationType.AlbumUpdateDetails)
  ) {
    return operation;
  }

  const payload = { ...operation.payload };
  const albumName = getStringOverride(fieldOverrides, 'albumName');
  const description = getStringOverride(fieldOverrides, 'description');

  if (albumName !== undefined) {
    payload.albumName = albumName;
  }

  if (description !== undefined) {
    payload.description = description;
  }

  return { ...operation, payload };
};

const getStringOverride = (fieldOverrides: Record<string, unknown> | undefined, key: string) => {
  const value = fieldOverrides?.[key];
  return typeof value === 'string' ? value : undefined;
};

const getRawStringPayloadValue = (operation: AgentOperationResponseDto, key: string) => {
  const value = operation.payload[key];
  return typeof value === 'string' ? value : '';
};

const buildOperationReviewSelection = (
  operation: Pick<AgentOperationResponseDto, 'assetIds'>,
  included: boolean,
  itemSelection?: AgentOperationItemSelectionPayload,
): AgentReviewSelection => {
  const assetIds = [...new Set(operation.assetIds)];
  const totalCount = assetIds.length;
  const supportsItemSelection = totalCount > 0;

  if (!included) {
    return {
      itemKind: 'asset',
      totalCount,
      selectedCount: 0,
      mode: 'none',
      supportsItemSelection,
    };
  }

  if (!supportsItemSelection) {
    return {
      itemKind: 'asset',
      totalCount,
      selectedCount: 0,
      mode: 'all',
      supportsItemSelection: false,
    };
  }

  const selection = itemSelection ?? { itemKind: 'asset', mode: 'all' as const };
  const itemIds = (selection.itemIds ?? []).filter((itemId) => assetIds.includes(itemId));

  if (selection.mode === 'allExcept') {
    return {
      itemKind: 'asset',
      totalCount,
      selectedCount: Math.max(totalCount - itemIds.length, 0),
      mode: 'allExcept',
      itemIds,
      supportsItemSelection: true,
    };
  }

  if (selection.mode === 'only') {
    return {
      itemKind: 'asset',
      totalCount,
      selectedCount: itemIds.length,
      mode: 'only',
      itemIds,
      supportsItemSelection: true,
    };
  }

  if (selection.mode === 'none') {
    return {
      itemKind: 'asset',
      totalCount,
      selectedCount: 0,
      mode: 'none',
      supportsItemSelection: true,
    };
  }

  return {
    itemKind: 'asset',
    totalCount,
    selectedCount: totalCount,
    mode: 'all',
    supportsItemSelection: true,
  };
};

const getSelectedAssetIds = (
  operation: Pick<AgentOperationResponseDto, 'assetIds'>,
  selection: AgentReviewSelection,
) => {
  const assetIds = [...new Set(operation.assetIds)];

  if (!selection.supportsItemSelection) {
    return assetIds;
  }

  if (selection.mode === 'all') {
    return assetIds;
  }

  if (selection.mode === 'allExcept') {
    const excludedAssetIds = new Set(selection.itemIds);
    return assetIds.filter((assetId) => !excludedAssetIds.has(assetId));
  }

  if (selection.mode === 'only') {
    const includedAssetIds = new Set(selection.itemIds);
    return assetIds.filter((assetId) => includedAssetIds.has(assetId));
  }

  return [];
};

const normalizeItemIds = (itemIds: string[]) => [...new Set(itemIds)];

const normalizeSelection = (selection: AgentOperationItemSelectionPayload): AgentOperationItemSelectionPayload => {
  const itemIds = selection.itemIds ? normalizeItemIds(selection.itemIds) : undefined;
  return itemIds ? { ...selection, itemIds } : selection;
};

const getThumbnailSummary = (
  operations: Pick<AgentOperationResponseDto, 'assetIds'>[],
): AgentReviewThumbnailSummary => {
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
    case AgentOperationType.AlbumCreate: {
      return `Create album "${getAlbumName(operation) ?? operation.temporaryTargetId ?? 'Untitled album'}"`;
    }
    case AgentOperationType.AlbumAddAssets: {
      return `Add ${formatPhotoCount(getOperationAssetCount([operation]))}`;
    }
    case AgentOperationType.AlbumSetCover: {
      return 'Set cover photo';
    }
    case AgentOperationType.AlbumUpdateDetails: {
      const albumName = getAlbumName(operation);
      if (albumName) {
        return `Rename album to "${albumName}"`;
      }

      return 'Update album details';
    }
    default: {
      return operation.summary;
    }
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
  titleOverride?: string,
): OperationReviewDestination => ({
  ...getReviewDestination(operation, operationById),
  title: titleOverride ?? getGroupTitle(operation),
  subtitle,
});

const getAlbumName = (operation: AgentOperationResponseDto) => {
  const albumName = operation.payload.albumName;

  return typeof albumName === 'string' && albumName.trim().length > 0 ? albumName.trim() : undefined;
};
