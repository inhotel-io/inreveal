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
  assetIds:
    'legacy exact non-search asset IDs for a new asset read request or small inspected planning operation. Do not copy IDs from searchAssets results; use selection handles or source refs for search selections.',
  selectionHandleId:
    'The selectionHandle.id returned by searchAssets for the current bounded search page. Use this for readSelectionMetadata instead of copying search asset IDs.',
  albumId: 'Existing album id returned by listAlbums/readAlbum.',
  albumName: 'Album name to create or exact visible album name to resolve.',
  spaceId: 'Existing shared space id returned by listSpaces/readSpace.',
  spaceName: 'Shared space name to create or exact visible shared space name to resolve.',
  description: 'Optional album or shared space description.',
  color: 'Optional shared space color.',
  people: 'Visible person names to resolve into searchAssets personIds.',
  tags: 'Visible tag names to resolve into searchAssets tagIds.',
  albums: 'Visible album names to resolve into searchAssets albumIds.',
  spaces: 'Visible shared space names to resolve into searchAssets spaceId.',
  cameraMakes: 'Visible camera make names to resolve into the canonical searchAssets make value.',
  cameraModels: 'Visible camera model names to resolve into the canonical searchAssets model value.',
  lensModels: 'Visible lens names to resolve into the canonical searchAssets lensModel value.',
  scope: 'Optional search scope for resolving names, such as a visible space or shared-space inclusion.',
  mode: 'Search mode. Use metadata for structured filters, or smart, description, ocr, or filename with query.',
  query:
    'Query text. For searchAssets, use this with smart, description, ocr, or filename modes; for searchUsers use a name or email.',
  filters:
    'Currently executable filters include taken date, place, camera, favorite, rating, album, tag, media, people, space, visibility, and shared-space person fields.',
  limit: 'Maximum number of results to return. Defaults to 100 and accepts a positive integer up to 10000.',
  page: 'One-based result page. Use the returned nextPage value as page to continue the same search with the same mode, query, filters, order, and limit.',
  order: 'Result order. Only desc is currently executable.',
  detail:
    'Result detail level. For searchAssets, handle returns selectionHandle/sourceRef and compact counts, summary adds a compact sample, and metadata returns metadata rows for bounded inspection; legacy ids requests still parse but are not the advertised search path. For readAssetMetadata, use basic, descriptive, technical, or allSafe metadata presets.',
  fields:
    'Optional metadata field groups for summary samples, metadata rows, itemRef samples, or legacy readAssetMetadata custom reads: type, dates, location, camera, tags, rating, filename, favorite, visibility.',
  sampleSize: 'Maximum summary or selection metadata sample rows from 0 to 25. Use 0 to disable samples.',
  toolCallId: 'Use only for an approved retry after Gallery approves a pending read request.',
  summary: 'A human-readable plan summary describing what Gallery should review.',
  operations: 'The reviewable Gallery operations to propose or revise. Do not apply changes directly.',
  assetSource:
    'Preferred source object for search-backed planning. Use kind search for declarative filters or previousSearch for a sourceRef returned by searchAssets.',
  action: 'One constrained asset batch action to propose from a search source.',
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
      name: AgentToolName.ResolveAssetSearchFilters,
      title: 'Resolve asset search filters',
      description: `Resolve user-facing names into searchAssets-compatible filter ids and values.${approvedRequestInstruction}`,
      schema: AgentReadToolRequestSchemas[AgentToolName.ResolveAssetSearchFilters],
      annotations: readToolAnnotations,
    }),
    defineTool({
      name: AgentToolName.SearchAssets,
      title: 'Search assets',
      description: `Search the photo library by mode, metadata filters, text query, page, order, and result limit.${approvedRequestInstruction}`,
      schema: AgentReadToolRequestSchemas[AgentToolName.SearchAssets],
      annotations: readToolAnnotations,
    }),
    defineTool({
      name: AgentToolName.ReadSelectionMetadata,
      title: 'Read selection metadata',
      description: `Read aggregate counts and bounded itemRef metadata samples for a search selection handle.${approvedRequestInstruction}`,
      schema: AgentReadToolRequestSchemas[AgentToolName.ReadSelectionMetadata],
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
      name: AgentToolName.ProposeAlbumFromSearch,
      title: 'Propose album from search',
      description: 'Preferred album-from-search workflow that creates a reviewable plan.',
      schema: AgentOperationPlanToolRequestSchemas[AgentToolName.ProposeAlbumFromSearch],
      annotations: planningToolAnnotations,
    }),
    defineTool({
      name: AgentToolName.ProposeAddAssetsToAlbumFromSearch,
      title: 'Propose add assets to album from search',
      description: 'Preferred workflow for adding search matches to an existing album as a reviewable plan.',
      schema: AgentOperationPlanToolRequestSchemas[AgentToolName.ProposeAddAssetsToAlbumFromSearch],
      annotations: planningToolAnnotations,
    }),
    defineTool({
      name: AgentToolName.ProposeSpaceFromSearch,
      title: 'Propose space from search',
      description: 'Preferred space-from-search workflow that creates a reviewable plan.',
      schema: AgentOperationPlanToolRequestSchemas[AgentToolName.ProposeSpaceFromSearch],
      annotations: planningToolAnnotations,
    }),
    defineTool({
      name: AgentToolName.ProposeAddAssetsToSpaceFromSearch,
      title: 'Propose add assets to space from search',
      description: 'Preferred workflow for adding search matches to an existing shared space as a reviewable plan.',
      schema: AgentOperationPlanToolRequestSchemas[AgentToolName.ProposeAddAssetsToSpaceFromSearch],
      annotations: planningToolAnnotations,
    }),
    defineTool({
      name: AgentToolName.ProposeAssetBatchFromSearch,
      title: 'Propose asset batch from search',
      description: 'Preferred workflow for favorite, archive, tag, or rotate actions on matching photos.',
      schema: AgentOperationPlanToolRequestSchemas[AgentToolName.ProposeAssetBatchFromSearch],
      annotations: planningToolAnnotations,
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
