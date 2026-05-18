import { Injectable } from '@nestjs/common';
import { AgentOperationTargetKind, AgentOperationType, AgentToolName } from 'src/enum';
import type {
  AgentMcpApprovalRetryContract,
  AgentMcpArgumentMode,
  AgentMcpCommonMistake,
  AgentMcpFailureMatrixCase,
  AgentMcpPlanningToolContract,
  AgentMcpPlanningToolName,
  AgentMcpReadToolContract,
  AgentMcpReadToolName,
  AgentMcpToolContract,
  AgentMcpToolExample,
  AgentMcpToolSafetyContract,
  AgentMcpValidationCorrection,
  AgentMcpValidationCorrectionRequest,
  AgentMcpValidationIssue,
} from 'src/types/agent-mcp-contract.types';

const exampleAssetId = '00000000-0000-4000-8000-000000000001';
const exampleSecondAssetId = '00000000-0000-4000-8000-000000000002';
const exampleAlbumId = '00000000-0000-4000-8000-000000000010';
const exampleSpaceId = '00000000-0000-4000-8000-000000000020';
const exampleTagId = '00000000-0000-4000-8000-000000000030';
const exampleToolCallId = '00000000-0000-4000-8000-000000000111';
const examplePlanId = '00000000-0000-4000-8000-000000000222';

const safety: AgentMcpToolSafetyContract = {
  allowsDirectMutation: false,
  exposesSecrets: false,
  requiresGalleryApplyForWrites: true,
};

const approvalRetry: AgentMcpApprovalRetryContract = {
  field: 'toolCallId',
  instruction:
    'After Gallery approves a pending read request, retry the same read tool with only toolCallId unless Gallery already supplied the approved result.',
};

const approvedRetryMode: AgentMcpArgumentMode = {
  name: 'approved-retry',
  description: 'Retry a read request that Gallery already approved.',
  requiredFields: ['toolCallId'],
  forbiddenFields: ['assetIds', 'albumId', 'filters', 'limit'],
  whenToUse: 'Use only after Gallery resumes the assistant from an approved tool request.',
};

const approvedRetryExample: AgentMcpToolExample = {
  name: 'approved-retry',
  description: 'Retry an approved read request by id.',
  arguments: { toolCallId: exampleToolCallId },
};

const assetIdsMode: AgentMcpArgumentMode = {
  name: 'asset-ids',
  description: 'Start a new asset read request for selected assets.',
  requiredFields: ['assetIds'],
  forbiddenFields: ['toolCallId'],
  whenToUse: 'Use when the assistant already has concrete asset ids from search or album reads.',
};

const assetIdsExample: AgentMcpToolExample = {
  name: 'read-selected-assets',
  description: 'Read selected assets by id.',
  arguments: { assetIds: [exampleAssetId] },
};

const assetIdMistakes: AgentMcpCommonMistake[] = [
  {
    id: 'asset-read-missing-asset-ids-or-tool-call-id',
    match: { messageIncludes: 'Provide assetIds for a new tool request or toolCallId for an approved request' },
    hint: 'For a new asset read, provide assetIds. For an approved retry, provide only toolCallId.',
    exampleName: 'read-selected-assets',
  },
  {
    id: 'asset-read-combined-asset-ids-and-tool-call-id',
    match: { messageIncludes: 'Provide either assetIds or toolCallId, not both' },
    hint: 'Use either assetIds for a new request or toolCallId for an approved retry, not both.',
    exampleName: 'approved-retry',
  },
  {
    id: 'asset-read-empty-asset-ids',
    match: { issuePath: 'assetIds' },
    hint: 'Provide at least one valid asset id, or retry an approved request with only toolCallId.',
    exampleName: 'read-selected-assets',
  },
  {
    id: 'asset-read-invalid-asset-id',
    match: { issuePath: 'assetIds.0' },
    hint: 'Asset ids must be UUID strings returned by Gallery tools.',
    exampleName: 'read-selected-assets',
  },
  {
    id: 'asset-read-duplicate-asset-ids',
    match: { issuePath: 'assetIds', messageIncludes: 'assetIds must be unique' },
    hint: 'Provide each asset id only once.',
    exampleName: 'read-selected-assets',
  },
  {
    id: 'asset-read-too-many-asset-ids',
    match: { issuePath: 'assetIds', messageIncludes: 'expected array to have <=10000 items' },
    hint: 'Asset read requests may include at most 10000 asset ids. Search or narrow the request before reading.',
    exampleName: 'read-selected-assets',
  },
  {
    id: 'tool-call-arguments-missing',
    match: { missingField: 'arguments', requestShape: 'json-rpc' },
    hint: 'Put the tool arguments object at params.arguments in the MCP tools/call request.',
    exampleName: 'read-selected-assets',
  },
  {
    id: 'tool-call-arguments-not-object',
    match: { issuePath: 'arguments', requestShape: 'json-rpc' },
    hint: 'The params.arguments value must be a JSON object, not an array, primitive, or null.',
    exampleName: 'read-selected-assets',
  },
];

const defineAssetReadContract = (
  name: AgentToolName.ReadAssetMetadata | AgentToolName.ReadAssetPreviews | AgentToolName.ReadAssetOriginals,
  title: string,
  description: string,
): AgentMcpToolContract<typeof name> => ({
  name,
  title,
  description,
  usage: 'Use assetIds for a new request. Use only toolCallId when retrying a Gallery-approved request.',
  argumentModes: [assetIdsMode, approvedRetryMode],
  examples: [assetIdsExample, approvedRetryExample],
  commonMistakes: assetIdMistakes,
  approvalRetry,
  safety,
});

