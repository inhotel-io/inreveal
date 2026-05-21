import { Injectable } from '@nestjs/common';
import { AgentOperationPlanToolRequestSchemas } from 'src/dtos/agent-operation.dto';
import { AgentReadToolRequestSchemas } from 'src/dtos/agent-tool.dto';
import { AgentToolName } from 'src/enum';
import { AgentMcpToolContractService } from 'src/services/agent-mcp-tool-contract.service';
import type {
  AgentMcpPlanningToolName,
  AgentMcpReadToolName,
  AgentMcpToolContract,
} from 'src/types/agent-mcp-contract.types';

export const AGENT_MCP_GENERATED_PROMPT_RELATIVE_PATH = 'agent-runner/src/generated/gallery-mcp-prompt-cheat-sheet.mjs';

export type AgentMcpPromptExample = {
  toolName: AgentToolName;
  piToolName: `mcp_gallery_${string}`;
  exampleName: string;
  arguments: Record<string, unknown>;
};

const promptExampleSelections = [
  { toolName: AgentToolName.ResolveAssetSearchFilters, exampleName: 'resolve-named-filters' },
  { toolName: AgentToolName.SearchAssets, exampleName: 'bounded-date-location-search' },
  { toolName: AgentToolName.ReadAssetMetadata, exampleName: 'approved-retry' },
  { toolName: AgentToolName.ListSpaces, exampleName: 'list-visible-spaces' },
  { toolName: AgentToolName.ReadSpace, exampleName: 'read-space-details' },
  { toolName: AgentToolName.ProposeAlbumOperations, exampleName: 'create-empty-album' },
  { toolName: AgentToolName.ProposeAlbumOperations, exampleName: 'create-album-and-add-assets' },
  { toolName: AgentToolName.ProposeAlbumOperations, exampleName: 'add-assets-to-existing-space' },
  { toolName: AgentToolName.ProposeAlbumOperations, exampleName: 'remove-assets-from-existing-space' },
  { toolName: AgentToolName.ProposeAlbumOperations, exampleName: 'rename-existing-space' },
  { toolName: AgentToolName.ProposeAlbumOperations, exampleName: 'update-existing-space-description' },
  { toolName: AgentToolName.ProposeAlbumOperations, exampleName: 'clear-existing-space-description' },
  { toolName: AgentToolName.ProposeAlbumOperations, exampleName: 'update-existing-space-color' },
] as const;

@Injectable()
export class AgentMcpPromptService {
  constructor(private readonly contractService: AgentMcpToolContractService) {}

  generatePromptCheatSheet(): string {
    const examples = this.listPromptExamples();
    const contracts = this.contractService.listToolContracts();
    const toolList = contracts.map((contract) => this.toPiToolName(contract.name)).join(', ');
    const resolveFilters = this.getPromptExample(
      examples,
      AgentToolName.ResolveAssetSearchFilters,
      'resolve-named-filters',
    );
    const normalRead = this.getPromptExample(examples, AgentToolName.SearchAssets, 'bounded-date-location-search');
    const retryRead = this.getPromptExample(examples, AgentToolName.ReadAssetMetadata, 'approved-retry');
    const listSpaces = this.getPromptExample(examples, AgentToolName.ListSpaces, 'list-visible-spaces');
    const readSpace = this.getPromptExample(examples, AgentToolName.ReadSpace, 'read-space-details');
    const searchContract = this.getContract(AgentToolName.SearchAssets);
    const metadataContract = this.getContract(AgentToolName.ReadAssetMetadata);
    const planContract = this.getContract(AgentToolName.ProposeAlbumOperations);
    const retryMode = metadataContract.argumentModes.find((mode) => mode.name === 'approved-retry');
    const validationMistake = planContract.commonMistakes.find((mistake) => mistake.exampleName);

    return this.sanitizePrompt(
      [
        'Gallery MCP tool-use cheat sheet',
        `Tool: ${toolList}`,
        `R: Known ID filters: people, spaces, visibility, dates, albums, tags, camera fields, ratings, and media types. Use returned personIds or spaceId plus spacePersonIds; if hasMore, continue with nextPage.`,
        'Text search: smart/ocr/description/filename require query',
        `Write: call ${this.toPiToolName(planContract.name)} for reviewable plans.`,
        this.renderSafetyGuidance(contracts),
        this.renderApprovalRetryGuidance(metadataContract, retryMode),
        `Resolve names before searchAssets: ${resolveFilters.piToolName} ${this.formatJson(resolveFilters.arguments)}`,
        `Read ${normalRead.piToolName}: ${this.formatJson(normalRead.arguments)}`,
        `Retry ${retryRead.piToolName}: ${this.formatJson(retryRead.arguments)}`,
        `Space lookup: ${listSpaces.piToolName}, then ${readSpace.piToolName}:`,
        `${this.formatJson(listSpaces.arguments)} -> ${this.formatJson(readSpace.arguments)}`,
        'Existing-space plans: listSpaces/readSpace first. If ambiguous/no matching space, ask. If no matching assets/no photos or none to remove in space, explain. assetIdsTruncated false: exclude already in space adds and only remove already in space; true: narrow.',
        'Space details: listSpaces/readSpace first. For existing_space targetId only, plan space.updateDetails fields: spaceName, description, color. description "" clears it. If same name, same description, or same color already, answer without a no-op/no change plan. Never update thumbnails, pets, faces, linked libraries, or delete spaces.',
        `Plan ${this.toPiToolName(AgentToolName.ProposeAlbumOperations)}: album.create temporaryTargetId; album.addAssets; space.addAssets/space.removeAssets {"targetKind":"existing_space","targetId":"<target-id>","assetIds":["<asset-id>"]}; space.updateDetails {spaceName,description,color}.`,
        this.renderValidationRecoveryGuidance(validationMistake),
      ].join('\n'),
    );
  }

