import { AgentOperationPlanToolRequestSchemas } from 'src/dtos/agent-operation.dto';
import { AgentReadToolRequestSchemas } from 'src/dtos/agent-tool.dto';
import { AgentToolName } from 'src/enum';
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

describe(AgentMcpToolRegistryService.name, () => {
  let sut: AgentMcpToolRegistryService;

  beforeEach(() => {
    sut = new AgentMcpToolRegistryService();
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

  it('derives read tool input schemas from the existing read tool DTO schemas', () => {
    const toolsByName = new Map(sut.listTools().map((tool) => [tool.name, tool]));

    for (const toolName of expectedReadToolNames) {
      expect(toolsByName.get(toolName)?.inputSchema).toEqual(
        toExpectedInputSchema(AgentReadToolRequestSchemas[toolName]),
      );
    }
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
