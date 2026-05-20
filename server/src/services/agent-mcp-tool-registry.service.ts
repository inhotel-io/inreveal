import { Injectable } from '@nestjs/common';
import { AgentOperationPlanToolRequestSchemas } from 'src/dtos/agent-operation.dto';
import { AgentReadToolRequestSchemas } from 'src/dtos/agent-tool.dto';
import { AgentToolName } from 'src/enum';
import { AgentMcpToolContractService } from 'src/services/agent-mcp-tool-contract.service';
import type { AgentMcpArgumentMode, AgentMcpToolContract } from 'src/types/agent-mcp-contract.types';
import type { AgentMcpToolAnnotations, AgentMcpToolDefinition } from 'src/types/agent-mcp.types';
import z, { type ZodType } from 'zod';

const readToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const satisfies AgentMcpToolAnnotations;

const planningToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const satisfies AgentMcpToolAnnotations;

type AgentMcpToolDefinitionInput = Omit<AgentMcpToolDefinition, 'inputSchema'> & {
  schema: ZodType;
};

const toInputSchema = (schema: ZodType): Record<string, unknown> => {
  const inputSchema = {
    ...(z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' }) as Record<string, unknown>),
  };
  delete inputSchema['~standard'];

  if (inputSchema.type !== 'object') {
    throw new Error('MCP tool inputSchema must be a JSON object schema');
  }

  return inputSchema;
};

const defineTool = ({ schema, ...tool }: AgentMcpToolDefinitionInput): AgentMcpToolDefinition => ({
  ...tool,
  inputSchema: toInputSchema(schema),
});

const cloneTool = (tool: AgentMcpToolDefinition): AgentMcpToolDefinition => structuredClone(tool);
const approvedRequestInstruction =
  ' If approval is required, Gallery may ask the user; after approval, continue the approved request by calling this tool with toolCallId.';

const propertyDescriptions = {
  assetIds: 'Asset ids for a new asset read request or planning operation. Use ids returned by Gallery tools.',
  albumId: 'The album id returned by listAlbums for a new album read request.',
  spaceId: 'The shared space id returned by listSpaces for a new space read request.',
  query: 'Search visible Gallery users by name or email before proposing shared-space member changes.',
  filters: 'Put search filters here for date, place, camera, favorite, rating, album, tag, and media searches.',
  limit: 'Maximum number of results to return. Use a positive integer up to 10000.',
  toolCallId: 'Use only for an approved retry after Gallery approves a pending read request.',
  summary: 'A human-readable plan summary describing what Gallery should review.',
  operations: 'The reviewable Gallery operations to propose or revise. Do not apply changes directly.',
  planId: 'The id of an existing proposed plan returned by Gallery.',
  feedback: 'Optional user feedback explaining how to revise the existing plan.',
  focus: 'An optional summary focus, such as risks, selected changes, or skipped operations.',
} as const satisfies Record<string, string>;

const toArgumentModeMetadata = (mode: AgentMcpArgumentMode) => ({
  name: mode.name,
  description: mode.description,
  requiredFields: mode.requiredFields,
  forbiddenFields: mode.forbiddenFields,
  whenToUse: mode.whenToUse,
});

const enrichToolFromContract = (
  tool: AgentMcpToolDefinition,
  contract: AgentMcpToolContract,
): AgentMcpToolDefinition => {
  const inputSchema = structuredClone(tool.inputSchema);
  const properties = inputSchema.properties;

  if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
    for (const [field, description] of Object.entries(propertyDescriptions)) {
      const property = (properties as Record<string, unknown>)[field];

      if (property && typeof property === 'object' && !Array.isArray(property)) {
        (property as Record<string, unknown>).description = description;
      }
    }
  }

  inputSchema.examples = contract.examples.map((example) => structuredClone(example.arguments));
  inputSchema['x-gallery-argumentModes'] = contract.argumentModes.map((mode) => toArgumentModeMetadata(mode));

  return {
    ...tool,
    title: contract.title,
    description: `${contract.description} ${contract.usage} Modes: ${contract.argumentModes
      .map((mode) => `${mode.name}: ${mode.whenToUse}`)
      .join(' ')}${contract.approvalRetry ? approvedRequestInstruction : ''}`,
    inputSchema,
  };
};

const getToolContract = (
  contractsByName: ReadonlyMap<AgentToolName, AgentMcpToolContract>,
  toolName: AgentToolName,
): AgentMcpToolContract => {
  const contract = contractsByName.get(toolName);

  if (!contract) {
    throw new Error(`Missing MCP tool contract for ${toolName}`);
  }

  return contract;
};

