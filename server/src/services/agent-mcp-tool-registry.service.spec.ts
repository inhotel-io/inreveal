import { AgentOperationPlanToolRequestSchemas } from 'src/dtos/agent-operation.dto';
import { AgentReadToolRequestSchemas } from 'src/dtos/agent-tool.dto';
import { AgentOperationTargetKind, AgentOperationType, AgentToolName } from 'src/enum';
import { AgentMcpToolContractService } from 'src/services/agent-mcp-tool-contract.service';
import { AgentMcpToolRegistryService } from 'src/services/agent-mcp-tool-registry.service';
import z from 'zod';

const expectedToolNames = [
  AgentToolName.ResolveLocation,
  AgentToolName.ResolveAssetSearchFilters,
  AgentToolName.SearchAssets,
  AgentToolName.FindTripCandidates,
  AgentToolName.ReadSelectionMetadata,
  AgentToolName.CurateSelection,
  AgentToolName.ReadAssetMetadata,
  AgentToolName.ReadAssetPreviews,
  AgentToolName.ReadAssetOriginals,
  AgentToolName.ListAlbums,
  AgentToolName.ReadAlbum,
  AgentToolName.ListSpaces,
  AgentToolName.ReadSpace,
  AgentToolName.SearchUsers,
  AgentToolName.ListDuplicateGroups,
  AgentToolName.ProposeAlbumFromSearch,
  AgentToolName.ProposeAddAssetsToAlbumFromSearch,
  AgentToolName.ProposeSpaceFromSearch,
  AgentToolName.ProposeAddAssetsToSpaceFromSearch,
  AgentToolName.ProposeAssetBatchFromSearch,
  AgentToolName.ProposeAlbumFromSelection,
  AgentToolName.ProposeAssetBatchFromSelection,
  AgentToolName.ProposeAlbumOperations,
  AgentToolName.ReviseProposedOperations,
  AgentToolName.SummarizePlan,
] as const;

const expectedReadToolNames = [
  AgentToolName.ResolveLocation,
  AgentToolName.ResolveAssetSearchFilters,
  AgentToolName.SearchAssets,
  AgentToolName.FindTripCandidates,
  AgentToolName.ReadSelectionMetadata,
  AgentToolName.CurateSelection,
  AgentToolName.ReadAssetMetadata,
  AgentToolName.ReadAssetPreviews,
  AgentToolName.ReadAssetOriginals,
  AgentToolName.ListAlbums,
  AgentToolName.ReadAlbum,
  AgentToolName.ListSpaces,
  AgentToolName.ReadSpace,
  AgentToolName.SearchUsers,
  AgentToolName.ListDuplicateGroups,
] as const;

