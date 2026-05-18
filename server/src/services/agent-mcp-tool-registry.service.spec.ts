import { AgentOperationPlanToolRequestSchemas } from 'src/dtos/agent-operation.dto';
import { AgentReadToolRequestSchemas } from 'src/dtos/agent-tool.dto';
import { AgentOperationTargetKind, AgentOperationType, AgentToolName } from 'src/enum';
import { AgentMcpToolContractService } from 'src/services/agent-mcp-tool-contract.service';
import { AgentMcpToolRegistryService } from 'src/services/agent-mcp-tool-registry.service';
import z from 'zod';

const expectedToolNames = [
  AgentToolName.SearchAssets,
  AgentToolName.ReadAssetMetadata,
  AgentToolName.ReadAssetPreviews,
  AgentToolName.ReadAssetOriginals,
  AgentToolName.ListAlbums,
  AgentToolName.ReadAlbum,
  AgentToolName.ProposeAlbumOperations,
  AgentToolName.ReviseProposedOperations,
  AgentToolName.SummarizePlan,
] as const;

const expectedReadToolNames = [
  AgentToolName.SearchAssets,
  AgentToolName.ReadAssetMetadata,
  AgentToolName.ReadAssetPreviews,
  AgentToolName.ReadAssetOriginals,
  AgentToolName.ListAlbums,
  AgentToolName.ReadAlbum,
] as const;

const expectedPlanningToolNames = [
  AgentToolName.ProposeAlbumOperations,
  AgentToolName.ReviseProposedOperations,
  AgentToolName.SummarizePlan,
] as const;

const expectedReadToolNameSet = new Set<AgentToolName>(expectedReadToolNames);
const expectedPlanningToolNameSet = new Set<AgentToolName>(expectedPlanningToolNames);

const forbiddenToolNames = [
  'applyAlbumOperations',
  'applyOperations',
  'createAlbum',
  'addAssetsToAlbum',
  'updateAlbum',
  'deleteAlbum',
  'setAlbumCover',
];

const toExpectedInputSchema = (schema: z.ZodType): Record<string, unknown> => {
  const inputSchema = {
    ...(z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' }) as Record<string, unknown>),
  };
  delete inputSchema['~standard'];
  return inputSchema;
};

const stripContractMetadata = (value: unknown, depth = 0): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => stripContractMetadata(item, depth + 1));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const clone = { ...(value as Record<string, unknown>) };
  delete clone.description;

  if (depth === 0) {
    delete clone.examples;
    delete clone.oneOf;
    delete clone['x-gallery-argumentModes'];
  }

  for (const [key, nestedValue] of Object.entries(clone)) {
    clone[key] = stripContractMetadata(nestedValue, depth + 1);
  }

  return clone;
};

const getSchemaDefinition = (schema: Record<string, unknown>, name: string) => {
  const definitions = schema.$defs as Record<string, unknown> | undefined;
  return definitions?.[name];
};

