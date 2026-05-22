import { Injectable } from '@nestjs/common';
import { serverVersion } from 'src/constants';
import { AgentOperationPlanToolRequestSchemas } from 'src/dtos/agent-operation.dto';
import type {
  AgentListAlbumsToolRequestDto,
  AgentListSpacesToolRequestDto,
  AgentReadAlbumToolRequestDto,
  AgentReadAssetMetadataToolRequestDto,
  AgentReadAssetOriginalsToolRequestDto,
  AgentReadAssetPreviewsToolRequestDto,
  AgentReadSpaceToolRequestDto,
  AgentResolveAssetSearchFiltersToolRequestDto,
  AgentSearchAssetsToolRequestDto,
  AgentSearchUsersToolRequestDto,
} from 'src/dtos/agent-tool.dto';
import { AgentReadToolRequestSchemas } from 'src/dtos/agent-tool.dto';
import type { AuthDto } from 'src/dtos/auth.dto';
import { AgentToolName } from 'src/enum';
import { isAgentMcpRecoverableToolError } from 'src/services/agent-mcp-recoverable-tool-error';
import { AgentMcpToolContractService } from 'src/services/agent-mcp-tool-contract.service';
import { AgentMcpToolRegistryService } from 'src/services/agent-mcp-tool-registry.service';
import { AgentOperationPlanService } from 'src/services/agent-operation-plan.service';
import { AgentToolService } from 'src/services/agent-tool.service';
import type {
  AgentMcpErrorResponse,
  AgentMcpHandleResponse,
  AgentMcpInitializeResult,
  AgentMcpRecoverableToolErrorContent,
  AgentMcpRequestId,
  AgentMcpSuccessResponse,
  AgentMcpToolCallResult,
  AgentMcpToolValidationErrorContent,
} from 'src/types/agent-mcp.types';
import type { z } from 'zod';

const MCP_PROTOCOL_VERSION = '2025-11-25';
const MCP_TOOL_TEXT_MAX_CHARS = 500;

type AgentMcpRequest = {
  jsonrpc: '2.0';
  id: AgentMcpRequestId;
  method: string;
  params?: unknown;
};

@Injectable()
export class AgentMcpService {
  private readonly readToolNames = new Set<AgentToolName>([
    AgentToolName.ResolveAssetSearchFilters,
    AgentToolName.SearchAssets,
    AgentToolName.ReadAssetMetadata,
    AgentToolName.ReadAssetPreviews,
    AgentToolName.ReadAssetOriginals,
    AgentToolName.ListAlbums,
    AgentToolName.ReadAlbum,
    AgentToolName.ListSpaces,
    AgentToolName.ReadSpace,
    AgentToolName.SearchUsers,
  ]);

  private readonly planningToolNames = new Set<AgentToolName>([
    AgentToolName.ProposeAlbumOperations,
    AgentToolName.ProposeAlbumFromSearch,
    AgentToolName.ProposeAddAssetsToAlbumFromSearch,
    AgentToolName.ReviseProposedOperations,
    AgentToolName.SummarizePlan,
  ]);

  constructor(
    private readonly toolRegistry: AgentMcpToolRegistryService,
    private readonly toolContractService: AgentMcpToolContractService,
    private readonly toolService: AgentToolService,
    private readonly operationPlanService: AgentOperationPlanService,
  ) {}

  async handle(auth: AuthDto, sessionId: string, request: unknown): Promise<AgentMcpHandleResponse> {
    if (Array.isArray(request)) {
      return this.error(null, -32_600, 'Batch requests are not supported');
    }

    if (this.isInitializedNotification(request)) {
      return;
    }

    if (!this.isRequest(request)) {
      return this.error(null, -32_600, 'Invalid Request');
    }

    if (request.method === 'initialize') {
      return this.success(request.id, this.initializeResult());
    }

    if (request.method === 'tools/list') {
      return this.success(request.id, {
        tools: this.toolRegistry.listTools(),
      });
    }

    if (request.method === 'tools/call') {
      return this.handleToolCall(auth, sessionId, request);
    }

    return this.error(request.id, -32_601, 'Method not found', { method: request.method });
  }