const expectedPlanningToolNames = [
  AgentToolName.ProposeAlbumFromSearch,
  AgentToolName.ProposeAddAssetsToAlbumFromSearch,
  AgentToolName.ProposeSpaceFromSearch,
  AgentToolName.ProposeAddAssetsToSpaceFromSearch,
  AgentToolName.ProposeAssetBatchFromSearch,
  AgentToolName.ProposeAlbumFromSelection,
  AgentToolName.ProposeAssetBatchFromSelection,
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isProviderForbiddenAssetSourceRef = (value: unknown) =>
  isRecord(value) && value.$ref === '#/$defs/AgentExplicitAssetsAssetSourceInput';

const pruneProviderPlanningSchemaValue = (value: unknown): void => {
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index--) {
      if (isProviderForbiddenAssetSourceRef(value[index])) {
        value.splice(index, 1);
      } else {
        pruneProviderPlanningSchemaValue(value[index]);
      }
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (isRecord(value.properties)) {
    delete value.properties.assetIds;
  }

  if (Array.isArray(value.required)) {
    value.required = value.required.filter((field) => field !== 'assetIds');
  }

  for (const nestedValue of Object.values(value)) {
    pruneProviderPlanningSchemaValue(nestedValue);
  }
};

const toExpectedProviderPlanningInputSchema = (schema: z.ZodType): Record<string, unknown> => {
  const inputSchema = toExpectedInputSchema(schema);
  pruneProviderPlanningSchemaValue(inputSchema);

  if (isRecord(inputSchema.$defs)) {
    delete inputSchema.$defs.AgentExplicitAssetsAssetSourceInput;
  }

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

const resolveJsonSchemaRef = (root: unknown, ref: string): unknown => {
  if (!ref.startsWith('#/$defs/') || !root || typeof root !== 'object') {
    return undefined;
  }

  const definitions = (root as Record<string, unknown>).$defs as Record<string, unknown> | undefined;
  return definitions?.[ref.replace('#/$defs/', '')];
};

const findOperationSchema = (
  value: unknown,
  operationType: AgentOperationType,
  root: unknown = value,
  seenRefs = new Set<string>(),
): Record<string, unknown> | undefined => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findOperationSchema(item, operationType, root, seenRefs);
      if (match) {
        return match;
      }
    }
    return undefined;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.$ref === 'string' && !seenRefs.has(record.$ref)) {
    seenRefs.add(record.$ref);
    return findOperationSchema(resolveJsonSchemaRef(root, record.$ref), operationType, root, seenRefs);
  }

  const properties = record.properties as Record<string, unknown> | undefined;
  const type = properties?.type as Record<string, unknown> | undefined;
  const resolvedType =
    typeof type?.$ref === 'string'
      ? (resolveJsonSchemaRef(root, type.$ref) as Record<string, unknown> | undefined)
      : type;
  if (
    resolvedType?.const === operationType ||
    (Array.isArray(resolvedType?.enum) && resolvedType.enum.includes(operationType))
  ) {
    return record;
  }

  for (const nestedValue of Object.values(record)) {
    const match = findOperationSchema(nestedValue, operationType, root, seenRefs);
    if (match) {
      return match;
    }
  }

  return undefined;
};

