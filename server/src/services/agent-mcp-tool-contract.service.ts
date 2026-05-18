import { Injectable } from '@nestjs/common';
import { AgentToolName } from 'src/enum';
import type {
  AgentMcpArgumentMode,
  AgentMcpApprovalRetryContract,
  AgentMcpCommonMistake,
  AgentMcpFailureMatrixCase,
  AgentMcpReadToolContract,
  AgentMcpReadToolName,
  AgentMcpToolContract,
  AgentMcpToolExample,
  AgentMcpToolSafetyContract,
} from 'src/types/agent-mcp-contract.types';

const exampleAssetId = '00000000-0000-4000-8000-000000000001';
const exampleAlbumId = '00000000-0000-4000-8000-000000000010';
const exampleToolCallId = '00000000-0000-4000-8000-000000000111';

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
    match: { issuePath: 'assetIds' },
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
      match: { unexpectedField: 'city' },
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

const hideSafetySerializationFields = (contract: AgentMcpReadToolContract): AgentMcpReadToolContract => {
  const contractCopy: AgentMcpReadToolContract = {
    ...contract,
    safety: { ...contract.safety },
  };

  Object.defineProperty(contractCopy.safety, 'toJSON', {
    value: () => ({
      allowsDirectMutation: contractCopy.safety.allowsDirectMutation,
      requiresGalleryApplyForWrites: contractCopy.safety.requiresGalleryApplyForWrites,
    }),
  });

  return contractCopy;
};

@Injectable()
export class AgentMcpToolContractService {
  listReadToolContracts(): AgentMcpReadToolContract[] {
    return structuredClone(readToolContracts).map(hideSafetySerializationFields);
  }

  getReadToolContract(name: AgentMcpReadToolName): AgentMcpReadToolContract | undefined {
    return this.listReadToolContracts().find((contract) => contract.name === name);
  }

  listSlice1RuntimeFailureMatrixCases(): AgentMcpFailureMatrixCase[] {
    return structuredClone(slice1RuntimeFailureMatrixCases);
  }
}
