import { Injectable } from '@nestjs/common';
import { AgentOperationPlanToolRequestSchemas } from 'src/dtos/agent-operation.dto';
import { AgentReadToolRequestSchemas } from 'src/dtos/agent-tool.dto';
import { AgentToolName } from 'src/enum';
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

const buildTools = (): AgentMcpToolDefinition[] => [
  defineTool({
    name: AgentToolName.SearchAssets,
    title: 'Search assets',
    description:
      `Search the photo library by date, place, camera metadata, favorites, media type, rating, tags, albums, and result limit.${approvedRequestInstruction}`,
    schema: AgentReadToolRequestSchemas[AgentToolName.SearchAssets],
    annotations: readToolAnnotations,
  }),
  defineTool({
    name: AgentToolName.ReadAssetMetadata,
    title: 'Read asset metadata',
    description:
      `Read metadata for selected assets, including timestamps, location labels, camera fields, rating, favorites, visibility, and tags.${approvedRequestInstruction}`,
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
];

@Injectable()
export class AgentMcpToolRegistryService {
  private readonly tools = buildTools();

  listTools(): AgentMcpToolDefinition[] {
    return this.tools.map((tool) => cloneTool(tool));
  }
}
