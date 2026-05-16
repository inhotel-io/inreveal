import { serverVersion } from 'src/constants';
import { AgentMcpService } from 'src/services/agent-mcp.service';

describe(AgentMcpService.name, () => {
  let sut: AgentMcpService;

  beforeEach(() => {
    sut = new AgentMcpService();
  });

  it('returns the MCP initialize result without advertising tools in slice 1', () => {
    expect(
      sut.handle({
        jsonrpc: '2.0',
        id: 'init-1',
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'pi-agent-runner', version: '0.1.0' },
        },
      }),
    ).toEqual({
      jsonrpc: '2.0',
      id: 'init-1',
      result: {
        protocolVersion: '2025-11-25',
        serverInfo: {
          name: 'gallery-agent-mcp',
          version: serverVersion.toString(),
        },
        capabilities: {},
      },
    });
  });

  it('preserves numeric JSON-RPC request ids for initialize', () => {
    expect(
      sut.handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      }),
    ).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-11-25',
        serverInfo: {
          name: 'gallery-agent-mcp',
          version: serverVersion.toString(),
        },
        capabilities: {},
      },
    });
  });

  it('returns no response for the initialized notification', () => {
    expect(
      sut.handle({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    ).toBeUndefined();
  });

  it.each([
    ['null body', null],
    ['primitive body', 'not-an-object'],
    ['missing jsonrpc', { id: '1', method: 'initialize' }],
    ['wrong jsonrpc version', { jsonrpc: '1.0', id: '1', method: 'initialize' }],
    ['missing id', { jsonrpc: '2.0', method: 'initialize' }],
    ['null id', { jsonrpc: '2.0', id: null, method: 'initialize' }],
    ['object id', { jsonrpc: '2.0', id: { nested: true }, method: 'initialize' }],
    ['missing method', { jsonrpc: '2.0', id: '1' }],
    ['non-string method', { jsonrpc: '2.0', id: '1', method: 123 }],
  ] as const)('returns invalid request for %s', (_name, body) => {
    expect(sut.handle(body)).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32_600,
        message: 'Invalid Request',
      },
    });
  });

  it('explicitly rejects batch requests in the first slice', () => {
    expect(
      sut.handle([
        {
          jsonrpc: '2.0',
          id: 'init-1',
          method: 'initialize',
        },
      ]),
    ).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32_600,
        message: 'Batch requests are not supported',
      },
    });
  });

  it.each(['tools/list', 'tools/call', 'resources/list'] as const)('returns method-not-found for %s', (method) => {
    expect(
      sut.handle({
        jsonrpc: '2.0',
        id: 7,
        method,
      }),
    ).toEqual({
      jsonrpc: '2.0',
      id: 7,
      error: {
        code: -32_601,
        message: 'Method not found',
        data: { method },
      },
    });
  });
});