describe(AgentMcpToolRegistryService.name, () => {
  let contractService: AgentMcpToolContractService;
  let sut: AgentMcpToolRegistryService;

  beforeEach(() => {
    contractService = new AgentMcpToolContractService();
    sut = new AgentMcpToolRegistryService(contractService);
  });

  it('returns exactly the Gallery MCP tools in stable order', () => {
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

  it('lists resolveAssetSearchFilters with object input schema examples', () => {
    const tool = sut.listTools().find((candidate) => candidate.name === AgentToolName.ResolveAssetSearchFilters);

    expect(tool).toMatchObject({
      title: 'Resolve asset search filters',
      annotations: expect.objectContaining({ readOnlyHint: true }),
      inputSchema: expect.objectContaining({
        type: 'object',
        examples: expect.arrayContaining([{ tags: ['Travel'], albums: ['Berlin'] }]),
      }),
    });
  });

  it('adds model-facing property descriptions for read tool argument fields', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));
    const resolver = toolsByName.get(AgentToolName.ResolveAssetSearchFilters)?.inputSchema;
    const metadata = toolsByName.get(AgentToolName.ReadAssetMetadata)?.inputSchema;
    const selectionMetadata = toolsByName.get(AgentToolName.ReadSelectionMetadata)?.inputSchema;
    const curation = toolsByName.get(AgentToolName.CurateSelection)?.inputSchema;
    const tripCandidates = toolsByName.get(AgentToolName.FindTripCandidates)?.inputSchema;
    const search = toolsByName.get(AgentToolName.SearchAssets)?.inputSchema;
    const searchProperties = search?.properties as Record<string, { description?: string }> | undefined;
    const searchFiltersDescription = searchProperties?.filters?.description;
    const album = toolsByName.get(AgentToolName.ReadAlbum)?.inputSchema;

    expect(metadata?.properties).toMatchObject({
      assetIds: expect.objectContaining({
        description: expect.stringContaining('legacy exact non-search'),
      }),
      detail: expect.objectContaining({
        description: expect.stringContaining('basic'),
      }),
      fields: expect.objectContaining({
        description: expect.stringContaining('filename'),
      }),
      toolCallId: expect.objectContaining({
        description: expect.stringContaining('approved retry'),
      }),
    });
    expect(selectionMetadata?.properties).toMatchObject({
      selectionHandleId: expect.objectContaining({
        description: expect.stringContaining('selectionHandle.id returned by searchAssets'),
      }),
      fields: expect.objectContaining({
        description: expect.stringContaining('itemRef samples'),
      }),
      sampleSize: expect.objectContaining({
        description: expect.stringContaining('selection metadata'),
      }),
      toolCallId: expect.objectContaining({
        description: expect.stringContaining('approved retry'),
      }),
    });
    expect(curation?.properties).toMatchObject({
      selectionHandleId: expect.objectContaining({
        description: expect.stringContaining('curateSelection'),
      }),
      targetCount: expect.objectContaining({
        description: expect.stringContaining('derived selection handle'),
      }),
      strategy: expect.objectContaining({
        description: expect.stringContaining('stored objective scores'),
      }),
      constraints: expect.objectContaining({
        description: expect.stringContaining('metadata-only curation constraints'),
      }),
      sampleSize: expect.objectContaining({
        description: expect.stringContaining('sample'),
      }),
    });
    expect(tripCandidates?.properties).toMatchObject({
      placeHint: expect.objectContaining({
        description: expect.stringContaining('Optional place label'),
      }),
      targetDate: expect.objectContaining({
        description: expect.stringContaining('recent-trip lookback anchor'),
      }),
      lookbackDays: expect.objectContaining({
        description: expect.stringContaining('Defaults to 180'),
      }),
      maxCandidates: expect.objectContaining({
        description: expect.stringContaining('Defaults to 3'),
      }),
      toolCallId: expect.objectContaining({
        description: expect.stringContaining('approved retry'),
      }),
    });
    expect(tripCandidates?.properties).not.toHaveProperty('assetIds');

    const metadataFieldSchema = metadata ? getSchemaDefinition(metadata, 'AgentAssetMetadataField') : undefined;
    const metadataDetailSchema = metadata ? getSchemaDefinition(metadata, 'AgentAssetMetadataDetail') : undefined;

    expect(metadataDetailSchema).toEqual(
      expect.objectContaining({ enum: ['basic', 'descriptive', 'technical', 'allSafe'] }),
    );
    expect(metadataFieldSchema).toEqual(
      expect.objectContaining({
        enum: expect.arrayContaining([
          'type',
          'dates',
          'location',
          'camera',
          'tags',
          'rating',
          'filename',
          'favorite',
          'visibility',
        ]),
      }),
    );
    expect(resolver?.properties).toMatchObject({
      people: expect.objectContaining({
        description: expect.stringContaining('personIds'),
      }),
      tags: expect.objectContaining({
        description: expect.stringContaining('tagIds'),
      }),
      albums: expect.objectContaining({
        description: expect.stringContaining('albumIds'),
      }),
      spaces: expect.objectContaining({
        description: expect.stringContaining('spaceId'),
      }),
      cameraMakes: expect.objectContaining({
        description: expect.stringContaining('make'),
      }),
      cameraModels: expect.objectContaining({
        description: expect.stringContaining('model'),
      }),
      lensModels: expect.objectContaining({
        description: expect.stringContaining('lensModel'),
      }),
      scope: expect.objectContaining({
        description: expect.stringContaining('search scope'),
      }),
    });
    expect(search?.properties).toMatchObject({
      mode: expect.objectContaining({
        description: expect.stringContaining('smart, description, ocr, or filename with query'),
      }),
      query: expect.objectContaining({
        description: expect.stringContaining('use this with smart, description, ocr, or filename modes'),
      }),
      filters: expect.objectContaining({
        description: expect.stringContaining('Currently executable filters'),
      }),
      limit: expect.objectContaining({
        description: expect.stringContaining('100'),
      }),
      page: expect.objectContaining({
        description: expect.stringContaining('Use the returned nextPage value as page'),
      }),
      order: expect.objectContaining({
        description: expect.stringContaining('Only desc is currently executable'),
      }),
      detail: expect.objectContaining({
        description: expect.stringContaining('handle'),
      }),
      fields: expect.objectContaining({
        description: expect.stringContaining('location'),
      }),
      sampleSize: expect.objectContaining({
        description: expect.stringContaining('25'),
      }),
      toolCallId: expect.objectContaining({
        description: expect.stringContaining('approved retry'),
      }),
    });
    expect(searchProperties?.detail?.description).not.toContain('ids returns compact asset ids');
    expect(search?.properties).toMatchObject({
      mode: expect.objectContaining({
        description: expect.not.stringContaining('later slice'),
      }),
      query: expect.objectContaining({
        description: expect.not.stringContaining('not available until a later slice'),
      }),
      page: expect.objectContaining({
        description: expect.not.stringContaining('continuing a previous search'),
      }),
      order: expect.objectContaining({
        description: expect.not.stringContaining('Result order for the selected search mode'),
      }),
    });
    expect(searchFiltersDescription).toContain('people, space, visibility');
    expect(searchFiltersDescription).not.toContain('later slice');
    expect(searchFiltersDescription).not.toContain('contract fields');
    expect(album?.properties).toMatchObject({
      albumId: expect.objectContaining({
        description: expect.stringContaining('album id returned by listAlbums'),
      }),
      toolCallId: expect.objectContaining({
        description: expect.stringContaining('approved retry'),
      }),
    });

    const space = toolsByName.get(AgentToolName.ReadSpace)?.inputSchema;
    expect(space?.properties).toMatchObject({
      spaceId: expect.objectContaining({
        description: expect.stringContaining('space id returned by listSpaces'),
      }),
      toolCallId: expect.objectContaining({
        description: expect.stringContaining('approved retry'),
      }),
    });
  });

  it('publishes object input schemas for space tools with expected fields', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));
    const listSpaces = toolsByName.get(AgentToolName.ListSpaces);
    const readSpace = toolsByName.get(AgentToolName.ReadSpace);

    expect(listSpaces?.inputSchema).toMatchObject({
      type: 'object',
      properties: expect.objectContaining({
        toolCallId: expect.any(Object),
      }),
    });
    expect(listSpaces?.inputSchema.required).toBeUndefined();

    expect(readSpace?.inputSchema).toMatchObject({
      type: 'object',
      properties: expect.objectContaining({
        spaceId: expect.any(Object),
        toolCallId: expect.any(Object),
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

  it('enriches planning tool descriptions from the planning tool contracts', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));

    for (const contract of contractService.listPlanningToolContracts()) {
      const tool = toolsByName.get(contract.name);

      expect(tool?.title).toBe(contract.title);
      expect(tool?.description).toContain(contract.description);
      expect(tool?.description).toContain(contract.usage);
      expect(tool?.description).toContain('review');
      expect(tool?.description).not.toMatch(/\/api|agent\/internal|bearer|token|provider key|stack trace/i);
    }
  });

  it('publishes valid contract examples on planning tool input schemas', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));

    for (const contract of contractService.listPlanningToolContracts()) {
      const tool = toolsByName.get(contract.name);
      const examples = tool?.inputSchema.examples;

      expect(examples).toEqual(contract.examples.map((example) => example.arguments));
      expect(examples).toHaveLength(contract.examples.length);
      for (const exampleArguments of examples as Record<string, unknown>[]) {
        const result = AgentOperationPlanToolRequestSchemas[contract.name].safeParse(exampleArguments);

        expect(result.success, `${contract.name} example should parse`).toBe(true);
      }
    }
  });

  it('lists the high-level album workflow tools with valid examples', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));

    for (const toolName of [
      AgentToolName.ProposeAlbumFromSearch,
      AgentToolName.ProposeAddAssetsToAlbumFromSearch,
    ] as const) {
      const tool = toolsByName.get(toolName);
      const contract = contractService.getPlanningToolContract(toolName);

      expect(contract).toBeDefined();
      if (!contract) {
        throw new Error(`Missing planning contract for ${toolName}`);
      }
      expect(tool?.title).toBe(contract.title);
      expect(tool?.description).toContain('preferred');
      expect(tool?.description).toContain('review');
      expect(tool?.inputSchema).toMatchObject({ type: 'object' });
      expect(tool?.inputSchema.examples).toEqual(contract.examples.map((example) => example.arguments));

      for (const exampleArguments of tool?.inputSchema.examples as Record<string, unknown>[]) {
        const result = AgentOperationPlanToolRequestSchemas[toolName].safeParse(exampleArguments);
        expect(result.success, `${toolName} example should parse`).toBe(true);
      }
    }
  });

  it('lists the high-level space workflow tools with valid examples', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));

    for (const toolName of [
      AgentToolName.ProposeSpaceFromSearch,
      AgentToolName.ProposeAddAssetsToSpaceFromSearch,
    ] as const) {
      const tool = toolsByName.get(toolName);
      const contract = contractService.getPlanningToolContract(toolName);

      expect(contract).toBeDefined();
      if (!contract) {
        throw new Error(`Missing planning contract for ${toolName}`);
      }
      expect(tool?.title).toBe(contract.title);
      expect(tool?.description).toContain('preferred');
      expect(tool?.description).toContain('review');
      expect(tool?.inputSchema).toMatchObject({ type: 'object' });
      expect(tool?.inputSchema.examples).toEqual(contract.examples.map((example) => example.arguments));

      for (const exampleArguments of tool?.inputSchema.examples as Record<string, unknown>[]) {
        const result = AgentOperationPlanToolRequestSchemas[toolName].safeParse(exampleArguments);
        expect(result.success, `${toolName} example should parse`).toBe(true);
      }
    }
  });

  it('adds model-facing property descriptions for planning tool argument fields', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));
    const proposal = toolsByName.get(AgentToolName.ProposeAlbumOperations)?.inputSchema;
    const revision = toolsByName.get(AgentToolName.ReviseProposedOperations)?.inputSchema;
    const summary = toolsByName.get(AgentToolName.SummarizePlan)?.inputSchema;

    expect(proposal?.properties).toMatchObject({
      summary: expect.objectContaining({ description: expect.stringContaining('human-readable plan summary') }),
      operations: expect.objectContaining({ description: expect.stringContaining('reviewable Gallery operations') }),
    });
    expect(revision?.properties).toMatchObject({
      planId: expect.objectContaining({ description: expect.stringContaining('existing proposed plan') }),
      feedback: expect.objectContaining({ description: expect.stringContaining('user feedback') }),
    });
    expect(summary?.properties).toMatchObject({
      planId: expect.objectContaining({ description: expect.stringContaining('existing proposed plan') }),
      focus: expect.objectContaining({ description: expect.stringContaining('optional summary focus') }),
    });
  });

  it('publishes contract argument mode metadata for every planning tool without oneOf noise', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));

    for (const contract of contractService.listPlanningToolContracts()) {
      const tool = toolsByName.get(contract.name);

      expect(tool?.inputSchema['x-gallery-argumentModes']).toEqual(
        contract.argumentModes.map((mode) => ({
          name: mode.name,
          description: mode.description,
          requiredFields: mode.requiredFields,
          forbiddenFields:
            contract.name === AgentToolName.ProposeAlbumFromSelection ||
            contract.name === AgentToolName.ProposeAssetBatchFromSelection
              ? mode.forbiddenFields.filter((field) => field !== 'assetIds')
              : mode.forbiddenFields,
          whenToUse: mode.whenToUse,
        })),
      );
      expect(tool?.inputSchema).not.toHaveProperty('oneOf');
    }
  });

  it('keeps read tool input schemas top-level object schemas without root oneOf unions', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));

    for (const toolName of expectedReadToolNames) {
      const schema = toolsByName.get(toolName)?.inputSchema;

      expect(schema).toMatchObject({ type: 'object' });
      expect(schema).not.toHaveProperty('oneOf');
      expect(schema?.['x-gallery-argumentModes']).toEqual(expect.any(Array));
    }
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

  it('advertises expanded search contract fields on searchAssets', () => {
    const searchTool = sut.listTools().find((tool) => tool.name === AgentToolName.SearchAssets);
    const searchFiltersSchema = searchTool
      ? getSchemaDefinition(searchTool.inputSchema, 'AgentSearchAssetsFilters')
      : undefined;

    expect(searchTool).toBeDefined();
    expect(searchTool?.description).toContain('metadata');
    expect(searchTool?.description).toContain('mode');
    expect(searchTool?.description).toContain('page');
    expect(searchTool?.inputSchema).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          mode: expect.any(Object),
          query: expect.any(Object),
          filters: expect.objectContaining({ $ref: '#/$defs/AgentSearchAssetsFilters' }),
          limit: expect.any(Object),
          page: expect.any(Object),
          order: expect.any(Object),
          detail: expect.any(Object),
          fields: expect.any(Object),
          sampleSize: expect.any(Object),
        }),
      }),
    );
    expect(JSON.stringify(searchTool?.inputSchema)).toContain('summary');
    expect(JSON.stringify(searchTool?.inputSchema)).toContain('visibility');
    expect(searchFiltersSchema).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          takenAfter: expect.any(Object),
          takenBefore: expect.any(Object),
          createdAfter: expect.any(Object),
          createdBefore: expect.any(Object),
          updatedAfter: expect.any(Object),
          updatedBefore: expect.any(Object),
          city: expect.any(Object),
          state: expect.any(Object),
          country: expect.any(Object),
          personIds: expect.any(Object),
          spaceId: expect.any(Object),
          spacePersonIds: expect.any(Object),
          withSharedSpaces: expect.any(Object),
          visibility: expect.any(Object),
          isNotInAlbum: expect.any(Object),
        }),
      }),
    );
  });

  it('preserves DTO-derived planning tool input schema structure after stripping provider-forbidden raw IDs', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));

    for (const toolName of expectedPlanningToolNames) {
      expect(stripContractMetadata(toolsByName.get(toolName)?.inputSchema)).toEqual(
        stripContractMetadata(toExpectedProviderPlanningInputSchema(AgentOperationPlanToolRequestSchemas[toolName])),
      );
    }
  });

  it('publishes selection workflow schemas without raw asset ids', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));

    for (const toolName of [
      AgentToolName.ProposeAlbumFromSelection,
      AgentToolName.ProposeAssetBatchFromSelection,
    ] as const) {
      const schemaJson = JSON.stringify(toolsByName.get(toolName)?.inputSchema);

      expect(schemaJson).toContain('selectionHandleId');
      expect(schemaJson).not.toContain('"assetIds"');
      expect(schemaJson).not.toContain('explicitAssets');
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
    expect(planningSchemaJson).toContain(AgentOperationType.AssetUpdateMetadata);
    expect(planningSchemaJson).toContain(AgentOperationType.AssetAddTag);
    expect(planningSchemaJson).toContain(AgentOperationType.AssetRemoveTag);
    expect(planningSchemaJson).toContain('dateTimeRelative');
    expect(planningSchemaJson).toContain('integer minute offset');
    expect(planningSchemaJson).toContain('place names are not accepted');
    expect(planningSchemaJson).toContain(AgentOperationTargetKind.NewSpace);
    expect(planningSchemaJson).toContain(AgentOperationTargetKind.ExistingSpace);
    expect(planningSchemaJson).toContain(AgentOperationTargetKind.AssetBatch);
    expect(planningSchemaJson).toContain(AgentOperationTargetKind.ImageEditBatch);
  });

  it('describes provider planning sources as handle-backed and raw assetIds as internal materialized fields', () => {
    const proposal = sut.listTools().find((tool) => tool.name === AgentToolName.ProposeAlbumOperations);
    const schemaJson = JSON.stringify(proposal?.inputSchema);

    expect(schemaJson).toContain('provider planning rejects raw assetIds');
    expect(schemaJson).toContain('Gallery materializes IDs server-side');
    expect(schemaJson).toContain('assetSource.selectionHandle');
    expect(schemaJson).toContain('assetSelectionHandleId');
    expect(schemaJson).toContain('assetSource.explicitAssets is internal-only');
    expect(schemaJson).not.toMatch(/paste|copy.*raw assetIds/i);
    expect(schemaJson).not.toContain('"kind":"explicitAssets"');
  });

  it('does not advertise provider-rejected raw assetIds or explicit asset sources in planning schemas', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));
    const proposal = toolsByName.get(AgentToolName.ProposeAlbumOperations);
    const revision = toolsByName.get(AgentToolName.ReviseProposedOperations);
    const workflow = toolsByName.get(AgentToolName.ProposeAssetBatchFromSearch);
    const dtoSchemaJson = JSON.stringify(
      toExpectedInputSchema(AgentOperationPlanToolRequestSchemas[AgentToolName.ProposeAlbumOperations]),
    );

    expect(dtoSchemaJson).toContain('AgentExplicitAssetsAssetSourceInput');
    expect(dtoSchemaJson).toContain('"assetIds"');

    for (const tool of [proposal, revision, workflow]) {
      const schemaJson = JSON.stringify(tool?.inputSchema);

      expect(schemaJson).not.toContain('AgentExplicitAssetsAssetSourceInput');
      expect(schemaJson).not.toContain('"const":"explicitAssets"');
    }

    for (const operationType of [
      AgentOperationType.AlbumAddAssets,
      AgentOperationType.AlbumSetCover,
      AgentOperationType.SpaceAddAssets,
      AgentOperationType.AssetSetFavorite,
      AgentOperationType.AssetUpdateMetadata,
    ]) {
      const operationSchema = findOperationSchema(proposal?.inputSchema, operationType);
      const properties = operationSchema?.properties as Record<string, unknown> | undefined;

      expect(properties, operationType).toBeDefined();
      expect(properties, operationType).not.toHaveProperty('assetIds');
      expect(properties, operationType).toHaveProperty('assetSource');
      expect(properties, operationType).toHaveProperty('assetSelectionHandleId');
    }
  });

  it('publishes a closed-world asset.updateMetadata payload schema with only supported metadata fields', () => {
    const proposal = sut.listTools().find((tool) => tool.name === AgentToolName.ProposeAlbumOperations);
    const operationSchema = findOperationSchema(proposal?.inputSchema, AgentOperationType.AssetUpdateMetadata);
    const payloadSchema = (operationSchema?.properties as Record<string, unknown> | undefined)?.payload as
      | Record<string, unknown>
      | undefined;
    const payloadProperties = payloadSchema?.properties as Record<string, unknown> | undefined;
    const rawTargetKindSchema = (operationSchema?.properties as Record<string, unknown> | undefined)?.targetKind as
      | Record<string, unknown>
      | undefined;
    const targetKindSchema =
      typeof rawTargetKindSchema?.$ref === 'string'
        ? (resolveJsonSchemaRef(proposal?.inputSchema, rawTargetKindSchema.$ref) as Record<string, unknown> | undefined)
        : rawTargetKindSchema;

    expect(operationSchema).toBeDefined();
    expect(targetKindSchema).toEqual(
      expect.objectContaining({
        const: AgentOperationTargetKind.AssetBatch,
      }),
    );
    expect(payloadSchema).toMatchObject({ additionalProperties: false });
    expect(payloadProperties).toEqual(
      expect.objectContaining({
        description: expect.any(Object),
        rating: expect.any(Object),
        dateTimeOriginal: expect.any(Object),
        dateTimeRelative: expect.any(Object),
        timeZone: expect.any(Object),
        latitude: expect.any(Object),
        longitude: expect.any(Object),
      }),
    );
    expect(payloadProperties).not.toEqual(
      expect.objectContaining({
        placeName: expect.anything(),
        city: expect.anything(),
        country: expect.anything(),
        title: expect.anything(),
      }),
    );
  });

  it('advertises asset.updateMetadata in the high-level asset batch workflow schema', () => {
    const proposal = sut.listTools().find((tool) => tool.name === AgentToolName.ProposeAssetBatchFromSearch);
    const schemaJson = JSON.stringify(proposal?.inputSchema);

    expect(schemaJson).toContain(AgentOperationType.AssetUpdateMetadata);
    expect(schemaJson).toContain('description');
    expect(schemaJson).toContain('rating');
    expect(schemaJson).toContain('dateTimeOriginal');
    expect(schemaJson).toContain('dateTimeRelative');
    expect(schemaJson).toContain('timeZone');
    expect(schemaJson).toContain('latitude');
    expect(schemaJson).toContain('longitude');
    expect(schemaJson).toContain('place names are not accepted');
  });

  it('does not leak secrets, routes, stack traces, or direct apply guidance through enriched metadata', () => {
    const serialized = JSON.stringify(sut.listTools());

    expect(serialized).not.toMatch(
      /\/api|agent\/internal|bearer|token|provider key|stack trace|applyAlbumOperations|applyOperations|(?<![A-Z.])createAlbum|addAssetsToAlbum(?!FromSearch)/i,
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