const searchAssetsContract: AgentMcpToolContract<AgentToolName.SearchAssets> = {
  name: AgentToolName.SearchAssets,
  title: 'Search assets',
  description: 'Find assets using Gallery metadata filters and a bounded result limit.',
  usage: 'Put all search filters under filters. Use only toolCallId when retrying a Gallery-approved search.',
  argumentModes: [
    {
      name: 'empty-search',
      description: 'Search visible assets with default filters and default limit.',
      requiredFields: [],
      forbiddenFields: ['toolCallId'],
      whenToUse: 'Use when the user asks a broad library question and no narrower filters are known.',
    },
    {
      name: 'filtered-search',
      description: 'Search visible assets with metadata filters.',
      requiredFields: ['filters'],
      forbiddenFields: ['toolCallId'],
      whenToUse: 'Use when the user provides date, place, favorite, rating, album, tag, camera, or media filters.',
    },
    approvedRetryMode,
  ],
  examples: [
    {
      name: 'empty-search',
      description: 'Search with default filters and limit.',
      arguments: {},
    },
    {
      name: 'bounded-date-location-search',
      description: 'Search photos from a known place and date window.',
      arguments: {
        filters: {
          takenAfter: '2026-05-01T00:00:00.000Z',
          takenBefore: '2026-05-18T23:59:59.999Z',
          city: 'Berlin',
          country: 'Germany',
        },
        limit: 50,
      },
    },
    {
      name: 'favorite-rating-search',
      description: 'Search favorite five-star assets.',
      arguments: {
        filters: {
          isFavorite: true,
          rating: 5,
        },
        limit: 25,
      },
    },
    approvedRetryExample,
  ],
  commonMistakes: [
    {
      id: 'search-filters-outside-filters',
      match: {
        issuePath: '',
        unexpectedFields: [
          'takenAfter',
          'takenBefore',
          'city',
          'state',
          'country',
          'make',
          'model',
          'lensModel',
          'isFavorite',
          'isNotInAlbum',
          'type',
          'rating',
          'tagIds',
          'albumIds',
        ],
      },
      hint: 'Place date, location, favorite, rating, album, tag, camera, and media filters inside the filters object.',
      exampleName: 'bounded-date-location-search',
    },
    {
      id: 'search-combined-filters-and-tool-call-id',
      match: { messageIncludes: 'Provide either search filters or toolCallId, not both' },
      hint: 'Use either filters and limit for a new search or only toolCallId for an approved retry.',
      exampleName: 'approved-retry',
    },
    {
      id: 'search-limit-out-of-range',
      match: { issuePath: 'limit' },
      hint: 'Use a positive integer limit no greater than 10000.',
      exampleName: 'favorite-rating-search',
    },
    {
      id: 'tool-call-arguments-missing',
      match: { missingField: 'arguments', requestShape: 'json-rpc' },
      hint: 'Put the search arguments object at params.arguments in the MCP tools/call request.',
      exampleName: 'empty-search',
    },
    {
      id: 'tool-call-arguments-not-object',
      match: { issuePath: 'arguments', requestShape: 'json-rpc' },
      hint: 'The params.arguments value must be a JSON object, not an array, primitive, or null.',
      exampleName: 'empty-search',
    },
  ],
  approvalRetry,
  safety,
};

const listAlbumsContract: AgentMcpToolContract<AgentToolName.ListAlbums> = {
  name: AgentToolName.ListAlbums,
  title: 'List albums',
  description: 'List albums visible to the session user.',
  usage: 'Use an empty object for a new request. Use only toolCallId when retrying a Gallery-approved request.',
  argumentModes: [
    {
      name: 'list-visible-albums',
      description: 'Start a new album list request.',
      requiredFields: [],
      forbiddenFields: ['toolCallId'],
      whenToUse: 'Use before answering album count or album lookup questions.',
    },
    approvedRetryMode,
  ],
  examples: [
    {
      name: 'list-visible-albums',
      description: 'List visible albums.',
      arguments: {},
    },
    approvedRetryExample,
  ],
  commonMistakes: [
    {
      id: 'list-albums-unexpected-field',
      match: { unexpectedField: 'albumId' },
      hint: 'Use {} to list albums. Use readAlbum with albumId to inspect one album.',
      exampleName: 'list-visible-albums',
    },
    {
      id: 'tool-call-arguments-missing',
      match: { missingField: 'arguments', requestShape: 'json-rpc' },
      hint: 'Use params.arguments: {} for a normal listAlbums tool call.',
      exampleName: 'list-visible-albums',
    },
    {
      id: 'tool-call-arguments-not-object',
      match: { issuePath: 'arguments', requestShape: 'json-rpc' },
      hint: 'The params.arguments value must be a JSON object. Use {} for a normal listAlbums call.',
      exampleName: 'list-visible-albums',
    },
  ],
  approvalRetry,
  safety,
};

const readAlbumContract: AgentMcpToolContract<AgentToolName.ReadAlbum> = {
  name: AgentToolName.ReadAlbum,
  title: 'Read album',
  description: 'Read one visible album and its asset ids.',
  usage: 'Use albumId for a new request. Use only toolCallId when retrying a Gallery-approved request.',
  argumentModes: [
    {
      name: 'album-id',
      description: 'Start a new album read request.',
      requiredFields: ['albumId'],
      forbiddenFields: ['toolCallId'],
      whenToUse: 'Use after listAlbums returns the album id to inspect.',
    },
    approvedRetryMode,
  ],
  examples: [
    {
      name: 'read-visible-album',
      description: 'Read an album by id.',
      arguments: { albumId: exampleAlbumId },
    },
    approvedRetryExample,
  ],
  commonMistakes: [
    {
      id: 'read-album-missing-album-id-or-tool-call-id',
      match: { messageIncludes: 'Provide albumId for a new tool request or toolCallId for an approved request' },
      hint: 'Use albumId for a new album read, or only toolCallId for an approved retry.',
      exampleName: 'read-visible-album',
    },
    {
      id: 'read-album-combined-album-id-and-tool-call-id',
      match: { messageIncludes: 'Provide either albumId or toolCallId, not both' },
      hint: 'Use either albumId for a new request or toolCallId for an approved retry, not both.',
      exampleName: 'approved-retry',
    },
    {
      id: 'read-album-invalid-album-id',
      match: { issuePath: 'albumId' },
      hint: 'Album ids must be UUID strings returned by listAlbums.',
      exampleName: 'read-visible-album',
    },
    {
      id: 'tool-call-arguments-missing',
      match: { missingField: 'arguments', requestShape: 'json-rpc' },
      hint: 'Put the album read arguments object at params.arguments in the MCP tools/call request.',
      exampleName: 'read-visible-album',
    },
    {
      id: 'tool-call-arguments-not-object',
      match: { issuePath: 'arguments', requestShape: 'json-rpc' },
      hint: 'The params.arguments value must be a JSON object, not an array, primitive, or null.',
      exampleName: 'read-visible-album',
    },
  ],
  approvalRetry,
  safety,
};