  generateAgentRunnerModule(): string {
    return [
      '// Generated by server/src/bin/sync-agent-mcp-prompt.ts; do not edit by hand.',
      `export const galleryMcpPromptCheatSheet = ${JSON.stringify(this.generatePromptCheatSheet())};`,
      '',
    ].join('\n');
  }

  listPromptExamples(): AgentMcpPromptExample[] {
    const examples = promptExampleSelections.map(({ toolName, exampleName }) => {
      const contract = this.getContract(toolName);
      const example = contract.examples.find((candidate) => candidate.name === exampleName);
      if (!example) {
        throw new Error(`Missing MCP prompt example ${exampleName} for ${toolName}`);
      }

      const promptExample = {
        toolName,
        piToolName: this.toPiToolName(toolName),
        exampleName,
        arguments: structuredClone(example.arguments),
      };

      this.validatePromptExample(promptExample);
      return promptExample;
    });

    return examples;
  }

  private getContract(toolName: AgentToolName): AgentMcpToolContract {
    const contract = this.contractService.listToolContracts().find((candidate) => candidate.name === toolName);
    if (!contract) {
      throw new Error(`Missing MCP tool contract for ${toolName}`);
    }

    return contract;
  }

  private getPromptExample(
    examples: AgentMcpPromptExample[],
    toolName: AgentToolName,
    exampleName: string,
  ): AgentMcpPromptExample {
    const example = examples.find(
      (candidate) => candidate.toolName === toolName && candidate.exampleName === exampleName,
    );
    if (!example) {
      throw new Error(`Missing selected MCP prompt example ${exampleName} for ${toolName}`);
    }

    return example;
  }

  private validatePromptExample(example: AgentMcpPromptExample) {
    if (example.toolName in AgentReadToolRequestSchemas) {
      AgentReadToolRequestSchemas[example.toolName as AgentMcpReadToolName].parse(example.arguments);
      return;
    }

    AgentOperationPlanToolRequestSchemas[example.toolName as AgentMcpPlanningToolName].parse(example.arguments);
  }

  private toPiToolName(toolName: AgentToolName): `mcp_gallery_${string}` {
    return `mcp_gallery_${toolName}`;
  }

  private formatJson(value: unknown): string {
    return JSON.stringify(this.compactPromptValue(value));
  }

  private compactPromptValue(value: unknown): unknown {
    if (!value || typeof value !== 'object' || !('operations' in value)) {
      return value;
    }

    const plan = value as { operations?: unknown[] };
    if (!Array.isArray(plan.operations)) {
      return value;
    }

    return {
      operations: plan.operations.map((operation) => {
        if (!operation || typeof operation !== 'object') {
          return operation;
        }

        const { type, targetKind, targetId, temporaryTargetId, assetIds, payload } = operation as Record<
          string,
          unknown
        >;

        return Object.fromEntries(
          Object.entries({
            type,
            targetKind,
            targetId: targetId ? '<target-id>' : undefined,
            temporaryTargetId,
            assetIds: Array.isArray(assetIds) ? ['<asset-id>'] : undefined,
            payload:
              payload && typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload).length > 0
                ? payload
                : undefined,
          }).filter(([, fieldValue]) => fieldValue !== undefined),
        );
      }),
    };
  }

  private renderApprovalRetryGuidance(
    contract: AgentMcpToolContract,
    retryMode: AgentMcpToolContract['argumentModes'][number] | undefined,
  ): string {
    if (!contract.approvalRetry || !retryMode) {
      throw new Error(`Missing MCP prompt approval retry contract for ${contract.name}`);
    }

    return [
      `Approval retry: ${contract.approvalRetry.instruction}`,
      `Retry uses only {"${contract.approvalRetry.field}":"<id>"}; do not combine ${contract.approvalRetry.field} with old request fields: ${retryMode.forbiddenFields.join(', ')}.`,
    ].join(' ');
  }

  private renderSafetyGuidance(contracts: AgentMcpToolContract[]): string {
    const unsafeContract = contracts.find(
      (contract) => contract.safety.allowsDirectMutation || !contract.safety.requiresGalleryApplyForWrites,
    );
    if (unsafeContract) {
      throw new Error(`MCP prompt cannot render direct-mutation tool ${unsafeContract.name}`);
    }

    return 'No direct apply/write tool is available. Gallery applies final changes only after plan review.';
  }

  private renderValidationRecoveryGuidance(
    mistake: AgentMcpToolContract['commonMistakes'][number] | undefined,
  ): string {
    if (!mistake?.exampleName) {
      throw new Error('Missing MCP prompt validation recovery mistake with example guidance');
    }

    return `Validation: exampleArguments; retry once if correction is obvious. Hint: "${mistake.hint}"`;
  }

  private sanitizePrompt(prompt: string): string {
    const unsafePatterns = [
      /bearer\s+[a-z0-9._~+/-]+=*/i,
      /provider-key/i,
      /stack trace/i,
      /(^|\s)\/(?:home|tmp|var|usr|etc)\//,
      /\/agent\/internal\/mcp/i,
    ];

    const matchedPattern = unsafePatterns.find((pattern) => pattern.test(prompt));
    if (matchedPattern) {
      throw new Error(`Generated MCP prompt contains unsafe content matching ${matchedPattern}`);
    }

    return prompt;
  }
}