  private isInitializedNotification(request: unknown): boolean {
    if (!request || typeof request !== 'object') {
      return false;
    }

    const { jsonrpc, id, method } = request as Record<string, unknown>;
    return jsonrpc === '2.0' && id === undefined && method === 'notifications/initialized';
  }

  private isRequest(request: unknown): request is AgentMcpRequest {
    if (!request || typeof request !== 'object') {
      return false;
    }

    const { jsonrpc, id, method } = request as Record<string, unknown>;
    return jsonrpc === '2.0' && (typeof id === 'string' || typeof id === 'number') && typeof method === 'string';
  }

  private async handleToolCall(
    auth: AuthDto,
    sessionId: string,
    request: AgentMcpRequest,
  ): Promise<AgentMcpSuccessResponse | AgentMcpErrorResponse> {
    const params = request.params;
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      return this.error(request.id, -32_602, 'Invalid params');
    }

    const { name, arguments: args } = params as Record<string, unknown>;
    if (typeof name !== 'string') {
      return this.error(request.id, -32_602, 'Invalid params');
    }

    if (!this.isKnownToolName(name)) {
      return this.error(request.id, -32_602, 'Unknown tool', { toolName: name });
    }

    if (this.isPlanningToolName(name)) {
      return this.handlePlanningToolCall(auth, sessionId, request.id, name, args);
    }

    if (!this.isReadToolName(name)) {
      return this.error(request.id, -32_602, 'Unknown tool', { toolName: name });
    }