const readToolContracts: AgentMcpReadToolContract[] = [
  searchAssetsContract,
  defineAssetReadContract(
    AgentToolName.ReadAssetMetadata,
    'Read asset metadata',
    'Read timestamps, location labels, camera fields, ratings, favorites, visibility, and tags for selected assets.',
  ),
  defineAssetReadContract(
    AgentToolName.ReadAssetPreviews,
    'Read asset previews',
    'Read preview media references for selected assets.',
  ),
  defineAssetReadContract(
    AgentToolName.ReadAssetOriginals,
    'Read asset originals',
    'Read original media references for selected assets.',
  ),
  listAlbumsContract,
  readAlbumContract,
];

const planningUsage =
  'Create a reviewable Gallery operation plan. Put all writes in operations and let Gallery apply the plan after user review.';

const planningMode: AgentMcpArgumentMode = {
  name: 'operation-plan',
  description: 'Create or revise a reviewable plan without applying changes directly.',
  requiredFields: ['summary', 'operations'],
  forbiddenFields: [],
  whenToUse: 'Use for album, space, and asset-batch organization changes that Gallery should review before applying.',
};

const planIdMode: AgentMcpArgumentMode = {
  name: 'existing-plan',
  description: 'Reference an existing Gallery operation plan.',
  requiredFields: ['planId'],
  forbiddenFields: [],
  whenToUse: 'Use when revising or summarizing a plan Gallery already created.',
};

const createEmptyAlbumExample: AgentMcpToolExample = {
  name: 'create-empty-album',
  description: 'Create a new empty album for later review.',
  arguments: {
    summary: 'Create today test album.',
    operations: [
      {
        type: AgentOperationType.AlbumCreate,
        summary: 'Create today test album.',
        targetKind: AgentOperationTargetKind.NewAlbum,
        temporaryTargetId: 'tmp-today-test',
        payload: {
          albumName: "today's test",
          description: 'Test album for recently uploaded photos.',
        },
      },
    ],
  },
};

const createAlbumAndAddAssetsExample: AgentMcpToolExample = {
  name: 'create-album-and-add-assets',
  description: 'Create a new album and add selected assets to it.',
  arguments: {
    summary: 'Create today test and add selected photos.',
    operations: [
      {
        type: AgentOperationType.AlbumCreate,
        summary: 'Create today test album.',
        targetKind: AgentOperationTargetKind.NewAlbum,
        temporaryTargetId: 'tmp-today-test',
        payload: { albumName: "today's test", description: 'Selected recent uploads.' },
      },
      {
        type: AgentOperationType.AlbumAddAssets,
        summary: 'Add selected photos to today test.',
        targetKind: AgentOperationTargetKind.NewAlbum,
        temporaryTargetId: 'tmp-today-test',
        assetIds: [exampleAssetId, exampleSecondAssetId],
      },
    ],
  },
};

const planningProposalExamples: AgentMcpToolExample[] = [
  createEmptyAlbumExample,
  createAlbumAndAddAssetsExample,
  {
    name: 'add-assets-to-existing-album',
    description: 'Add selected assets to an existing album.',
    arguments: {
      summary: 'Add selected photos to an existing album.',
      operations: [
        {
          type: AgentOperationType.AlbumAddAssets,
          summary: 'Add selected photos.',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          targetId: exampleAlbumId,
          assetIds: [exampleAssetId, exampleSecondAssetId],
        },
      ],
    },
  },
  {
    name: 'remove-assets-from-existing-album',
    description: 'Remove selected assets from an existing album.',
    arguments: {
      summary: 'Remove selected photos from an album.',
      operations: [
        {
          type: AgentOperationType.AlbumRemoveAssets,
          summary: 'Remove selected photos.',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          targetId: exampleAlbumId,
          assetIds: [exampleAssetId],
          payload: {},
        },
      ],
    },
  },
  {
    name: 'update-album-details',
    description: 'Rename or describe an existing album.',
    arguments: {
      summary: 'Update album details.',
      operations: [
        {
          type: AgentOperationType.AlbumUpdateDetails,
          summary: 'Rename album.',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          targetId: exampleAlbumId,
          payload: { albumName: 'Today highlights', description: 'Curated recent photos.' },
        },
      ],
    },
  },
  {
    name: 'set-album-cover',
    description: 'Set an existing album cover from a selected asset.',
    arguments: {
      summary: 'Set album cover.',
      operations: [
        {
          type: AgentOperationType.AlbumSetCover,
          summary: 'Set cover photo.',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          targetId: exampleAlbumId,
          assetIds: [exampleAssetId],
          payload: {},
        },
      ],
    },
  },
  {
    name: 'create-space',
    description: 'Create a new shared space.',
    arguments: {
      summary: 'Create a family space.',
      operations: [
        {
          type: AgentOperationType.SpaceCreate,
          summary: 'Create Family space.',
          targetKind: AgentOperationTargetKind.NewSpace,
          temporaryTargetId: 'tmp-family-space',
          payload: { spaceName: 'Family', description: 'Shared family photos.', color: 'blue' },
        },
      ],
    },
  },
  {
    name: 'create-space-and-add-assets',
    description: 'Create a new shared space and add selected assets.',
    arguments: {
      summary: 'Create a family space and add selected photos.',
      operations: [
        {
          type: AgentOperationType.SpaceCreate,
          summary: 'Create Family space.',
          targetKind: AgentOperationTargetKind.NewSpace,
          temporaryTargetId: 'tmp-family-space',
          payload: { spaceName: 'Family', description: 'Shared family photos.', color: 'blue' },
        },
        {
          type: AgentOperationType.SpaceAddAssets,
          summary: 'Add selected photos to Family space.',
          targetKind: AgentOperationTargetKind.NewSpace,
          temporaryTargetId: 'tmp-family-space',
          assetIds: [exampleAssetId, exampleSecondAssetId],
          payload: {},
        },
      ],
    },
  },
  {
    name: 'add-assets-to-existing-space',
    description: 'Add selected assets to an existing shared space.',
    arguments: {
      summary: 'Add selected photos to an existing space.',
      operations: [
        {
          type: AgentOperationType.SpaceAddAssets,
          summary: 'Add selected photos to Family space.',
          targetKind: AgentOperationTargetKind.ExistingSpace,
          targetId: exampleSpaceId,
          assetIds: [exampleAssetId, exampleSecondAssetId],
          payload: {},
        },
      ],
    },
  },
  {
    name: 'remove-assets-from-existing-space',
    description: 'Remove selected assets from an existing shared space.',
    arguments: {
      summary: 'Remove selected photos from a space.',
      operations: [
        {
          type: AgentOperationType.SpaceRemoveAssets,
          summary: 'Remove selected photos from Family space.',
          targetKind: AgentOperationTargetKind.ExistingSpace,
          targetId: exampleSpaceId,
          assetIds: [exampleAssetId],
          payload: {},
        },
      ],
    },
  },
  {
    name: 'update-space-details',
    description: 'Update an existing shared space.',
    arguments: {
      summary: 'Update Family space details.',
      operations: [
        {
          type: AgentOperationType.SpaceUpdateDetails,
          summary: 'Rename Family space.',
          targetKind: AgentOperationTargetKind.ExistingSpace,
          targetId: exampleSpaceId,
          payload: { spaceName: 'Family 2026', description: 'Updated family highlights.', color: 'amber' },
        },
      ],
    },
  },
  {
    name: 'rotate-assets',
    description: 'Rotate selected image assets.',
    arguments: {
      summary: 'Rotate selected images.',
      operations: [
        {
          type: AgentOperationType.AssetRotate,
          summary: 'Rotate selected images clockwise.',
          targetKind: AgentOperationTargetKind.ImageEditBatch,
          assetIds: [exampleAssetId],
          payload: { angle: 90 },
        },
      ],
    },
  },
  {
    name: 'favorite-assets',
    description: 'Mark selected assets as favorites.',
    arguments: {
      summary: 'Favorite selected photos.',
      operations: [
        {
          type: AgentOperationType.AssetSetFavorite,
          summary: 'Favorite selected photos.',
          targetKind: AgentOperationTargetKind.AssetBatch,
          assetIds: [exampleAssetId, exampleSecondAssetId],
          payload: { favorite: true },
        },
      ],
    },
  },
  {
    name: 'archive-assets',
    description: 'Archive selected assets.',
    arguments: {
      summary: 'Archive selected photos.',
      operations: [
        {
          type: AgentOperationType.AssetSetArchive,
          summary: 'Archive selected photos.',
          targetKind: AgentOperationTargetKind.AssetBatch,
          assetIds: [exampleAssetId],
          payload: { archived: true },
        },
      ],
    },
  },
  {
    name: 'add-tag-to-assets',
    description: 'Add a tag to selected assets.',
    arguments: {
      summary: 'Tag selected photos.',
      operations: [
        {
          type: AgentOperationType.AssetAddTag,
          summary: 'Add Travel tag.',
          targetKind: AgentOperationTargetKind.AssetBatch,
          assetIds: [exampleAssetId],
          payload: { tagName: 'Travel' },
        },
      ],
    },
  },
  {
    name: 'remove-tag-from-assets',
    description: 'Remove a tag from selected assets.',
    arguments: {
      summary: 'Remove tag from selected photos.',
      operations: [
        {
          type: AgentOperationType.AssetRemoveTag,
          summary: 'Remove tag from selected photos.',
          targetKind: AgentOperationTargetKind.AssetBatch,
          assetIds: [exampleAssetId],
          payload: { tagId: exampleTagId },
        },
      ],
    },
  },
];

