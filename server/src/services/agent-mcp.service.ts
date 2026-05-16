import { Injectable } from '@nestjs/common';
import { serverVersion } from 'src/constants';
import type {
  AgentMcpErrorResponse,
  AgentMcpHandleResponse,
  AgentMcpInitializeResult,
  AgentMcpRequestId,
} from 'src/types/agent-mcp.types';

const MCP_PROTOCOL_VERSION = '2025-11-25';

type AgentMcpRequest = {
  jsonrpc: '2.0';
  id: AgentMcpRequestId;
  method: string;
};

@Injectable()
export class AgentMcpService {
  handle(request: unknown): AgentMcpHandleResponse {
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
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: this.initializeResult(),
      };
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

  private initializeResult(): AgentMcpInitializeResult {
    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      serverInfo: {
        name: 'gallery-agent-mcp',
        version: serverVersion.toString(),
      },
      capabilities: {},
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
