import { serverVersion } from 'src/constants';
import type { AuthDto } from 'src/dtos/auth.dto';
import { AgentOperationRiskLevel, AgentOperationTargetKind, AgentOperationType, AgentToolName } from 'src/enum';
import { AgentMcpDocsService } from 'src/services/agent-mcp-docs.service';
import { AgentMcpToolContractService } from 'src/services/agent-mcp-tool-contract.service';
import { AgentMcpToolRegistryService } from 'src/services/agent-mcp-tool-registry.service';
import { AgentMcpService } from 'src/services/agent-mcp.service';
import { AgentOperationPlanService } from 'src/services/agent-operation-plan.service';
import { AgentToolService } from 'src/services/agent-tool.service';
import type { AgentMcpReadToolName } from 'src/types/agent-mcp-contract.types';
import type { AgentMcpSuccessResponse, AgentMcpToolCallResult } from 'src/types/agent-mcp.types';
import { factory } from 'test/small.factory';
import { automock, type AutoMocked } from 'test/utils';

const makeAlbumCreateOperation = () => ({
  type: AgentOperationType.AlbumCreate,
  summary: 'Create Portugal highlights.',
  targetKind: AgentOperationTargetKind.NewAlbum,
  temporaryTargetId: 'tmp-portugal',
  payload: { albumName: 'Portugal highlights' },
});

const makeParsedAlbumCreateOperation = () => ({
  ...makeAlbumCreateOperation(),
  riskLevel: AgentOperationRiskLevel.Low,
  enabled: true,
  payload: { albumName: 'Portugal highlights', description: '' },
});

const makePlanningRequest = () => ({
  summary: 'Create a Portugal highlights album.',
  operations: [makeAlbumCreateOperation()],
});

const makeParsedPlanningRequest = () => ({
  summary: 'Create a Portugal highlights album.',
  operations: [makeParsedAlbumCreateOperation()],
});

const makePlanningServiceResult = (planId = factory.uuid()) => ({
  status: 'success',
  plan: {
    id: planId,
    revision: 1,
    operations: [],
  },
  toolCall: null,
  summary: 'Plan revision 1 is ready for review.',
});

const makeToolCallRequest = (toolName: AgentToolName, args: unknown) => ({
  jsonrpc: '2.0',
  id: `${toolName}-call`,
  method: 'tools/call',
  params: {
    name: toolName,
    arguments: args,
  },
});

const expectToolResult = (
  response: AgentMcpSuccessResponse,
  requestId: AgentMcpSuccessResponse['id'],
  structuredContent: unknown,
) => {
  expect(response).toEqual({
    jsonrpc: '2.0',
    id: requestId,
    result: {
      content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
      structuredContent,
    },
  });
};

const expectEnrichedToolValidationError = (
  response: AgentMcpSuccessResponse,
  expected: {
    toolName: AgentToolName;
    path: string;
    hintIncludes?: string;
    expectedIncludes?: string;
    exampleArguments?: Record<string, unknown>;
  },
) => {
  const result = response.result as AgentMcpToolCallResult;
  const structuredContent = result.structuredContent as Record<string, unknown>;

  expect(result.isError).toBe(true);
  expect(structuredContent).toMatchObject({
    status: 'error',
    error: 'Invalid tool arguments',
    toolName: expected.toolName,
    retryable: true,
    issues: expect.arrayContaining([expect.objectContaining({ path: expected.path })]),
  });

  if (expected.hintIncludes) {
    expect(structuredContent.hint).toEqual(expect.stringContaining(expected.hintIncludes));
    expect(structuredContent.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: expected.path,
          hint: expect.stringContaining(expected.hintIncludes),
        }),
      ]),
    );
  }

  if (expected.expectedIncludes) {
    expect(structuredContent.expected).toEqual(expect.stringContaining(expected.expectedIncludes));
  }

  if (expected.exampleArguments) {
    expect(structuredContent.exampleArguments).toEqual(expected.exampleArguments);
  }

  expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.structuredContent) }]);
};