const planningCommonMistakes: AgentMcpCommonMistake[] = [
  {
    id: 'planning-tool-arguments-missing',
    match: { missingField: 'arguments', requestShape: 'json-rpc' },
    hint: 'Put the planning tool arguments object at params.arguments in the MCP tools/call request.',
    exampleName: 'create-empty-album',
  },
  {
    id: 'planning-tool-arguments-not-object',
    match: { issuePath: 'arguments', requestShape: 'json-rpc' },
    hint: 'The params.arguments value must be a JSON object with summary and operations.',
    exampleName: 'create-empty-album',
  },
  {
    id: 'planning-missing-create-temporary-target-id',
    match: { issuePath: 'operations.0.temporaryTargetId', messageIncludes: 'Required' },
    hint: 'New album and space create operations need a temporaryTargetId so later operations can reference them.',
    exampleName: 'create-empty-album',
  },
  {
    id: 'planning-missing-temporary-target-dependency',
    match: { messageIncludes: 'No matching create operation for temporaryTargetId' },
    hint: 'Create the new album or space first, then reference the same temporaryTargetId from dependent add-assets or cover operations.',
    exampleName: 'create-album-and-add-assets',
  },
  {
    id: 'planning-wrong-album-target-kind',
    match: { messageIncludes: 'album operations require an album target' },
    hint: 'Album operations must use targetKind existing_album with targetId, or new_album with temporaryTargetId when the operation allows new albums.',
    exampleName: 'add-assets-to-existing-album',
  },
  {
    id: 'planning-wrong-space-target-kind',
    match: { messageIncludes: 'space operations require a space target' },
    hint: 'Space operations must use targetKind existing_space with targetId, or new_space with temporaryTargetId when the operation allows new spaces.',
    exampleName: 'create-space-and-add-assets',
  },
  {
    id: 'planning-wrong-asset-batch-target-kind',
    match: { messageIncludes: 'requires an asset_batch target' },
    hint: 'Favorite, archive, add-tag, and remove-tag operations must use targetKind asset_batch without targetId or temporaryTargetId.',
    exampleName: 'favorite-assets',
  },
  {
    id: 'planning-wrong-image-edit-target-kind',
    match: { messageIncludes: 'requires an image_edit_batch target' },
    hint: 'Rotate operations must use targetKind image_edit_batch without targetId or temporaryTargetId.',
    exampleName: 'rotate-assets',
  },
  {
    id: 'planning-duplicate-asset-ids',
    match: { messageIncludes: 'assetIds must be unique' },
    hint: 'Provide each asset id only once within a planning operation.',
    exampleName: 'favorite-assets',
  },
  {
    id: 'planning-invalid-rotate-angle',
    match: { messageIncludes: 'angle must be 90, 180, or 270' },
    hint: 'Rotate payload angle must be exactly 90, 180, or 270.',
    exampleName: 'rotate-assets',
  },
  {
    id: 'planning-invalid-tag-payload',
    match: { messageIncludes: 'Provide exactly one of tagId or tagName' },
    hint: 'Asset add-tag payload must provide exactly one of tagId or tagName.',
    exampleName: 'add-tag-to-assets',
  },
];

const revisePlanningExamples: AgentMcpToolExample[] = planningProposalExamples.map((example) => ({
  ...example,
  name: `revise-${example.name}`,
  description: `Revise a plan to ${example.description.charAt(0).toLowerCase()}${example.description.slice(1)}`,
  arguments: {
    planId: examplePlanId,
    feedback: 'Use this revised operation plan.',
    ...example.arguments,
  },
}));