const buildTools = (contractsByName: ReadonlyMap<AgentToolName, AgentMcpToolContract>): AgentMcpToolDefinition[] =>
  [
    defineTool({
      name: AgentToolName.SearchAssets,
      title: 'Search assets',
      description: `Search the photo library by date, place, camera metadata, favorites, media type, rating, tags, albums, and result limit.${approvedRequestInstruction}`,
      schema: AgentReadToolRequestSchemas[AgentToolName.SearchAssets],
      annotations: readToolAnnotations,
    }),
    defineTool({
      name: AgentToolName.ReadAssetMetadata,
      title: 'Read asset metadata',
      description: `Read metadata for selected assets, including timestamps, location labels, camera fields, rating, favorites, visibility, and tags.${approvedRequestInstruction}`,
      schema: AgentReadToolRequestSchemas[AgentToolName.ReadAssetMetadata],
      annotations: readToolAnnotations,
    }),
    defineTool({
      name: AgentToolName.ReadAssetPreviews,
      title: 'Read asset previews',
      description: `Read preview media references for selected assets after Gallery approval when approval is required.${approvedRequestInstruction}`,
      schema: AgentReadToolRequestSchemas[AgentToolName.ReadAssetPreviews],
      annotations: readToolAnnotations,
    }),
    defineTool({
      name: AgentToolName.ReadAssetOriginals,
      title: 'Read asset originals',
      description: `Read original media references for selected assets after Gallery approval when approval is required.${approvedRequestInstruction}`,
      schema: AgentReadToolRequestSchemas[AgentToolName.ReadAssetOriginals],
      annotations: readToolAnnotations,
    }),
    defineTool({
      name: AgentToolName.ListAlbums,
      title: 'List albums',
      description: `List albums visible to the authenticated session user.${approvedRequestInstruction}`,
      schema: AgentReadToolRequestSchemas[AgentToolName.ListAlbums],
      annotations: readToolAnnotations,
    }),
    defineTool({
      name: AgentToolName.ReadAlbum,
      title: 'Read album',
      description: `Read one visible album with its summary fields and asset identifiers.${approvedRequestInstruction}`,
      schema: AgentReadToolRequestSchemas[AgentToolName.ReadAlbum],
      annotations: readToolAnnotations,
    }),
    defineTool({
      name: AgentToolName.ListSpaces,
      title: 'List spaces',
      description: `List shared spaces visible to the authenticated session user.${approvedRequestInstruction}`,
      schema: AgentReadToolRequestSchemas[AgentToolName.ListSpaces],
      annotations: readToolAnnotations,
    }),
    defineTool({
      name: AgentToolName.ReadSpace,
      title: 'Read space',
      description: `Read one visible shared space with summary fields, member summaries, and bounded asset identifiers.${approvedRequestInstruction}`,
      schema: AgentReadToolRequestSchemas[AgentToolName.ReadSpace],
      annotations: readToolAnnotations,
    }),
    defineTool({
      name: AgentToolName.SearchUsers,
      title: 'Search users',
      description: `Search Gallery users visible to the authenticated session user before proposing shared-space member changes.${approvedRequestInstruction}`,
      schema: AgentReadToolRequestSchemas[AgentToolName.SearchUsers],
      annotations: readToolAnnotations,
    }),
    defineTool({
      name: AgentToolName.ProposeAlbumOperations,
      title: 'Propose album operations',
      description: 'Create a proposed album operation plan for user review without applying gallery changes.',
      schema: AgentOperationPlanToolRequestSchemas[AgentToolName.ProposeAlbumOperations],
      annotations: planningToolAnnotations,
    }),
    defineTool({
      name: AgentToolName.ReviseProposedOperations,
      title: 'Revise proposed operations',
      description: 'Create a revised album operation plan from feedback without applying gallery changes.',
      schema: AgentOperationPlanToolRequestSchemas[AgentToolName.ReviseProposedOperations],
      annotations: planningToolAnnotations,
    }),
    defineTool({
      name: AgentToolName.SummarizePlan,
      title: 'Summarize plan',
      description: 'Summarize the current proposed album operation plan for user review.',
      schema: AgentOperationPlanToolRequestSchemas[AgentToolName.SummarizePlan],
      annotations: planningToolAnnotations,
    }),
  ].map((tool) =>
    Object.hasOwn(AgentReadToolRequestSchemas, tool.name) ||
    Object.hasOwn(AgentOperationPlanToolRequestSchemas, tool.name)
      ? enrichToolFromContract(tool, getToolContract(contractsByName, tool.name))
      : tool,
  );

@Injectable()
export class AgentMcpToolRegistryService {
  private readonly tools: AgentMcpToolDefinition[];

  constructor(private readonly contractService: AgentMcpToolContractService) {
    const contractsByName = new Map(
      this.contractService.listToolContracts().map((contract) => [contract.name, contract]),
    );
    this.tools = buildTools(contractsByName);
  }

  listTools(): AgentMcpToolDefinition[] {
    return this.tools.map((tool) => cloneTool(tool));
  }
}