describe(AgentMcpToolRegistryService.name, () => {
  let contractService: AgentMcpToolContractService;
  let sut: AgentMcpToolRegistryService;

  beforeEach(() => {
    contractService = new AgentMcpToolContractService();
    sut = new AgentMcpToolRegistryService(contractService);
  });

  it('returns exactly the initial nine Gallery MCP tools in stable order', () => {
    expect(sut.listTools().map((tool) => tool.name)).toEqual(expectedToolNames);
  });

  it('does not expose apply or direct gallery mutation tools', () => {
    const toolNames = sut.listTools().map((tool) => tool.name);

    for (const forbiddenToolName of forbiddenToolNames) {
      expect(toolNames).not.toContain(forbiddenToolName);
    }
    expect(toolNames.filter((toolName) => /apply/i.test(toolName))).toEqual([]);
  });

  it('publishes model-facing titles and descriptions without internal route details', () => {
    for (const tool of sut.listTools()) {
      expect(tool.title).toEqual(expect.any(String));
      expect(tool.title.trim().length).toBeGreaterThan(0);
      expect(tool.description).toEqual(expect.any(String));
      expect(tool.description.trim().length).toBeGreaterThan(20);
      expect(tool.description).not.toMatch(/\/api|agent\/internal|bearer|token|http|endpoint|route/i);
    }
  });

  it('tells models how to continue approved read requests with toolCallId', () => {
    const readTools = sut.listTools().filter((tool) => expectedReadToolNameSet.has(tool.name));

    expect(readTools).toHaveLength(expectedReadToolNames.length);
    for (const tool of readTools) {
      expect(tool.description).toMatch(/approval/i);
      expect(tool.description).toMatch(/toolCallId/);
      expect(tool.description).toMatch(/approved request/i);
    }
  });

  it('enriches read tool descriptions from the read tool contracts', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));

    for (const contract of contractService.listReadToolContracts()) {
      const tool = toolsByName.get(contract.name);

      expect(tool?.title).toBe(contract.title);
      expect(tool?.description).toContain(contract.description);
      expect(tool?.description).toContain(contract.usage);
      expect(tool?.description).toContain('approval');
      expect(tool?.description).toContain('toolCallId');
      expect(tool?.description).not.toMatch(/\/api|agent\/internal|bearer|token|provider key|stack trace/i);
    }
  });

  it('publishes valid contract examples on read tool input schemas', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));

    for (const contract of contractService.listReadToolContracts()) {
      const tool = toolsByName.get(contract.name);
      const examples = tool?.inputSchema.examples;

      expect(examples).toEqual(contract.examples.map((example) => example.arguments));
      expect(examples).toHaveLength(contract.examples.length);
      for (const exampleArguments of examples as Record<string, unknown>[]) {
        const result = AgentReadToolRequestSchemas[contract.name].safeParse(exampleArguments);

        expect(result.success, `${contract.name} example should parse`).toBe(true);
      }
    }
  });

  it('adds model-facing property descriptions for read tool argument fields', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));
    const metadata = toolsByName.get(AgentToolName.ReadAssetMetadata)?.inputSchema;
    const search = toolsByName.get(AgentToolName.SearchAssets)?.inputSchema;
    const album = toolsByName.get(AgentToolName.ReadAlbum)?.inputSchema;

    expect(metadata?.properties).toMatchObject({
      assetIds: expect.objectContaining({
        description: expect.stringContaining('new asset read request'),
      }),
      toolCallId: expect.objectContaining({
        description: expect.stringContaining('approved retry'),
      }),
    });
    expect(search?.properties).toMatchObject({
      filters: expect.objectContaining({
        description: expect.stringContaining('Put search filters here'),
      }),
      limit: expect.objectContaining({
        description: expect.stringContaining('10000'),
      }),
      toolCallId: expect.objectContaining({
        description: expect.stringContaining('approved retry'),
      }),
    });
    expect(album?.properties).toMatchObject({
      albumId: expect.objectContaining({
        description: expect.stringContaining('album id returned by listAlbums'),
      }),
      toolCallId: expect.objectContaining({
        description: expect.stringContaining('approved retry'),
      }),
    });
  });

  it('publishes contract argument mode metadata for every read tool', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));

    for (const contract of contractService.listReadToolContracts()) {
      const modeMetadata = toolsByName.get(contract.name)?.inputSchema['x-gallery-argumentModes'];

      expect(modeMetadata).toEqual(
        contract.argumentModes.map((mode) => ({
          name: mode.name,
          description: mode.description,
          requiredFields: mode.requiredFields,
          forbiddenFields: mode.forbiddenFields,
          whenToUse: mode.whenToUse,
        })),
      );
    }
  });

  it('adds oneOf mode hints only when read tool modes are mutually exclusive', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));
    const previews = toolsByName.get(AgentToolName.ReadAssetPreviews)?.inputSchema;
    const listAlbums = toolsByName.get(AgentToolName.ListAlbums)?.inputSchema;
    const readAlbum = toolsByName.get(AgentToolName.ReadAlbum)?.inputSchema;
    const search = toolsByName.get(AgentToolName.SearchAssets)?.inputSchema;

    expect(previews?.oneOf).toEqual([
      expect.objectContaining({
        title: 'asset-ids',
        required: ['assetIds'],
        not: { anyOf: [{ required: ['toolCallId'] }] },
      }),
      expect.objectContaining({
        title: 'approved-retry',
        required: ['toolCallId'],
        not: { anyOf: [{ required: ['assetIds'] }, { required: ['albumId'] }, { required: ['filters'] }, { required: ['limit'] }] },
      }),
    ]);
    expect(listAlbums?.oneOf).toEqual([
      expect.objectContaining({
        title: 'list-visible-albums',
        not: { anyOf: [{ required: ['toolCallId'] }] },
      }),
      expect.objectContaining({
        title: 'approved-retry',
        required: ['toolCallId'],
      }),
    ]);
    expect(readAlbum?.oneOf).toEqual([
      expect.objectContaining({
        title: 'album-id',
        required: ['albumId'],
      }),
      expect.objectContaining({
        title: 'approved-retry',
        required: ['toolCallId'],
      }),
    ]);
    expect(search).not.toHaveProperty('oneOf');
  });

  it('marks read tools as read-only, non-destructive, non-idempotent, and closed-world', () => {
    const tools = sut.listTools().filter((tool) => expectedReadToolNameSet.has(tool.name));

    expect(tools).toHaveLength(expectedReadToolNames.length);
    for (const tool of tools) {
      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      });
    }
  });

  it('marks planning tools as non-read-only, non-destructive, non-idempotent, and closed-world', () => {
    const tools = sut.listTools().filter((tool) => expectedPlanningToolNameSet.has(tool.name));

    expect(tools).toHaveLength(expectedPlanningToolNames.length);
    for (const tool of tools) {
      expect(tool.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      });
    }
  });

  it('exposes object input schemas for every tool', () => {
    for (const tool of sut.listTools()) {
      expect(tool.inputSchema).toEqual(expect.any(Object));
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
      expect(tool.inputSchema).not.toHaveProperty('~standard');
    }
  });

  it('preserves DTO-derived read tool input schema structure after stripping contract metadata', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));

    for (const toolName of expectedReadToolNames) {
      expect(stripContractMetadata(toolsByName.get(toolName)?.inputSchema)).toEqual(
        stripContractMetadata(toExpectedInputSchema(AgentReadToolRequestSchemas[toolName])),
      );
    }
  });

  it('advertises trip-album metadata filters on searchAssets', () => {
    const searchTool = sut.listTools().find((tool) => tool.name === AgentToolName.SearchAssets);
    const searchFiltersSchema = searchTool
      ? getSchemaDefinition(searchTool.inputSchema, 'AgentSearchAssetsFilters')
      : undefined;

    expect(searchTool).toBeDefined();
    expect(searchTool?.description).toContain('date');
    expect(searchTool?.description).toContain('place');
    expect(searchTool?.inputSchema).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          filters: expect.objectContaining({ $ref: '#/$defs/AgentSearchAssetsFilters' }),
          limit: expect.any(Object),
        }),
      }),
    );
    expect(searchFiltersSchema).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          takenAfter: expect.any(Object),
          takenBefore: expect.any(Object),
          city: expect.any(Object),
          state: expect.any(Object),
          country: expect.any(Object),
          isNotInAlbum: expect.any(Object),
        }),
      }),
    );
  });

  it('derives planning tool input schemas from the existing planning tool DTO schemas', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));

    for (const toolName of expectedPlanningToolNames) {
      expect(toolsByName.get(toolName)?.inputSchema).toEqual(
        toExpectedInputSchema(AgentOperationPlanToolRequestSchemas[toolName]),
      );
    }
  });

  it('exposes planId in plan-aware planning tool input schemas', () => {
    const tools = sut.listTools();
    const revise = tools.find((tool) => tool.name === AgentToolName.ReviseProposedOperations);
    const summarize = tools.find((tool) => tool.name === AgentToolName.SummarizePlan);

    expect(revise?.inputSchema).toMatchObject({
      type: 'object',
      required: expect.arrayContaining(['planId', 'summary', 'operations']),
      properties: expect.objectContaining({
        planId: expect.objectContaining({ type: 'string', format: 'uuid' }),
      }),
    });
    expect(summarize?.inputSchema).toMatchObject({
      type: 'object',
      required: expect.arrayContaining(['planId']),
      properties: expect.objectContaining({
        planId: expect.objectContaining({ type: 'string', format: 'uuid' }),
      }),
    });
  });

  it('does not require planId for proposal input schema', () => {
    const proposal = sut.listTools().find((tool) => tool.name === AgentToolName.ProposeAlbumOperations);

    expect(proposal?.inputSchema).toMatchObject({
      type: 'object',
      required: expect.not.arrayContaining(['planId']),
      properties: expect.not.objectContaining({
        planId: expect.anything(),
      }),
    });
  });

  it('advertises expanded operation types and target kinds in planning tool schemas', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));
    const planningSchemaJson = JSON.stringify(toolsByName.get(AgentToolName.ProposeAlbumOperations)?.inputSchema);

    expect(planningSchemaJson).toContain(AgentOperationType.AlbumRemoveAssets);
    expect(planningSchemaJson).toContain(AgentOperationType.SpaceCreate);
    expect(planningSchemaJson).toContain(AgentOperationType.SpaceAddAssets);
    expect(planningSchemaJson).toContain(AgentOperationType.SpaceRemoveAssets);
    expect(planningSchemaJson).toContain(AgentOperationType.SpaceUpdateDetails);
    expect(planningSchemaJson).toContain(AgentOperationType.AssetRotate);
    expect(planningSchemaJson).toContain(AgentOperationType.AssetSetFavorite);
    expect(planningSchemaJson).toContain(AgentOperationType.AssetSetArchive);
    expect(planningSchemaJson).toContain(AgentOperationType.AssetAddTag);
    expect(planningSchemaJson).toContain(AgentOperationType.AssetRemoveTag);
    expect(planningSchemaJson).toContain(AgentOperationTargetKind.NewSpace);
    expect(planningSchemaJson).toContain(AgentOperationTargetKind.ExistingSpace);
    expect(planningSchemaJson).toContain(AgentOperationTargetKind.AssetBatch);
    expect(planningSchemaJson).toContain(AgentOperationTargetKind.ImageEditBatch);
  });

  it('leaves planning tool structural schemas unchanged before planning contracts exist', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));

    for (const toolName of expectedPlanningToolNames) {
      const tool = toolsByName.get(toolName);

      expect(tool?.inputSchema).toEqual(toExpectedInputSchema(AgentOperationPlanToolRequestSchemas[toolName]));
      expect(tool?.inputSchema).not.toHaveProperty('examples');
      expect(tool?.inputSchema).not.toHaveProperty('x-gallery-argumentModes');
      expect(tool?.inputSchema).not.toHaveProperty('oneOf');
    }
  });

  it('does not leak secrets, routes, stack traces, or direct apply guidance through enriched metadata', () => {
    const serialized = JSON.stringify(sut.listTools());

    expect(serialized).not.toMatch(
      /\/api|agent\/internal|bearer|token|provider key|stack trace|applyAlbumOperations|applyOperations|createAlbum|addAssetsToAlbum/i,
    );
  });

  it('returns defensive copies of registry metadata', () => {
    const firstList = sut.listTools();
    firstList[0].description = 'mutated description';
    firstList[0].inputSchema.properties = { mutated: true };
    firstList[0].annotations.readOnlyHint = false;

    const secondList = sut.listTools();

    expect(secondList[0].description).not.toBe('mutated description');
    expect(secondList[0].inputSchema.properties).not.toEqual({ mutated: true });
    expect(secondList[0].annotations.readOnlyHint).toBe(true);
  });
});