const revisePlanningCommonMistakes: AgentMcpCommonMistake[] = planningCommonMistakes.map((mistake) => ({
  ...mistake,
  exampleName: mistake.exampleName ? `revise-${mistake.exampleName}` : undefined,
}));

const proposeAlbumOperationsContract: AgentMcpPlanningToolContract = {
  name: AgentToolName.ProposeAlbumOperations,
  title: 'Propose album operations',
  description: 'Create a reviewable Gallery operation plan for albums, spaces, and asset batches.',
  usage: planningUsage,
  argumentModes: [planningMode],
  examples: planningProposalExamples,
  commonMistakes: planningCommonMistakes,
  safety,
};

const reviseProposedOperationsContract: AgentMcpPlanningToolContract = {
  name: AgentToolName.ReviseProposedOperations,
  title: 'Revise proposed operations',
  description: 'Revise an existing reviewable Gallery operation plan from user feedback.',
  usage:
    'Revise an existing reviewable Gallery operation plan by providing planId, summary, and replacement operations.',
  argumentModes: [planIdMode, planningMode],
  examples: revisePlanningExamples,
  commonMistakes: [
    {
      id: 'planning-revision-missing-plan-id',
      match: { missingField: 'planId', requestShape: 'tool-arguments' },
      hint: 'Revisions must include the planId returned by the previous proposed plan.',
      exampleName: 'revise-add-assets-to-existing-album',
    },
    ...revisePlanningCommonMistakes,
  ],
  safety,
};

const summarizePlanContract: AgentMcpPlanningToolContract = {
  name: AgentToolName.SummarizePlan,
  title: 'Summarize plan',
  description: 'Summarize an existing Gallery operation plan for user review.',
  usage: 'Summarize an existing reviewable Gallery operation plan by providing planId and optional focus.',
  argumentModes: [planIdMode],
  examples: [
    {
      name: 'summarize-plan',
      description: 'Summarize the whole plan.',
      arguments: { planId: examplePlanId },
    },
    {
      name: 'summarize-plan-risks',
      description: 'Summarize plan risks and selected changes.',
      arguments: { planId: examplePlanId, focus: 'risks and selected changes' },
    },
  ],
  commonMistakes: [
    {
      id: 'planning-tool-arguments-missing',
      match: { missingField: 'arguments', requestShape: 'json-rpc' },
      hint: 'Put the planning tool arguments object at params.arguments in the MCP tools/call request.',
      exampleName: 'summarize-plan',
    },
    {
      id: 'planning-tool-arguments-not-object',
      match: { issuePath: 'arguments', requestShape: 'json-rpc' },
      hint: 'The params.arguments value must be a JSON object with planId and optional focus.',
      exampleName: 'summarize-plan',
    },
    {
      id: 'planning-summary-missing-plan-id',
      match: { missingField: 'planId', requestShape: 'tool-arguments' },
      hint: 'Summaries must include the planId returned by the proposed plan.',
      exampleName: 'summarize-plan',
    },
  ],
  safety,
};

const planningToolContracts: AgentMcpPlanningToolContract[] = [
  proposeAlbumOperationsContract,
  reviseProposedOperationsContract,
  summarizePlanContract,
];

const toolCallRequest = (id: string, name: string, args: unknown): Record<string, unknown> => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
  params: {
    name,
    arguments: args,
  },
});

const toolCallRequestWithParams = (id: string, params: Record<string, unknown>): Record<string, unknown> => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
  params,
});

const oversizedAssetIds = Array.from(
  { length: 10_001 },
  (_, index) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
);

