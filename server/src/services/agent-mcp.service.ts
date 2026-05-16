import { Injectable } from '@nestjs/common';
import { serverVersion } from 'src/constants';
import { AgentReadToolRequestSchemas } from 'src/dtos/agent-tool.dto';
import type { AuthDto } from 'src/dtos/auth.dto';
import { AgentToolName } from 'src/enum';
import { AgentMcpToolRegistryService } from 'src/services/agent-mcp-tool-registry.service';
import { AgentToolService } from 'src/services/agent-tool.service';
import type {
  AgentMcpErrorResponse,
  AgentMcpHandleResponse,
  AgentMcpInitializeResult,
  AgentMcpRequestId,
  AgentMcpSuccessResponse,
  AgentMcpToolCallResult,
} from 'src/types/agent-mcp.types';
import type { z } from 'zod';

const MCP_PROTOCOL_VERSION = '2025-11-25';

type AgentMcpRequest = {
  jsonrpc: '2.0';
  id: AgentMcpRequestId;
  method: string;
  params?: unknown;
};

@Injectable()
export class AgentMcpService {
  private readonly readToolNames = new Set<AgentToolName>([
    AgentToolName.SearchAssets,
    AgentToolName.ReadAssetMetadata,
    AgentToolName.ReadAssetPreviews,
    AgentToolName.ReadAssetOriginals,
    AgentToolName.ListAlbums,
    AgentToolName.ReadAlbum,
  ]);

  private readonly planningToolNames = new Set<AgentToolName>([
    AgentToolName.ProposeAlbumOperations,
    AgentToolName.ReviseProposedOperations,
    AgentToolName.SummarizePlan,
  ]);

  constructor(
    private readonly toolRegistry: AgentMcpToolRegistryService,
    private readonly toolService: AgentToolService,
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

    if (this.planningToolNames.has(name)) {
      return this.error(request.id, -32_602, 'Tool not supported in this slice', { toolName: name });
    }

    if (!this.isReadToolName(name)) {
      return this.error(request.id, -32_602, 'Unknown tool', { toolName: name });
    }

    const schema = AgentReadToolRequestSchemas[name];
    const argumentValidation = this.validateToolArguments(args);
    if (!argumentValidation.valid) {
      return this.success(request.id, this.argumentErrorResult(argumentValidation.path, argumentValidation.message));
    }

    const parseResult = schema.safeParse(argumentValidation.value);
    if (!parseResult.success) {
      return this.success(request.id, this.validationErrorResult(parseResult.error));
    }

    try {
      const result = await this.callReadTool(auth, sessionId, name, parseResult.data);
      return this.success(request.id, this.toolResult(result));
    } catch {
      return this.error(request.id, -32_603, 'Internal error');
    }
  }

  private isKnownToolName(name: string): name is AgentToolName {
    return Object.values(AgentToolName).includes(name as AgentToolName);
  }

  private isReadToolName(name: AgentToolName): name is keyof typeof AgentReadToolRequestSchemas {
    return this.readToolNames.has(name);
  }

  private async callReadTool(
    auth: AuthDto,
    sessionId: string,
    toolName: keyof typeof AgentReadToolRequestSchemas,
    dto: z.output<(typeof AgentReadToolRequestSchemas)[keyof typeof AgentReadToolRequestSchemas]>,
  ): Promise<unknown> {
    switch (toolName) {
      case AgentToolName.SearchAssets: {
        return this.toolService.searchAssets(auth, sessionId, dto);
      }
      case AgentToolName.ReadAssetMetadata: {
        return this.toolService.readAssetMetadata(auth, sessionId, dto);
      }
      case AgentToolName.ReadAssetPreviews: {
        return this.toolService.readAssetPreviews(auth, sessionId, dto);
      }
      case AgentToolName.ReadAssetOriginals: {
        return this.toolService.readAssetOriginals(auth, sessionId, dto);
      }
      case AgentToolName.ListAlbums: {
        return this.toolService.listAlbums(auth, sessionId, dto);
      }
      case AgentToolName.ReadAlbum: {
        return this.toolService.readAlbum(auth, sessionId, dto);
      }
    }
  }

  private toolResult(structuredContent: unknown): AgentMcpToolCallResult {
    return {
      content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
      structuredContent,
    };
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

  private validationErrorResult(error: z.ZodError): AgentMcpToolCallResult {
    return this.validationIssuesResult(error.issues);
  }

  private validationIssuesResult(issues: readonly { path: readonly unknown[]; message: string }[]): AgentMcpToolCallResult {
    const structuredContent = {
      status: 'error',
      error: 'Invalid tool arguments',
      issues: issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };

    return {
      ...this.toolResult(structuredContent),
      isError: true,
    };
  }

  private argumentErrorResult(path: string, message: string): AgentMcpToolCallResult {
    return this.validationIssuesResult([{ path: [path], message }]);
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

  private error(
    id: AgentMcpRequestId | null,
    code: number,
    message: string,
    data?: unknown,
  ): AgentMcpErrorResponse {
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