describe(AgentMcpService.name, () => {
  let registry: AgentMcpToolRegistryService;
  let contractService: AgentMcpToolContractService;
  let toolService: AutoMocked<AgentToolService>;
  let operationPlanService: AutoMocked<AgentOperationPlanService>;
  let sut: AgentMcpService;

  const sessionId = factory.uuid();
  const userId = factory.uuid();
  const auth = { user: { id: userId } } as AuthDto;

  beforeEach(() => {
    contractService = new AgentMcpToolContractService();
    registry = new AgentMcpToolRegistryService(contractService);
    toolService = automock(AgentToolService, { strict: false });
    operationPlanService = automock(AgentOperationPlanService, { strict: false });
    sut = new AgentMcpService(registry, contractService, toolService, operationPlanService);
  });

  it('returns the MCP initialize result and advertises tools once tools/list exists', async () => {
    await expect(
      sut.handle(auth, sessionId, {
        jsonrpc: '2.0',
        id: 'init-1',
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'pi-agent-runner', version: '0.1.0' },
        },
      }),
    ).resolves.toEqual({
      jsonrpc: '2.0',
      id: 'init-1',
      result: {
        protocolVersion: '2025-11-25',
        serverInfo: {
          name: 'gallery-agent-mcp',
          version: serverVersion.toString(),
        },
        capabilities: {
          tools: {},
        },
      },
    });
  });

  it('preserves numeric JSON-RPC request ids for initialize', async () => {
    await expect(
      sut.handle(auth, sessionId, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      }),
    ).resolves.toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-11-25',
        serverInfo: {
          name: 'gallery-agent-mcp',
          version: serverVersion.toString(),
        },
        capabilities: {
          tools: {},
        },
      },
    });
  });

  it('returns no response for the initialized notification', async () => {
    await expect(
      sut.handle(auth, sessionId, {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['null body', null],
    ['primitive body', 'not-an-object'],
    ['missing jsonrpc', { id: '1', method: 'initialize' }],
    ['wrong jsonrpc version', { jsonrpc: '1.0', id: '1', method: 'initialize' }],
    ['missing id', { jsonrpc: '2.0', method: 'initialize' }],
    ['null id', { jsonrpc: '2.0', id: null, method: 'initialize' }],
    ['object id', { jsonrpc: '2.0', id: { nested: true }, method: 'initialize' }],
    ['missing method', { jsonrpc: '2.0', id: '1' }],
    ['non-string method', { jsonrpc: '2.0', id: '1', method: 123 }],
  ] as const)('returns invalid request for %s', async (_name, body) => {
    await expect(sut.handle(auth, sessionId, body)).resolves.toEqual({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32_600,
        message: 'Invalid Request',
      },
    });
  });

  it('explicitly rejects batch requests in the first slice', async () => {
    await expect(
      sut.handle(auth, sessionId, [
        {
          jsonrpc: '2.0',
          id: 'init-1',
          method: 'initialize',
        },
      ]),
    ).resolves.toEqual({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32_600,
        message: 'Batch requests are not supported',
      },
    });
  });

  it('returns the registered Gallery MCP tools for tools/list', async () => {
    const response = await sut.handle(auth, sessionId, {
      jsonrpc: '2.0',
      id: 'tools-1',
      method: 'tools/list',
    });

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 'tools-1',
      result: {
        tools: registry.listTools(),
      },
    });
  });

  it('preserves numeric JSON-RPC request ids for tools/list', async () => {
    await expect(
      sut.handle(auth, sessionId, {
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/list',
      }),
    ).resolves.toEqual({
      jsonrpc: '2.0',
      id: 9,
      result: {
        tools: registry.listTools(),
      },
    });
  });

  it('returns enriched read tool metadata through tools/list', async () => {
    const response = (await sut.handle(auth, sessionId, {
      jsonrpc: '2.0',
      id: 'tools-enriched-read-metadata',
      method: 'tools/list',
    })) as AgentMcpSuccessResponse;
    const result = response.result as {
      tools: Array<{ name: AgentToolName; description: string; inputSchema: Record<string, unknown> }>;
    };
    const previews = result.tools.find((tool) => tool.name === AgentToolName.ReadAssetPreviews);

    expect(previews?.description).toContain('Use assetIds for a new request');
    expect(previews?.inputSchema.examples).toEqual([
      { assetIds: ['00000000-0000-4000-8000-000000000001'] },
      { toolCallId: '00000000-0000-4000-8000-000000000111' },
    ]);
    expect(previews?.inputSchema['x-gallery-argumentModes']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'asset-ids', requiredFields: ['assetIds'], forbiddenFields: ['toolCallId'] }),
        expect.objectContaining({ name: 'approved-retry', requiredFields: ['toolCallId'] }),
      ]),
    );
    expect(previews?.inputSchema.oneOf).toEqual(expect.any(Array));
  });

  it('returns enriched planning tool metadata through tools/list', async () => {
    const response = (await sut.handle(auth, sessionId, {
      jsonrpc: '2.0',
      id: 'tools-enriched-planning-metadata',
      method: 'tools/list',
    })) as AgentMcpSuccessResponse;
    const result = response.result as {
      tools: Array<{ name: AgentToolName; description: string; inputSchema: Record<string, unknown> }>;
    };
    const proposal = result.tools.find((tool) => tool.name === AgentToolName.ProposeAlbumOperations);

    expect(proposal?.description).toContain('reviewable Gallery operation plan');
    expect(proposal?.inputSchema.examples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          summary: 'Create today test album.',
          operations: expect.any(Array),
        }),
        expect.objectContaining({
          summary: 'Create today test and add selected photos.',
          operations: expect.any(Array),
        }),
      ]),
    );
    expect(proposal?.inputSchema['x-gallery-argumentModes']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'operation-plan', requiredFields: ['summary', 'operations'] }),
      ]),
    );
  });

  describe('generated docs JSON-RPC examples', () => {
    let docsService: AgentMcpDocsService;

    beforeEach(() => {
      docsService = new AgentMcpDocsService(contractService);
    });

    it.each(['initialize', 'tools-list'] as const)('handles the documented %s JSON-RPC example', async (name) => {
      const example = docsService.listJsonRpcExamples().find((candidate) => candidate.name === name)!;
      const response = await sut.handle(auth, sessionId, example.request);

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: example.request.id,
      });
    });

    it('handles the documented read tools/call JSON-RPC example without wrapper errors', async () => {
      const serviceResult = { status: 'success', toolCall: null, assets: [] };
      toolService.readAssetMetadata.mockResolvedValue(serviceResult as never);
      const example = docsService.listJsonRpcExamples().find((candidate) => candidate.name === 'tools-call-read')!;

      const response = (await sut.handle(auth, sessionId, example.request)) as AgentMcpSuccessResponse;

      expect(toolService.readAssetMetadata).toHaveBeenCalledWith(auth, sessionId, {
        assetIds: ['00000000-0000-4000-8000-000000000001'],
      });
      expectToolResult(response, 'read-1', serviceResult);
    });

    it('handles the documented planning tools/call JSON-RPC example without wrapper errors', async () => {
      const serviceResult = makePlanningServiceResult();
      operationPlanService.proposeAlbumOperations.mockResolvedValue(serviceResult as never);
      const example = docsService.listJsonRpcExamples().find((candidate) => candidate.name === 'tools-call-plan')!;

      const response = (await sut.handle(auth, sessionId, example.request)) as AgentMcpSuccessResponse;

      expect(operationPlanService.proposeAlbumOperations).toHaveBeenCalledWith(
        auth,
        sessionId,
        expect.objectContaining({
          summary: 'Create today test album.',
          operations: expect.any(Array),
        }),
      );
      expectToolResult(response, 'plan-1', serviceResult);
    });
  });

  it.each([
    {
      toolName: AgentToolName.SearchAssets,
      args: { filters: { isFavorite: true }, limit: 5 },
      serviceMethod: 'searchAssets' as const,
      serviceResult: { status: 'success', toolCall: null, assets: [], nextPage: null },
    },
    {
      toolName: AgentToolName.ReadAssetMetadata,
      args: { assetIds: [factory.uuid()] },
      serviceMethod: 'readAssetMetadata' as const,
      serviceResult: { status: 'success', toolCall: null, assets: [] },
    },
    {
      toolName: AgentToolName.ReadAssetPreviews,
      args: { assetIds: [factory.uuid()] },
      serviceMethod: 'readAssetPreviews' as const,
      serviceResult: { status: 'success', toolCall: null, previews: [] },
    },
    {
      toolName: AgentToolName.ReadAssetOriginals,
      args: { assetIds: [factory.uuid()] },
      serviceMethod: 'readAssetOriginals' as const,
      serviceResult: { status: 'success', toolCall: null, originals: [] },
    },
    {
      toolName: AgentToolName.ListAlbums,
      args: {},
      serviceMethod: 'listAlbums' as const,
      serviceResult: { status: 'success', toolCall: null, albums: [] },
    },
    {
      toolName: AgentToolName.ReadAlbum,
      args: { albumId: factory.uuid() },
      serviceMethod: 'readAlbum' as const,
      serviceResult: { status: 'success', toolCall: null, album: { id: factory.uuid(), assetIds: [] } },
    },
  ])(
    'delegates $toolName to AgentToolService and wraps the result',
    async ({ toolName, args, serviceMethod, serviceResult }) => {
      toolService[serviceMethod].mockResolvedValue(serviceResult as never);

      const response = (await sut.handle(
        auth,
        sessionId,
        makeToolCallRequest(toolName, args),
      )) as AgentMcpSuccessResponse;

      expect(toolService[serviceMethod]).toHaveBeenCalledTimes(1);
      expect(toolService[serviceMethod]).toHaveBeenCalledWith(auth, sessionId, args);
      expectToolResult(response, `${toolName}-call`, serviceResult);
    },
  );

  it('delegates DTO-transformed search defaults instead of raw search arguments', async () => {
    const serviceResult = { status: 'success', toolCall: null, assets: [], nextPage: null };
    toolService.searchAssets.mockResolvedValue(serviceResult as never);

    const response = (await sut.handle(
      auth,
      sessionId,
      makeToolCallRequest(AgentToolName.SearchAssets, {}),
    )) as AgentMcpSuccessResponse;

    expect(toolService.searchAssets).toHaveBeenCalledWith(auth, sessionId, { filters: {}, limit: 10_000 });
    expectToolResult(response, `${AgentToolName.SearchAssets}-call`, serviceResult);
  });

  it('returns approval-required read responses as normal MCP tool results', async () => {
    const serviceResult = {
      status: 'approval-required',
      toolCall: { id: factory.uuid(), status: 'pending-approval' },
    };
    toolService.readAssetPreviews.mockResolvedValue(serviceResult as never);

    const response = (await sut.handle(
      auth,
      sessionId,
      makeToolCallRequest(AgentToolName.ReadAssetPreviews, { assetIds: [factory.uuid()] }),
    )) as AgentMcpSuccessResponse;

    expectToolResult(response, `${AgentToolName.ReadAssetPreviews}-call`, serviceResult);
    expect((response.result as AgentMcpToolCallResult).isError).toBeUndefined();
  });

  it('returns denied read responses as normal MCP tool results', async () => {
    const serviceResult = {
      status: 'denied',
      reason: 'User denied access',
      toolCall: { id: factory.uuid(), status: 'completed' },
    };
    toolService.readAssetOriginals.mockResolvedValue(serviceResult as never);

    const response = (await sut.handle(
      auth,
      sessionId,
      makeToolCallRequest(AgentToolName.ReadAssetOriginals, { assetIds: [factory.uuid()] }),
    )) as AgentMcpSuccessResponse;

    expectToolResult(response, `${AgentToolName.ReadAssetOriginals}-call`, serviceResult);
    expect((response.result as AgentMcpToolCallResult).isError).toBeUndefined();
  });

  it('passes retry toolCallId arguments through to the read service', async () => {
    const toolCallId = factory.uuid();
    const serviceResult = { status: 'success', toolCall: { id: toolCallId }, previews: [] };
    toolService.readAssetPreviews.mockResolvedValue(serviceResult as never);

    const response = (await sut.handle(
      auth,
      sessionId,
      makeToolCallRequest(AgentToolName.ReadAssetPreviews, { toolCallId }),
    )) as AgentMcpSuccessResponse;

    expect(toolService.readAssetPreviews).toHaveBeenCalledWith(auth, sessionId, { toolCallId });
    expectToolResult(response, `${AgentToolName.ReadAssetPreviews}-call`, serviceResult);
  });

  it.each([
    {
      toolName: AgentToolName.ProposeAlbumOperations,
      args: makePlanningRequest(),
      serviceMethod: 'proposeAlbumOperations' as const,
      expectedArguments: (authValue: AuthDto, sessionIdValue: string) => [
        authValue,
        sessionIdValue,
        makeParsedPlanningRequest(),
      ],
    },
    {
      toolName: AgentToolName.ReviseProposedOperations,
      args: {
        planId: factory.uuid(),
        feedback: 'Use a shorter title.',
        ...makePlanningRequest(),
      },
      serviceMethod: 'reviseProposedOperations' as const,
      expectedArguments: (authValue: AuthDto, sessionIdValue: string, args: Record<string, unknown>) => {
        const { planId } = args;
        return [
          authValue,
          sessionIdValue,
          planId,
          {
            feedback: 'Use a shorter title.',
            ...makeParsedPlanningRequest(),
          },
        ];
      },
    },
    {
      toolName: AgentToolName.SummarizePlan,
      args: {
        planId: factory.uuid(),
        focus: 'risk',
      },
      serviceMethod: 'summarizePlan' as const,
      expectedArguments: (authValue: AuthDto, sessionIdValue: string, args: Record<string, unknown>) => {
        const { planId, ...dto } = args;
        return [authValue, sessionIdValue, planId, dto];
      },
    },
  ])(
    'delegates planning tool $toolName to AgentOperationPlanService and wraps the result',
    async ({ toolName, args, serviceMethod, expectedArguments }) => {
      const serviceResult = makePlanningServiceResult();
      operationPlanService[serviceMethod].mockResolvedValue(serviceResult as never);

      const response = (await sut.handle(
        auth,
        sessionId,
        makeToolCallRequest(toolName, args),
      )) as AgentMcpSuccessResponse;

      expect(operationPlanService[serviceMethod]).toHaveBeenCalledTimes(1);
      expect(operationPlanService[serviceMethod]).toHaveBeenCalledWith(
        ...expectedArguments(auth, sessionId, args as Record<string, unknown>),
      );
      expectToolResult(response, `${toolName}-call`, serviceResult);
    },
  );

  it.each([
    {
      toolName: AgentToolName.ProposeAlbumOperations,
      args: makePlanningRequest(),
      serviceMethod: 'proposeAlbumOperations' as const,
    },
    {
      toolName: AgentToolName.ReviseProposedOperations,
      args: { planId: factory.uuid(), ...makePlanningRequest() },
      serviceMethod: 'reviseProposedOperations' as const,
    },
    {
      toolName: AgentToolName.SummarizePlan,
      args: { planId: factory.uuid(), focus: 'risk' },
      serviceMethod: 'summarizePlan' as const,
    },
  ])(
    'converts $toolName service failures to redacted JSON-RPC internal errors',
    async ({ toolName, args, serviceMethod }) => {
      operationPlanService[serviceMethod].mockRejectedValue(
        new Error('Agent operation plan not found /srv/gallery/provider-request.json bearer token abc'),
      );

      await expect(sut.handle(auth, sessionId, makeToolCallRequest(toolName, args))).resolves.toEqual({
        jsonrpc: '2.0',
        id: `${toolName}-call`,
        error: {
          code: -32_603,
          message: 'Internal error',
        },
      });
    },
  );

  it('does not expose an MCP apply tool call', async () => {
    await expect(
      sut.handle(auth, sessionId, {
        jsonrpc: '2.0',
        id: 'apply-tool',
        method: 'tools/call',
        params: { name: 'applyAlbumOperations', arguments: { planId: factory.uuid(), operationIds: [factory.uuid()] } },
      }),
    ).resolves.toEqual({
      jsonrpc: '2.0',
      id: 'apply-tool',
      error: {
        code: -32_602,
        message: 'Unknown tool',
        data: { toolName: 'applyAlbumOperations' },
      },
    });
    expect(operationPlanService.proposeAlbumOperations).not.toHaveBeenCalled();
    expect(operationPlanService.reviseProposedOperations).not.toHaveBeenCalled();
    expect(operationPlanService.summarizePlan).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'missing arguments',
      args: undefined,
      expectedPath: 'arguments',
    },
    {
      name: 'arguments array',
      args: [factory.uuid()],
      expectedPath: 'arguments',
    },
    {
      name: 'arguments primitive',
      args: 'not-an-object',
      expectedPath: 'arguments',
    },
    {
      name: 'arguments null',
      args: null,
      expectedPath: 'arguments',
    },
    {
      name: 'unknown strict DTO field',
      args: { filters: {}, unexpected: true },
      expectedPath: '',
    },
    {
      name: 'missing metadata assetIds or toolCallId',
      args: {},
      expectedPath: '',
      toolName: AgentToolName.ReadAssetMetadata,
    },
    {
      name: 'empty asset id array',
      args: { assetIds: [] },
      expectedPath: 'assetIds',
      toolName: AgentToolName.ReadAssetMetadata,
    },
    {
      name: 'invalid asset id',
      args: { assetIds: ['not-a-uuid'] },
      expectedPath: 'assetIds.0',
      toolName: AgentToolName.ReadAssetMetadata,
    },
    {
      name: 'invalid album id',
      args: { albumId: 'not-a-uuid' },
      expectedPath: 'albumId',
      toolName: AgentToolName.ReadAlbum,
    },
    {
      name: 'wrong primitive search limit',
      args: { limit: 'ten' },
      expectedPath: 'limit',
      toolName: AgentToolName.SearchAssets,
    },
    {
      name: 'excessive search limit',
      args: { limit: 10_001 },
      expectedPath: 'limit',
      toolName: AgentToolName.SearchAssets,
    },
  ])('returns isError tool result for malformed arguments: $name', async ({ args, expectedPath, toolName }) => {
    const response = (await sut.handle(
      auth,
      sessionId,
      makeToolCallRequest(toolName ?? AgentToolName.SearchAssets, args),
    )) as AgentMcpSuccessResponse;

    expectEnrichedToolValidationError(response, {
      toolName: toolName ?? AgentToolName.SearchAssets,
      path: expectedPath,
    });
    expect(toolService.searchAssets).not.toHaveBeenCalled();
    expect(toolService.readAssetMetadata).not.toHaveBeenCalled();
    expect(toolService.readAlbum).not.toHaveBeenCalled();
  });

  it('does not serialize raw malformed argument values, secrets, routes, or filesystem paths in validation errors', async () => {
    const response = (await sut.handle(
      auth,
      sessionId,
      makeToolCallRequest(AgentToolName.SearchAssets, {
        token: 'bearer abc123',
        internalRoute: '/api/agent/internal/mcp',
        file: '/srv/gallery/provider-key.json',
        filters: { isFavorite: true },
      }),
    )) as AgentMcpSuccessResponse;
    const result = response.result as AgentMcpToolCallResult;
    const serialized = JSON.stringify(result.structuredContent);

    expect(serialized).not.toMatch(
      /token|internalRoute|file|bearer|abc123|\/api\/agent\/internal|\/srv\/gallery|provider-key/i,
    );
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.structuredContent) }]);
  });

  describe('slice 1 small-model read failure matrix', () => {
    it.each(
      new AgentMcpToolContractService()
        .listSlice1RuntimeFailureMatrixCases()
        .filter((failureCase) => failureCase.expectedResult.kind === 'tool-validation'),
    )('keeps runtime validation baseline for $id', async (failureCase) => {
      const response = (await sut.handle(auth, sessionId, failureCase.request)) as AgentMcpSuccessResponse;

      if (failureCase.expectedResult.kind !== 'tool-validation') {
        throw new Error(`Expected tool-validation case for ${failureCase.id}`);
      }

      expectEnrichedToolValidationError(response, {
        toolName: failureCase.toolName!,
        path: failureCase.expectedResult.expectedIssuePath,
      });
      expect(toolService.searchAssets).not.toHaveBeenCalled();
      expect(toolService.readAssetMetadata).not.toHaveBeenCalled();
      expect(toolService.readAssetPreviews).not.toHaveBeenCalled();
      expect(toolService.readAssetOriginals).not.toHaveBeenCalled();
      expect(toolService.listAlbums).not.toHaveBeenCalled();
      expect(toolService.readAlbum).not.toHaveBeenCalled();
    });

    it.each([
      {
        id: 'read-input-instead-of-arguments',
        hintIncludes: 'params.arguments',
        exampleArguments: { assetIds: ['00000000-0000-4000-8000-000000000001'] },
      },
      {
        id: 'read-arguments-array',
        hintIncludes: 'must be a JSON object',
        exampleArguments: { assetIds: ['00000000-0000-4000-8000-000000000001'] },
      },
      {
        id: 'asset-read-combined-asset-ids-and-tool-call-id',
        hintIncludes: 'not both',
        expectedIncludes: 'Use assetIds for a new request',
        exampleArguments: { toolCallId: '00000000-0000-4000-8000-000000000111' },
      },
      {
        id: 'asset-read-duplicate-asset-ids',
        hintIncludes: 'only once',
        exampleArguments: { assetIds: ['00000000-0000-4000-8000-000000000001'] },
      },
      {
        id: 'read-album-invalid-album-id',
        hintIncludes: 'Album ids must be UUID strings',
        exampleArguments: { albumId: '00000000-0000-4000-8000-000000000010' },
      },
      {
        id: 'search-filters-outside-filters',
        hintIncludes: 'inside the filters object',
        exampleArguments: {
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
        id: 'search-limit-out-of-range',
        hintIncludes: 'no greater than 10000',
        exampleArguments: {
          filters: {
            isFavorite: true,
            rating: 5,
          },
          limit: 25,
        },
      },
    ])('returns an actionable correction for $id', async (expectation) => {
      const failureCase = contractService
        .listSlice1RuntimeFailureMatrixCases()
        .find((candidate) => candidate.id === expectation.id)!;

      const response = (await sut.handle(auth, sessionId, failureCase.request)) as AgentMcpSuccessResponse;

      if (failureCase.expectedResult.kind !== 'tool-validation' || !failureCase.toolName) {
        throw new Error(`Expected tool-validation read case for ${failureCase.id}`);
      }

      expectEnrichedToolValidationError(response, {
        toolName: failureCase.toolName,
        path: failureCase.expectedResult.expectedIssuePath,
        hintIncludes: expectation.hintIncludes,
        expectedIncludes: expectation.expectedIncludes,
        exampleArguments: expectation.exampleArguments,
      });
    });

    it('adds correction fields for every read-tool failure matrix case', async () => {
      for (const failureCase of contractService
        .listSlice1RuntimeFailureMatrixCases()
        .filter((candidate) => candidate.expectedResult.kind === 'tool-validation')) {
        const response = (await sut.handle(auth, sessionId, failureCase.request)) as AgentMcpSuccessResponse;
        const result = response.result as AgentMcpToolCallResult;
        const structuredContent = result.structuredContent as Record<string, unknown>;

        expect(failureCase.toolName, failureCase.id).toBeDefined();
        expect(structuredContent.toolName, failureCase.id).toBe(failureCase.toolName);
        expect(structuredContent.retryable, failureCase.id).toBe(true);
        expect(typeof structuredContent.expected, failureCase.id).toBe('string');
        expect(typeof structuredContent.hint, failureCase.id).toBe('string');
        expect(structuredContent.exampleArguments, failureCase.id).toEqual(expect.any(Object));
        expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.structuredContent) }]);
      }
    });

    it.each(
      new AgentMcpToolContractService()
        .listSlice1RuntimeFailureMatrixCases()
        .filter((failureCase) => failureCase.expectedResult.kind === 'protocol-error'),
    )('keeps runtime protocol-error baseline for $id', async (failureCase) => {
      const response = await sut.handle(auth, sessionId, failureCase.request);

      if (failureCase.expectedResult.kind !== 'protocol-error') {
        throw new Error(`Expected protocol-error case for ${failureCase.id}`);
      }

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: failureCase.request.id,
        error: {
          message: failureCase.expectedResult.expectedErrorMessage,
        },
      });
      expect(toolService.searchAssets).not.toHaveBeenCalled();
      expect(operationPlanService.proposeAlbumOperations).not.toHaveBeenCalled();
      expect(operationPlanService.reviseProposedOperations).not.toHaveBeenCalled();
      expect(operationPlanService.summarizePlan).not.toHaveBeenCalled();
    });

    it('keeps all slice 1 failure cases unique and documented', () => {
      const cases = contractService.listSlice1RuntimeFailureMatrixCases();

      expect(new Set(cases.map((failureCase) => failureCase.id)).size).toBe(cases.length);
      for (const failureCase of cases) {
        expect(failureCase.description.trim().length).toBeGreaterThan(20);
        expect(failureCase.category).toEqual(expect.any(String));
      }
    });

    it('connects read-tool failure cases to contract common mistakes', () => {
      const expectedReadToolNames = new Set<AgentMcpReadToolName>([
        AgentToolName.SearchAssets,
        AgentToolName.ReadAssetMetadata,
        AgentToolName.ReadAssetPreviews,
        AgentToolName.ReadAssetOriginals,
        AgentToolName.ListAlbums,
        AgentToolName.ReadAlbum,
      ]);
      const isExpectedReadToolName = (toolName: AgentToolName): toolName is AgentMcpReadToolName =>
        expectedReadToolNames.has(toolName as AgentMcpReadToolName);
      const contractsByName = new Map(
        contractService.listReadToolContracts().map((contract) => [contract.name, contract]),
      );

      for (const failureCase of contractService.listSlice1RuntimeFailureMatrixCases()) {
        if (!failureCase.toolName || !isExpectedReadToolName(failureCase.toolName)) {
          continue;
        }

        const mistakeIds = contractsByName.get(failureCase.toolName)?.commonMistakes.map((mistake) => mistake.id) ?? [];

        expect(mistakeIds, `${failureCase.id} should map to ${failureCase.toolName}`).toContain(
          failureCase.expectedContractMistakeId,
        );
      }
    });
  });

  describe('planning argument validation', () => {
    const assetId = factory.uuid();

    it.each(
      new AgentMcpToolContractService()
        .listSlice4PlanningFailureMatrixCases()
        .filter((failureCase) => failureCase.expectedResult.kind === 'tool-validation'),
    )('keeps runtime validation baseline for Slice 4 planning case $id', async (failureCase) => {
      const response = (await sut.handle(auth, sessionId, failureCase.request)) as AgentMcpSuccessResponse;

      if (failureCase.expectedResult.kind !== 'tool-validation') {
        throw new Error(`Expected tool-validation case for ${failureCase.id}`);
      }

      expectEnrichedToolValidationError(response, {
        toolName: failureCase.toolName!,
        path: failureCase.expectedResult.expectedIssuePath,
      });
      expect(operationPlanService.proposeAlbumOperations).not.toHaveBeenCalled();
      expect(operationPlanService.reviseProposedOperations).not.toHaveBeenCalled();
      expect(operationPlanService.summarizePlan).not.toHaveBeenCalled();
    });

    it.each([
      {
        id: 'planning-missing-arguments',
        hintIncludes: 'params.arguments',
        expectedIncludes: 'reviewable Gallery operation plan',
      },
      {
        id: 'planning-missing-new-album-dependency',
        hintIncludes: 'Create the new album or space first',
        expectedIncludes: 'reviewable Gallery operation plan',
      },
      {
        id: 'planning-wrong-album-target-kind',
        hintIncludes: 'existing_album',
        expectedIncludes: 'reviewable Gallery operation plan',
      },
      {
        id: 'planning-wrong-space-target-kind',
        hintIncludes: 'existing_space',
        expectedIncludes: 'reviewable Gallery operation plan',
      },
      {
        id: 'planning-wrong-asset-batch-target-kind',
        hintIncludes: 'asset_batch',
        expectedIncludes: 'reviewable Gallery operation plan',
      },
      {
        id: 'planning-wrong-image-edit-target-kind',
        hintIncludes: 'image_edit_batch',
        expectedIncludes: 'reviewable Gallery operation plan',
      },
      {
        id: 'planning-duplicate-asset-ids',
        hintIncludes: 'only once',
        expectedIncludes: 'reviewable Gallery operation plan',
      },
      {
        id: 'planning-invalid-rotate-angle',
        hintIncludes: '90, 180, or 270',
        expectedIncludes: 'reviewable Gallery operation plan',
      },
      {
        id: 'planning-invalid-tag-payload',
        hintIncludes: 'exactly one of tagId or tagName',
        expectedIncludes: 'reviewable Gallery operation plan',
      },
    ])('returns an actionable planning correction for $id', async (expectation) => {
      const failureCase = contractService
        .listSlice4PlanningFailureMatrixCases()
        .find((candidate) => candidate.id === expectation.id)!;

      const response = (await sut.handle(auth, sessionId, failureCase.request)) as AgentMcpSuccessResponse;

      if (failureCase.expectedResult.kind !== 'tool-validation' || !failureCase.toolName) {
        throw new Error(`Expected tool-validation planning case for ${failureCase.id}`);
      }

      expectEnrichedToolValidationError(response, {
        toolName: failureCase.toolName,
        path: failureCase.expectedResult.expectedIssuePath,
        hintIncludes: expectation.hintIncludes,
        expectedIncludes: expectation.expectedIncludes,
      });

      const result = response.result as AgentMcpToolCallResult;
      expect((result.structuredContent as Record<string, unknown>).exampleArguments).toEqual(expect.any(Object));
    });

    it.each(
      new AgentMcpToolContractService()
        .listSlice4PlanningFailureMatrixCases()
        .filter((failureCase) => failureCase.expectedResult.kind === 'protocol-error'),
    )('keeps runtime protocol-error baseline for Slice 4 planning case $id', async (failureCase) => {
      const response = await sut.handle(auth, sessionId, failureCase.request);

      if (failureCase.expectedResult.kind !== 'protocol-error') {
        throw new Error(`Expected protocol-error case for ${failureCase.id}`);
      }

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: failureCase.request.id,
        error: {
          message: failureCase.expectedResult.expectedErrorMessage,
        },
      });
      expect(operationPlanService.proposeAlbumOperations).not.toHaveBeenCalled();
      expect(operationPlanService.reviseProposedOperations).not.toHaveBeenCalled();
      expect(operationPlanService.summarizePlan).not.toHaveBeenCalled();
    });

    it.each([
      {
        name: 'planning missing arguments',
        toolName: AgentToolName.ProposeAlbumOperations,
        args: undefined,
        expectedPath: 'arguments',
      },
      {
        name: 'planning array arguments',
        toolName: AgentToolName.ProposeAlbumOperations,
        args: [makeAlbumCreateOperation()],
        expectedPath: 'arguments',
      },
      {
        name: 'proposal wrong primitive summary',
        toolName: AgentToolName.ProposeAlbumOperations,
        args: { summary: 12, operations: [makeAlbumCreateOperation()] },
        expectedPath: 'summary',
      },
      {
        name: 'proposal missing summary',
        toolName: AgentToolName.ProposeAlbumOperations,
        args: { operations: [makeAlbumCreateOperation()] },
        expectedPath: 'summary',
      },
      {
        name: 'proposal empty operations',
        toolName: AgentToolName.ProposeAlbumOperations,
        args: { summary: 'Empty operations.', operations: [] },
        expectedPath: 'operations',
      },
      {
        name: 'proposal too many operations',
        toolName: AgentToolName.ProposeAlbumOperations,
        args: {
          summary: 'Too many operations.',
          operations: Array.from({ length: 501 }, (_, index) => ({
            ...makeAlbumCreateOperation(),
            temporaryTargetId: `tmp-portugal-${index}`,
            payload: { albumName: `Portugal ${index}` },
          })),
        },
        expectedPath: 'operations',
      },
      {
        name: 'proposal duplicate asset ids',
        toolName: AgentToolName.ProposeAlbumOperations,
        args: {
          summary: 'Duplicate assets.',
          operations: [
            {
              type: AgentOperationType.AlbumAddAssets,
              summary: 'Add duplicate assets.',
              targetKind: AgentOperationTargetKind.ExistingAlbum,
              targetId: factory.uuid(),
              assetIds: [assetId, assetId],
            },
          ],
        },
        expectedPath: 'operations.0.assetIds',
      },
      {
        name: 'proposal missing new album temporary target',
        toolName: AgentToolName.ProposeAlbumOperations,
        args: {
          summary: 'Missing temp id.',
          operations: [
            {
              type: AgentOperationType.AlbumCreate,
              summary: 'Create missing temp id.',
              targetKind: AgentOperationTargetKind.NewAlbum,
              payload: { albumName: 'Portugal' },
            },
          ],
        },
        expectedPath: 'operations.0.temporaryTargetId',
      },
      {
        name: 'proposal excessive album name',
        toolName: AgentToolName.ProposeAlbumOperations,
        args: {
          summary: 'Album name too long.',
          operations: [
            {
              ...makeAlbumCreateOperation(),
              payload: { albumName: 'a'.repeat(201) },
            },
          ],
        },
        expectedPath: 'operations.0.payload.albumName',
      },
      {
        name: 'revision missing planId',
        toolName: AgentToolName.ReviseProposedOperations,
        args: makePlanningRequest(),
        expectedPath: 'planId',
      },
      {
        name: 'revision numeric planId',
        toolName: AgentToolName.ReviseProposedOperations,
        args: { planId: 12, ...makePlanningRequest() },
        expectedPath: 'planId',
      },
      {
        name: 'revision invalid planId',
        toolName: AgentToolName.ReviseProposedOperations,
        args: { planId: 'not-a-uuid', ...makePlanningRequest() },
        expectedPath: 'planId',
      },
      {
        name: 'revision excessive feedback',
        toolName: AgentToolName.ReviseProposedOperations,
        args: { planId: factory.uuid(), feedback: 'a'.repeat(2001), ...makePlanningRequest() },
        expectedPath: 'feedback',
      },
      {
        name: 'summary missing planId',
        toolName: AgentToolName.SummarizePlan,
        args: { focus: 'risk' },
        expectedPath: 'planId',
      },
      {
        name: 'summary numeric planId',
        toolName: AgentToolName.SummarizePlan,
        args: { planId: 12, focus: 'risk' },
        expectedPath: 'planId',
      },
      {
        name: 'summary wrong primitive focus',
        toolName: AgentToolName.SummarizePlan,
        args: { planId: factory.uuid(), focus: 12 },
        expectedPath: 'focus',
      },
      {
        name: 'summary invalid focus',
        toolName: AgentToolName.SummarizePlan,
        args: { planId: factory.uuid(), focus: '' },
        expectedPath: 'focus',
      },
      {
        name: 'summary excessive focus',
        toolName: AgentToolName.SummarizePlan,
        args: { planId: factory.uuid(), focus: 'a'.repeat(1001) },
        expectedPath: 'focus',
      },
      {
        name: 'summary unknown strict field',
        toolName: AgentToolName.SummarizePlan,
        args: { planId: factory.uuid(), focus: 'risk', unexpected: true },
        expectedPath: '',
      },
    ])(
      'returns isError tool result for malformed planning arguments: $name',
      async ({ toolName, args, expectedPath }) => {
        const response = (await sut.handle(
          auth,
          sessionId,
          makeToolCallRequest(toolName, args),
        )) as AgentMcpSuccessResponse;

        expectEnrichedToolValidationError(response, {
          toolName,
          path: expectedPath,
        });
        expect(operationPlanService.proposeAlbumOperations).not.toHaveBeenCalled();
        expect(operationPlanService.reviseProposedOperations).not.toHaveBeenCalled();
        expect(operationPlanService.summarizePlan).not.toHaveBeenCalled();
      },
    );

    it('adds contract-derived correction fields for planning tools', async () => {
      const response = (await sut.handle(auth, sessionId, {
        jsonrpc: '2.0',
        id: `${AgentToolName.ProposeAlbumOperations}-call`,
        method: 'tools/call',
        params: {
          name: AgentToolName.ProposeAlbumOperations,
        },
      })) as AgentMcpSuccessResponse;
      const result = response.result as AgentMcpToolCallResult;

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        status: 'error',
        error: 'Invalid tool arguments',
        toolName: AgentToolName.ProposeAlbumOperations,
        retryable: true,
        issues: [
          { path: 'arguments', message: 'arguments is required', hint: expect.stringContaining('params.arguments') },
        ],
        expected: expect.stringContaining('reviewable Gallery operation plan'),
        hint: expect.stringContaining('params.arguments'),
        exampleArguments: expect.objectContaining({
          summary: 'Create today test album.',
          operations: expect.any(Array),
        }),
      });
      expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.structuredContent) }]);
    });
  });

  it.each([
    ['missing params', undefined],
    ['params is not object', 'bad-params'],
    ['missing name', { arguments: {} }],
    ['non-string name', { name: 12, arguments: {} }],
  ] as const)('returns invalid params for tools/call when %s', async (_name, params) => {
    await expect(
      sut.handle(auth, sessionId, {
        jsonrpc: '2.0',
        id: 'bad-call',
        method: 'tools/call',
        params,
      }),
    ).resolves.toEqual({
      jsonrpc: '2.0',
      id: 'bad-call',
      error: {
        code: -32_602,
        message: 'Invalid params',
      },
    });
  });

  it('returns a protocol error for an unknown tool name', async () => {
    await expect(
      sut.handle(auth, sessionId, {
        jsonrpc: '2.0',
        id: 'unknown-tool',
        method: 'tools/call',
        params: { name: 'deleteEverything', arguments: {} },
      }),
    ).resolves.toEqual({
      jsonrpc: '2.0',
      id: 'unknown-tool',
      error: {
        code: -32_602,
        message: 'Unknown tool',
        data: { toolName: 'deleteEverything' },
      },
    });
  });

  it('keeps unknown tools as JSON-RPC protocol errors instead of tool validation results', async () => {
    const response = await sut.handle(auth, sessionId, {
      jsonrpc: '2.0',
      id: 'unknown-tool-protocol-error',
      method: 'tools/call',
      params: {
        name: 'mcp_gallery_applyAlbumOperations',
        arguments: { token: 'bearer abc' },
      },
    });

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 'unknown-tool-protocol-error',
      error: {
        code: -32_602,
        message: 'Unknown tool',
        data: { toolName: 'mcp_gallery_applyAlbumOperations' },
      },
    });
  });

  it('converts unexpected service failures to redacted JSON-RPC internal errors', async () => {
    toolService.readAssetMetadata.mockRejectedValue(
      new Error('secret bearer token abc /srv/gallery/provider-request.json stacktrace'),
    );

    await expect(
      sut.handle(auth, sessionId, makeToolCallRequest(AgentToolName.ReadAssetMetadata, { assetIds: [factory.uuid()] })),
    ).resolves.toEqual({
      jsonrpc: '2.0',
      id: `${AgentToolName.ReadAssetMetadata}-call`,
      error: {
        code: -32_603,
        message: 'Internal error',
      },
    });
  });

  it('keeps service exceptions as redacted JSON-RPC internal errors', async () => {
    toolService.searchAssets.mockRejectedValue(new Error('bearer token abc /srv/gallery/internal-route'));

    await expect(sut.handle(auth, sessionId, makeToolCallRequest(AgentToolName.SearchAssets, {}))).resolves.toEqual({
      jsonrpc: '2.0',
      id: `${AgentToolName.SearchAssets}-call`,
      error: {
        code: -32_603,
        message: 'Internal error',
      },
    });
  });

  it('converts rejected retry toolCallId failures to redacted JSON-RPC internal errors', async () => {
    const toolCallId = factory.uuid();
    toolService.readAssetMetadata.mockRejectedValue(new Error('Agent tool call not found for another session'));

    await expect(
      sut.handle(auth, sessionId, makeToolCallRequest(AgentToolName.ReadAssetMetadata, { toolCallId })),
    ).resolves.toEqual({
      jsonrpc: '2.0',
      id: `${AgentToolName.ReadAssetMetadata}-call`,
      error: {
        code: -32_603,
        message: 'Internal error',
      },
    });
    expect(toolService.readAssetMetadata).toHaveBeenCalledWith(auth, sessionId, { toolCallId });
  });

  it.each(['resources/list'] as const)('returns method-not-found for %s', async (method) => {
    await expect(
      sut.handle(auth, sessionId, {
        jsonrpc: '2.0',
        id: 7,
        method,
      }),
    ).resolves.toEqual({
      jsonrpc: '2.0',
      id: 7,
      error: {
        code: -32_601,
        message: 'Method not found',
        data: { method },
      },
    });
  });
});