const slice1RuntimeFailureMatrixCases: AgentMcpFailureMatrixCase[] = [
  {
    id: 'read-input-instead-of-arguments',
    category: 'request-wrapper',
    description: 'Model sends params.input instead of params.arguments.',
    toolName: AgentToolName.ReadAssetMetadata,
    request: toolCallRequestWithParams('read-input-instead-of-arguments', {
      name: AgentToolName.ReadAssetMetadata,
      input: { assetIds: [exampleAssetId] },
    }),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: 'arguments' },
    expectedContractMistakeId: 'tool-call-arguments-missing',
  },
  {
    id: 'read-top-level-arguments',
    category: 'request-wrapper',
    description: 'Model sends arguments outside params.',
    toolName: AgentToolName.ReadAssetMetadata,
    request: {
      ...toolCallRequestWithParams('read-top-level-arguments', { name: AgentToolName.ReadAssetMetadata }),
      arguments: { assetIds: [exampleAssetId] },
    },
    expectedResult: { kind: 'tool-validation', expectedIssuePath: 'arguments' },
    expectedContractMistakeId: 'tool-call-arguments-missing',
  },
  {
    id: 'read-arguments-array',
    category: 'request-wrapper',
    description: 'Model sends params.arguments as an array instead of an object.',
    toolName: AgentToolName.ReadAssetMetadata,
    request: toolCallRequest('read-arguments-array', AgentToolName.ReadAssetMetadata, [exampleAssetId]),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: 'arguments' },
    expectedContractMistakeId: 'tool-call-arguments-not-object',
  },
  {
    id: 'read-arguments-primitive',
    category: 'request-wrapper',
    description: 'Model sends params.arguments as a primitive string instead of an object.',
    toolName: AgentToolName.ReadAssetMetadata,
    request: toolCallRequest('read-arguments-primitive', AgentToolName.ReadAssetMetadata, 'not-an-object'),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: 'arguments' },
    expectedContractMistakeId: 'tool-call-arguments-not-object',
  },
  {
    id: 'read-arguments-null',
    category: 'request-wrapper',
    description: 'Model sends params.arguments as null instead of an object.',
    toolName: AgentToolName.ReadAssetMetadata,
    request: toolCallRequest('read-arguments-null', AgentToolName.ReadAssetMetadata, null),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: 'arguments' },
    expectedContractMistakeId: 'tool-call-arguments-not-object',
  },
  {
    id: 'asset-read-combined-asset-ids-and-tool-call-id',
    category: 'read-retry',
    description: 'Model combines new request ids with approved retry id.',
    toolName: AgentToolName.ReadAssetPreviews,
    request: toolCallRequest('asset-read-combined-asset-ids-and-tool-call-id', AgentToolName.ReadAssetPreviews, {
      assetIds: [exampleAssetId],
      toolCallId: exampleToolCallId,
    }),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: '' },
    expectedContractMistakeId: 'asset-read-combined-asset-ids-and-tool-call-id',
  },
  {
    id: 'asset-read-missing-asset-ids-or-tool-call-id',
    category: 'read-request',
    description: 'Model sends an empty asset read argument object.',
    toolName: AgentToolName.ReadAssetMetadata,
    request: toolCallRequest('asset-read-missing-asset-ids-or-tool-call-id', AgentToolName.ReadAssetMetadata, {}),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: '' },
    expectedContractMistakeId: 'asset-read-missing-asset-ids-or-tool-call-id',
  },
  {
    id: 'asset-read-empty-asset-ids',
    category: 'read-request',
    description: 'Model sends an empty asset id array.',
    toolName: AgentToolName.ReadAssetMetadata,
    request: toolCallRequest('asset-read-empty-asset-ids', AgentToolName.ReadAssetMetadata, { assetIds: [] }),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: 'assetIds' },
    expectedContractMistakeId: 'asset-read-empty-asset-ids',
  },
  {
    id: 'asset-read-invalid-asset-id',
    category: 'read-request',
    description: 'Model sends a non-UUID asset id.',
    toolName: AgentToolName.ReadAssetMetadata,
    request: toolCallRequest('asset-read-invalid-asset-id', AgentToolName.ReadAssetMetadata, {
      assetIds: ['not-a-uuid'],
    }),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: 'assetIds.0' },
    expectedContractMistakeId: 'asset-read-invalid-asset-id',
  },
  {
    id: 'asset-read-duplicate-asset-ids',
    category: 'read-request',
    description: 'Model sends duplicate asset ids.',
    toolName: AgentToolName.ReadAssetMetadata,
    request: toolCallRequest('asset-read-duplicate-asset-ids', AgentToolName.ReadAssetMetadata, {
      assetIds: [exampleAssetId, exampleAssetId],
    }),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: 'assetIds' },
    expectedContractMistakeId: 'asset-read-duplicate-asset-ids',
  },
  {
    id: 'asset-read-too-many-asset-ids',
    category: 'read-request',
    description: 'Model sends more asset ids than the read-tool maximum.',
    toolName: AgentToolName.ReadAssetMetadata,
    request: toolCallRequest('asset-read-too-many-asset-ids', AgentToolName.ReadAssetMetadata, {
      assetIds: oversizedAssetIds,
    }),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: 'assetIds' },
    expectedContractMistakeId: 'asset-read-too-many-asset-ids',
  },
  {
    id: 'read-album-missing-album-id-or-tool-call-id',
    category: 'album-read',
    description: 'Model sends an empty readAlbum argument object.',
    toolName: AgentToolName.ReadAlbum,
    request: toolCallRequest('read-album-missing-album-id-or-tool-call-id', AgentToolName.ReadAlbum, {}),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: '' },
    expectedContractMistakeId: 'read-album-missing-album-id-or-tool-call-id',
  },
  {
    id: 'read-album-combined-album-id-and-tool-call-id',
    category: 'album-read',
    description: 'Model combines albumId and toolCallId.',
    toolName: AgentToolName.ReadAlbum,
    request: toolCallRequest('read-album-combined-album-id-and-tool-call-id', AgentToolName.ReadAlbum, {
      albumId: exampleAlbumId,
      toolCallId: exampleToolCallId,
    }),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: '' },
    expectedContractMistakeId: 'read-album-combined-album-id-and-tool-call-id',
  },
  {
    id: 'read-album-invalid-album-id',
    category: 'album-read',
    description: 'Model sends a non-UUID album id.',
    toolName: AgentToolName.ReadAlbum,
    request: toolCallRequest('read-album-invalid-album-id', AgentToolName.ReadAlbum, { albumId: 'not-a-uuid' }),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: 'albumId' },
    expectedContractMistakeId: 'read-album-invalid-album-id',
  },
  {
    id: 'search-filters-outside-filters',
    category: 'search',
    description: 'Model puts date or location filters at the argument root.',
    toolName: AgentToolName.SearchAssets,
    request: toolCallRequest('search-filters-outside-filters', AgentToolName.SearchAssets, {
      city: 'Berlin',
      country: 'Germany',
      limit: 25,
    }),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: '' },
    expectedContractMistakeId: 'search-filters-outside-filters',
  },
  {
    id: 'search-combined-filters-and-tool-call-id',
    category: 'search',
    description: 'Model combines search filters and approved retry id.',
    toolName: AgentToolName.SearchAssets,
    request: toolCallRequest('search-combined-filters-and-tool-call-id', AgentToolName.SearchAssets, {
      filters: { isFavorite: true },
      toolCallId: exampleToolCallId,
    }),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: '' },
    expectedContractMistakeId: 'search-combined-filters-and-tool-call-id',
  },
  {
    id: 'search-limit-out-of-range',
    category: 'search',
    description: 'Model requests more than the maximum search limit.',
    toolName: AgentToolName.SearchAssets,
    request: toolCallRequest('search-limit-out-of-range', AgentToolName.SearchAssets, { limit: 10_001 }),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: 'limit' },
    expectedContractMistakeId: 'search-limit-out-of-range',
  },
  {
    id: 'invented-apply-tool',
    category: 'safety',
    description: 'Model invents a direct apply tool.',
    request: toolCallRequest('invented-apply-tool', 'applyAlbumOperations', {
      planId: '00000000-0000-4000-8000-000000000222',
      operationIds: ['00000000-0000-4000-8000-000000000333'],
    }),
    expectedResult: { kind: 'protocol-error', expectedErrorMessage: 'Unknown tool' },
  },
];