    return this.invokeTool(request.id, name, args, AgentReadToolRequestSchemas[name], (dto) =>
      this.callReadTool(auth, sessionId, name, dto),
    );
  }

  private isKnownToolName(name: string): name is AgentToolName {
    return Object.values(AgentToolName).includes(name as AgentToolName);
  }

  private isReadToolName(name: AgentToolName): name is keyof typeof AgentReadToolRequestSchemas {
    return this.readToolNames.has(name);
  }

  private isPlanningToolName(name: AgentToolName): name is keyof typeof AgentOperationPlanToolRequestSchemas {
    return this.planningToolNames.has(name);
  }

  private async invokeTool<TDto>(
    id: AgentMcpRequestId,
    toolName: AgentToolName,
    args: unknown,
    schema: z.ZodType<TDto>,
    delegate: (dto: TDto) => Promise<unknown>,
  ): Promise<AgentMcpSuccessResponse | AgentMcpErrorResponse> {
    const argumentValidation = this.validateToolArguments(args);
    if (!argumentValidation.valid) {
      return this.success(id, this.argumentErrorResult(toolName, argumentValidation.path, argumentValidation.message));
    }

    const parseResult = schema.safeParse(argumentValidation.value);
    if (!parseResult.success) {
      return this.success(id, this.validationErrorResult(toolName, parseResult.error));
    }

    try {
      return this.success(id, this.toolResult(await delegate(parseResult.data)));
    } catch (error) {
      if (isAgentMcpRecoverableToolError(error)) {
        return this.success(id, this.recoverableToolErrorResult(error.content));
      }

      return this.error(id, -32_603, 'Internal error');
    }
  }

  private async handlePlanningToolCall(
    auth: AuthDto,
    sessionId: string,
    id: AgentMcpRequestId,
    toolName: keyof typeof AgentOperationPlanToolRequestSchemas,
    args: unknown,
  ): Promise<AgentMcpSuccessResponse | AgentMcpErrorResponse> {
    switch (toolName) {
      case AgentToolName.ProposeAlbumOperations: {
        return this.invokeTool(id, toolName, args, AgentOperationPlanToolRequestSchemas[toolName], (dto) =>
          this.operationPlanService.proposeAlbumOperations(auth, sessionId, dto),
        );
      }
      case AgentToolName.ProposeAlbumFromSearch: {
        return this.invokeTool(id, toolName, args, AgentOperationPlanToolRequestSchemas[toolName], (dto) =>
          this.operationPlanService.proposeAlbumFromSearch(auth, sessionId, dto),
        );
      }
      case AgentToolName.ProposeAddAssetsToAlbumFromSearch: {
        return this.invokeTool(id, toolName, args, AgentOperationPlanToolRequestSchemas[toolName], (dto) =>
          this.operationPlanService.proposeAddAssetsToAlbumFromSearch(auth, sessionId, dto),
        );
      }
      case AgentToolName.ReviseProposedOperations: {
        return this.invokeTool(id, toolName, args, AgentOperationPlanToolRequestSchemas[toolName], (dto) => {
          const { planId, ...body } = dto;
          return this.operationPlanService.reviseProposedOperations(auth, sessionId, planId, body);
        });
      }
      case AgentToolName.SummarizePlan: {
        return this.invokeTool(id, toolName, args, AgentOperationPlanToolRequestSchemas[toolName], (dto) => {
          const { planId, ...body } = dto;
          return this.operationPlanService.summarizePlan(auth, sessionId, planId, body);
        });
      }
    }
  }

  private async callReadTool(
    auth: AuthDto,
    sessionId: string,
    toolName: keyof typeof AgentReadToolRequestSchemas,
    dto: z.output<(typeof AgentReadToolRequestSchemas)[keyof typeof AgentReadToolRequestSchemas]>,
  ): Promise<unknown> {
    switch (toolName) {
      case AgentToolName.ResolveAssetSearchFilters: {
        return this.toolService.resolveAssetSearchFilters(
          auth,
          sessionId,
          dto as AgentResolveAssetSearchFiltersToolRequestDto,
        );
      }
      case AgentToolName.SearchAssets: {
        return this.toolService.searchAssets(auth, sessionId, dto as AgentSearchAssetsToolRequestDto);
      }
      case AgentToolName.ReadAssetMetadata: {
        return this.toolService.readAssetMetadata(auth, sessionId, dto as AgentReadAssetMetadataToolRequestDto);
      }
      case AgentToolName.ReadAssetPreviews: {
        return this.toolService.readAssetPreviews(auth, sessionId, dto as AgentReadAssetPreviewsToolRequestDto);
      }
      case AgentToolName.ReadAssetOriginals: {
        return this.toolService.readAssetOriginals(auth, sessionId, dto as AgentReadAssetOriginalsToolRequestDto);
      }
      case AgentToolName.ListAlbums: {
        return this.toolService.listAlbums(auth, sessionId, dto as AgentListAlbumsToolRequestDto);
      }
      case AgentToolName.ReadAlbum: {
        return this.toolService.readAlbum(auth, sessionId, dto as AgentReadAlbumToolRequestDto);
      }
      case AgentToolName.ListSpaces: {
        return this.toolService.listSpaces(auth, sessionId, dto as AgentListSpacesToolRequestDto);
      }
      case AgentToolName.ReadSpace: {
        return this.toolService.readSpace(auth, sessionId, dto as AgentReadSpaceToolRequestDto);
      }
      case AgentToolName.SearchUsers: {
        return this.toolService.searchUsers(auth, sessionId, dto as AgentSearchUsersToolRequestDto);
      }
    }
  }

  private toolResult(structuredContent: unknown): AgentMcpToolCallResult {
    return {
      content: [{ type: 'text', text: this.toolResultText(structuredContent) }],
      structuredContent,
    };
  }

  private toolResultText(structuredContent: unknown): string {
    const content = this.recordValue(structuredContent);
    const summary = this.nonEmptyString(content?.summary);
    if (summary) {
      return this.compactToolText(summary);
    }

    if (content?.status === 'approval-required') {
      const requestSummary = this.nonEmptyString(this.recordValue(content.toolCall)?.requestSummary);
      return this.compactToolText(requestSummary ? `Approval required: ${requestSummary}` : 'Approval required.');
    }

    if (content?.status === 'denied') {
      const reason = this.nonEmptyString(content.reason);
      return this.compactToolText(reason ? `Tool call denied: ${reason}` : 'Tool call denied.');
    }

    if (content?.status === 'error') {
      const error = this.nonEmptyString(content.error) ?? 'Tool error';
      const firstIssue = this.firstValidationIssueText(content);
      const hint = this.nonEmptyString(content.hint);
      return this.compactToolText(firstIssue ? `${error}: ${firstIssue}` : hint ? `${error}: ${hint}` : error);
    }

    return 'Tool result returned.';
  }

  private firstValidationIssueText(content: Record<string, unknown>): string | undefined {
    const issues = content.issues;
    if (!Array.isArray(issues)) {
      return;
    }

    const firstIssue = this.recordValue(issues[0]);
    if (!firstIssue) {
      return;
    }

    const path = this.nonEmptyString(firstIssue.path);
    const message = this.nonEmptyString(firstIssue.message);
    return [path, message].filter((value): value is string => value !== undefined).join(': ') || undefined;
  }

  private recordValue(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  }

  private nonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
  }

  private compactToolText(text: string): string {
    if (text.length <= MCP_TOOL_TEXT_MAX_CHARS) {
      return text;
    }

    return `${text.slice(0, MCP_TOOL_TEXT_MAX_CHARS - 3)}...`;
  }

  private validateToolArguments(
    args: unknown,
  ): { valid: true; value: Record<string, unknown> } | { valid: false; path: string; message: string } {
    if (args === undefined) {
      return { valid: false, path: 'arguments', message: 'arguments is required' };
    }

    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return { valid: false, path: 'arguments', message: 'arguments must be an object' };
    }

    return { valid: true, value: args as Record<string, unknown> };
  }

  private normalizeValidationIssues(
    issues: readonly { path: readonly unknown[]; message: string }[],
  ): { path: string; message: string }[] {
    return issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
  }

  private sanitizeIssueMessage(message: string): string {
    if (/unrecognized key/i.test(message)) {
      return 'Unexpected field in arguments';
    }

    return message
      .replaceAll(/bearer\s+[a-z0-9._-]+/gi, 'bearer [redacted]')
      .replaceAll(/\/(?:api|srv)\/[^\s"']+/gi, '[redacted-path]')
      .replaceAll(/provider-key/gi, '[redacted-secret]');
  }

  private validationErrorResult(toolName: AgentToolName, error: z.ZodError): AgentMcpToolCallResult {
    return this.validationIssuesResult(toolName, this.normalizeValidationIssues(error.issues), 'tool-arguments');
  }

  private recoverableToolErrorResult(content: AgentMcpRecoverableToolErrorContent): AgentMcpToolCallResult {
    return {
      ...this.toolResult(content),
      isError: true,
    };
  }

  private validationCorrectionFor(
    toolName: AgentToolName,
    issues: readonly { path: string; message: string }[],
    requestShape: 'json-rpc' | 'tool-arguments',
  ) {
    const request = {
      requestShape,
      issues: issues.map((issue) => ({ path: issue.path, message: issue.message })),
    };

    if (this.isReadToolName(toolName)) {
      return this.toolContractService.getReadToolValidationCorrection(toolName, request);
    }

    if (this.isPlanningToolName(toolName)) {
      return this.toolContractService.getPlanningToolValidationCorrection(toolName, request);
    }

    return;
  }

  private validationIssuesResult(
    toolName: AgentToolName,
    issues: readonly { path: string; message: string }[],
    requestShape: 'json-rpc' | 'tool-arguments',
  ): AgentMcpToolCallResult {
    const correction = this.validationCorrectionFor(toolName, issues, requestShape);
    const structuredContent: AgentMcpToolValidationErrorContent = {
      status: 'error',
      error: 'Invalid tool arguments',
      toolName,
      retryable: true,
      issues: issues.map((issue) => ({
        path: issue.path,
        message: this.sanitizeIssueMessage(issue.message),
        ...(correction?.hint && correction.issuePath === issue.path ? { hint: correction.hint } : {}),
      })),
      ...(correction?.expected ? { expected: correction.expected } : {}),
      ...(correction?.hint ? { hint: correction.hint } : {}),
      ...(correction?.exampleArguments ? { exampleArguments: correction.exampleArguments } : {}),
    };

    return {
      ...this.toolResult(structuredContent),
      isError: true,
    };
  }

  private argumentErrorResult(toolName: AgentToolName, path: string, message: string): AgentMcpToolCallResult {
    return this.validationIssuesResult(toolName, [{ path, message }], 'json-rpc');
  }

  private initializeResult(): AgentMcpInitializeResult {
    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      serverInfo: {
        name: 'gallery-agent-mcp',
        version: serverVersion.toString(),
      },
      capabilities: {
        tools: {},
      },
    };
  }

  private success(id: AgentMcpRequestId, result: unknown): AgentMcpSuccessResponse {
    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  }

  private error(id: AgentMcpRequestId | null, code: number, message: string, data?: unknown): AgentMcpErrorResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        ...(data === undefined ? {} : { data }),
      },
    };
  }
}