const slice4PlanningFailureMatrixCases: AgentMcpFailureMatrixCase[] = [
  {
    id: 'planning-missing-arguments',
    category: 'planning-wrapper',
    description: 'Model omits params.arguments for a planning tool.',
    toolName: AgentToolName.ProposeAlbumOperations,
    request: toolCallRequestWithParams('planning-missing-arguments', { name: AgentToolName.ProposeAlbumOperations }),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: 'arguments' },
    expectedContractMistakeId: 'planning-tool-arguments-missing',
  },
  {
    id: 'planning-missing-new-album-dependency',
    category: 'planning-dependency',
    description: 'Model references a new album temporary target without a matching create operation.',
    toolName: AgentToolName.ProposeAlbumOperations,
    request: toolCallRequest('planning-missing-new-album-dependency', AgentToolName.ProposeAlbumOperations, {
      summary: 'Add to a missing new album.',
      operations: [
        {
          type: AgentOperationType.AlbumAddAssets,
          summary: 'Add photos to missing album.',
          targetKind: AgentOperationTargetKind.NewAlbum,
          temporaryTargetId: 'tmp-missing-album',
          assetIds: [exampleAssetId],
        },
      ],
    }),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: 'operations.0.temporaryTargetId' },
    expectedContractMistakeId: 'planning-missing-temporary-target-dependency',
  },
  {
    id: 'planning-missing-new-space-dependency',
    category: 'planning-dependency',
    description: 'Model references a new space temporary target without a matching create operation.',
    toolName: AgentToolName.ProposeAlbumOperations,
    request: toolCallRequest('planning-missing-new-space-dependency', AgentToolName.ProposeAlbumOperations, {
      summary: 'Add to a missing new space.',
      operations: [
        {
          type: AgentOperationType.SpaceAddAssets,
          summary: 'Add photos to missing space.',
          targetKind: AgentOperationTargetKind.NewSpace,
          temporaryTargetId: 'tmp-missing-space',
          assetIds: [exampleAssetId],
        },
      ],
    }),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: 'operations.0.temporaryTargetId' },
    expectedContractMistakeId: 'planning-missing-temporary-target-dependency',
  },
  {
    id: 'planning-wrong-album-target-kind',
    category: 'planning-target',
    description: 'Model uses a space target for an album operation.',
    toolName: AgentToolName.ProposeAlbumOperations,
    request: toolCallRequest('planning-wrong-album-target-kind', AgentToolName.ProposeAlbumOperations, {
      summary: 'Add album assets with wrong target.',
      operations: [
        {
          type: AgentOperationType.AlbumAddAssets,
          summary: 'Add selected photos.',
          targetKind: AgentOperationTargetKind.ExistingSpace,
          targetId: exampleSpaceId,
          assetIds: [exampleAssetId],
        },
      ],
    }),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: 'operations.0.targetKind' },
    expectedContractMistakeId: 'planning-wrong-album-target-kind',
  },
  {
    id: 'planning-wrong-space-target-kind',
    category: 'planning-target',
    description: 'Model uses an album target for a space operation.',
    toolName: AgentToolName.ProposeAlbumOperations,
    request: toolCallRequest('planning-wrong-space-target-kind', AgentToolName.ProposeAlbumOperations, {
      summary: 'Add space assets with wrong target.',
      operations: [
        {
          type: AgentOperationType.SpaceAddAssets,
          summary: 'Add selected photos.',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          targetId: exampleAlbumId,
          assetIds: [exampleAssetId],
        },
      ],
    }),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: 'operations.0.targetKind' },
    expectedContractMistakeId: 'planning-wrong-space-target-kind',
  },
  {
    id: 'planning-wrong-asset-batch-target-kind',
    category: 'planning-target',
    description: 'Model uses an album target for an asset batch operation.',
    toolName: AgentToolName.ProposeAlbumOperations,
    request: toolCallRequest('planning-wrong-asset-batch-target-kind', AgentToolName.ProposeAlbumOperations, {
      summary: 'Favorite with wrong target.',
      operations: [
        {
          type: AgentOperationType.AssetSetFavorite,
          summary: 'Favorite selected photos.',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          targetId: exampleAlbumId,
          assetIds: [exampleAssetId],
          payload: { favorite: true },
        },
      ],
    }),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: 'operations.0.targetKind' },
    expectedContractMistakeId: 'planning-wrong-asset-batch-target-kind',
  },
  {
    id: 'planning-wrong-image-edit-target-kind',
    category: 'planning-target',
    description: 'Model uses an album target for an image edit operation.',
    toolName: AgentToolName.ProposeAlbumOperations,
    request: toolCallRequest('planning-wrong-image-edit-target-kind', AgentToolName.ProposeAlbumOperations, {
      summary: 'Rotate with wrong target.',
      operations: [
        {
          type: AgentOperationType.AssetRotate,
          summary: 'Rotate selected photos.',
          targetKind: AgentOperationTargetKind.ExistingAlbum,
          targetId: exampleAlbumId,
          assetIds: [exampleAssetId],
          payload: { angle: 90 },
        },
      ],
    }),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: 'operations.0.targetKind' },
    expectedContractMistakeId: 'planning-wrong-image-edit-target-kind',
  },
  {
    id: 'planning-duplicate-asset-ids',
    category: 'planning-payload',
    description: 'Model repeats the same asset id inside one planning operation.',
    toolName: AgentToolName.ProposeAlbumOperations,
    request: toolCallRequest('planning-duplicate-asset-ids', AgentToolName.ProposeAlbumOperations, {
      summary: 'Favorite duplicate photos.',
      operations: [
        {
          type: AgentOperationType.AssetSetFavorite,
          summary: 'Favorite selected photos.',
          targetKind: AgentOperationTargetKind.AssetBatch,
          assetIds: [exampleAssetId, exampleAssetId],
          payload: { favorite: true },
        },
      ],
    }),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: 'operations.0.assetIds' },
    expectedContractMistakeId: 'planning-duplicate-asset-ids',
  },
  {
    id: 'planning-invalid-rotate-angle',
    category: 'planning-payload',
    description: 'Model uses an unsupported rotate angle.',
    toolName: AgentToolName.ProposeAlbumOperations,
    request: toolCallRequest('planning-invalid-rotate-angle', AgentToolName.ProposeAlbumOperations, {
      summary: 'Rotate badly.',
      operations: [
        {
          type: AgentOperationType.AssetRotate,
          summary: 'Rotate selected photos.',
          targetKind: AgentOperationTargetKind.ImageEditBatch,
          assetIds: [exampleAssetId],
          payload: { angle: 45 },
        },
      ],
    }),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: 'operations.0.payload.angle' },
    expectedContractMistakeId: 'planning-invalid-rotate-angle',
  },
  {
    id: 'planning-invalid-tag-payload',
    category: 'planning-payload',
    description: 'Model provides both tagId and tagName for an add-tag operation.',
    toolName: AgentToolName.ProposeAlbumOperations,
    request: toolCallRequest('planning-invalid-tag-payload', AgentToolName.ProposeAlbumOperations, {
      summary: 'Tag ambiguously.',
      operations: [
        {
          type: AgentOperationType.AssetAddTag,
          summary: 'Add ambiguous tag.',
          targetKind: AgentOperationTargetKind.AssetBatch,
          assetIds: [exampleAssetId],
          payload: { tagId: exampleTagId, tagName: 'Travel' },
        },
      ],
    }),
    expectedResult: { kind: 'tool-validation', expectedIssuePath: 'operations.0.payload' },
    expectedContractMistakeId: 'planning-invalid-tag-payload',
  },
  {
    id: 'planning-invented-create-album-tool',
    category: 'planning-safety',
    description: 'Model invents a direct create album tool instead of proposing a plan.',
    request: toolCallRequest('planning-invented-create-album-tool', 'createAlbum', {
      albumName: "today's test",
    }),
    expectedResult: { kind: 'protocol-error', expectedErrorMessage: 'Unknown tool' },
  },
  {
    id: 'planning-invented-add-assets-tool',
    category: 'planning-safety',
    description: 'Model invents a direct add assets tool instead of proposing a plan.',
    request: toolCallRequest('planning-invented-add-assets-tool', 'addAssetsToAlbum', {
      albumId: exampleAlbumId,
      assetIds: [exampleAssetId],
    }),
    expectedResult: { kind: 'protocol-error', expectedErrorMessage: 'Unknown tool' },
  },
];

const cloneArguments = (args: Record<string, unknown> | undefined): Record<string, unknown> | undefined =>
  args === undefined ? undefined : structuredClone(args);

const mistakeSpecificity = (mistake: AgentMcpCommonMistake): number =>
  Number(Boolean(mistake.match.issuePath)) +
  Number(Boolean(mistake.match.messageIncludes)) +
  Number(Boolean(mistake.match.missingField)) +
  Number(Boolean(mistake.match.unexpectedField || mistake.match.unexpectedFields)) +
  Number(Boolean(mistake.match.requestShape));

const issueMatchesMessage = (issue: AgentMcpValidationIssue, messageIncludes: string | undefined): boolean =>
  !messageIncludes || issue.message.includes(messageIncludes);

const issueMatchesPath = (issue: AgentMcpValidationIssue, issuePath: string | undefined): boolean =>
  issuePath === undefined || issue.path === issuePath;

const mistakeMatchingIssue = (
  mistake: AgentMcpCommonMistake,
  request: AgentMcpValidationCorrectionRequest,
): AgentMcpValidationIssue | undefined => {
  const { match } = mistake;

  if (match.requestShape && match.requestShape !== request.requestShape) {
    return;
  }

  if (match.missingField) {
    return request.issues.find(
      (issue) =>
        issue.path === match.missingField &&
        (issue.message.includes('required') || issue.message.includes('Invalid input')),
    );
  }

  const unexpectedFields = match.unexpectedFields ?? (match.unexpectedField ? [match.unexpectedField] : undefined);

  if (unexpectedFields) {
    return request.issues.find(
      (issue) =>
        issueMatchesPath(issue, match.issuePath) &&
        issueMatchesMessage(issue, match.messageIncludes) &&
        unexpectedFields.some((field) => issue.message.includes(field)),
    );
  }

  return request.issues.find(
    (issue) => issueMatchesPath(issue, match.issuePath) && issueMatchesMessage(issue, match.messageIncludes),
  );
};

@Injectable()
export class AgentMcpToolContractService {
  listReadToolContracts(): AgentMcpReadToolContract[] {
    return structuredClone(readToolContracts);
  }

  listPlanningToolContracts(): AgentMcpPlanningToolContract[] {
    return structuredClone(planningToolContracts);
  }

  listToolContracts(): AgentMcpToolContract[] {
    return [...this.listReadToolContracts(), ...this.listPlanningToolContracts()];
  }

  getReadToolContract(name: AgentMcpReadToolName): AgentMcpReadToolContract | undefined {
    return this.listReadToolContracts().find((contract) => contract.name === name);
  }

  getPlanningToolContract(name: AgentMcpPlanningToolName): AgentMcpPlanningToolContract | undefined {
    return this.listPlanningToolContracts().find((contract) => contract.name === name);
  }

  listSlice1RuntimeFailureMatrixCases(): AgentMcpFailureMatrixCase[] {
    return structuredClone(slice1RuntimeFailureMatrixCases);
  }

  listSlice4PlanningFailureMatrixCases(): AgentMcpFailureMatrixCase[] {
    return structuredClone(slice4PlanningFailureMatrixCases);
  }

  getReadToolValidationCorrection(
    name: AgentMcpReadToolName,
    request: AgentMcpValidationCorrectionRequest,
  ): AgentMcpValidationCorrection | undefined {
    const contract = this.getReadToolContract(name);
    if (!contract) {
      return;
    }

    return this.getValidationCorrection(contract, request);
  }

  getPlanningToolValidationCorrection(
    name: AgentMcpPlanningToolName,
    request: AgentMcpValidationCorrectionRequest,
  ): AgentMcpValidationCorrection | undefined {
    const contract = this.getPlanningToolContract(name);
    if (!contract) {
      return;
    }

    return this.getValidationCorrection(contract, request);
  }

  private getValidationCorrection(
    contract: AgentMcpToolContract,
    request: AgentMcpValidationCorrectionRequest,
  ): AgentMcpValidationCorrection {
    const matchingCorrection = contract.commonMistakes
      .map((mistake) => ({ mistake, issue: mistakeMatchingIssue(mistake, request) }))
      .filter((correction): correction is { mistake: AgentMcpCommonMistake; issue: AgentMcpValidationIssue } =>
        Boolean(correction.issue),
      )
      .toSorted((left, right) => mistakeSpecificity(right.mistake) - mistakeSpecificity(left.mistake))[0];

    if (!matchingCorrection) {
      return {
        expected: contract.usage,
        hint: contract.usage,
        exampleArguments: cloneArguments(contract.examples[0]?.arguments),
      };
    }

    const { mistake: matchingMistake, issue: matchingIssue } = matchingCorrection;
    const example = matchingMistake.exampleName
      ? contract.examples.find((candidate) => candidate.name === matchingMistake.exampleName)
      : undefined;

    return {
      mistakeId: matchingMistake.id,
      issuePath: matchingIssue.path,
      expected: contract.usage,
      hint: matchingMistake.hint,
      exampleArguments: cloneArguments(example?.arguments),
    };
  }
}
