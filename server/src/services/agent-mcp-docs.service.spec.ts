import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AgentOperationPlanToolRequestSchemas } from 'src/dtos/agent-operation.dto';
import { AgentReadToolRequestSchemas } from 'src/dtos/agent-tool.dto';
import { AgentToolName } from 'src/enum';
import { AGENT_MCP_GENERATED_DOC_RELATIVE_PATH, AgentMcpDocsService } from 'src/services/agent-mcp-docs.service';
import { AgentMcpToolContractService } from 'src/services/agent-mcp-tool-contract.service';

const forbiddenGeneratedDocPattern =
  /bearer\s+[a-z0-9._-]{10,}|provider[- ]?key|stack trace|\/(?:srv|home|tmp|var|etc|opt|mnt|Users)\/[^\s`)]*|\/api\/agent\/internal|applyAlbumOperations|applyOperations|createAlbum|addAssetsToAlbum/i;
const directMutationToolNamePattern = /(?:^|_)(?:apply|execute|mutate|write|delete|destroy|directWrite)(?:$|_)/i;

describe(AgentMcpDocsService.name, () => {
  let contractService: AgentMcpToolContractService;
  let sut: AgentMcpDocsService;

  beforeEach(() => {
    contractService = new AgentMcpToolContractService();
    sut = new AgentMcpDocsService(contractService);
  });

  it('generates the required MCP guide sections from the contract', () => {
    const markdown = sut.generateMarkdown();

    expect(markdown).toContain('# Pi Agent MCP Tools');
    expect(markdown).toContain('POST /agent/internal/mcp/sessions/{sessionId}');
    expect(markdown).toContain('Authorization: Bearer <agent-runner-token>');
    expect(markdown).toContain('## JSON-RPC Wrappers');
    expect(markdown).toContain('## Approval Flow');
    expect(markdown).toContain('## Tools');
    expect(markdown).toContain('## Common Mistakes');
    expect(markdown).toContain('No MCP apply tool is exposed');
  });

  it('includes every contract tool and every contract example', () => {
    const markdown = sut.generateMarkdown();

    for (const contract of contractService.listToolContracts()) {
      expect(markdown, contract.name).toContain(`### ${contract.title}`);
      expect(markdown, contract.name).toContain(`\`${contract.name}\``);
      for (const example of contract.examples) {
        expect(markdown, `${contract.name} ${example.name}`).toContain(`#### ${example.name}`);
      }
    }
  });

  it('documents every argument mode and common mistake from the contract', () => {
    const markdown = sut.generateMarkdown();

    for (const contract of contractService.listToolContracts()) {
      for (const mode of contract.argumentModes) {
        expect(markdown, `${contract.name} ${mode.name}`).toContain(`\`${mode.name}\``);
        expect(markdown, `${contract.name} ${mode.whenToUse}`).toContain(mode.whenToUse);
      }
      for (const mistake of contract.commonMistakes) {
        expect(markdown, `${contract.name} ${mistake.id}`).toContain(`\`${mistake.id}\``);
        expect(markdown, `${contract.name} ${mistake.hint}`).toContain(mistake.hint);
      }
    }
  });

  it('exposes structured documented examples that parse through the matching DTO schemas', () => {
    const examples = sut.listDocumentedToolArgumentExamples();

    expect(examples.length).toBeGreaterThan(contractService.listToolContracts().length);
    for (const example of examples) {
      const schema =
        example.toolName in AgentReadToolRequestSchemas
          ? AgentReadToolRequestSchemas[example.toolName as keyof typeof AgentReadToolRequestSchemas]
          : AgentOperationPlanToolRequestSchemas[example.toolName as keyof typeof AgentOperationPlanToolRequestSchemas];
      const result = schema.safeParse(example.arguments);

      expect(result.success, `${example.toolName} ${example.exampleName}`).toBe(true);
    }
  });

  it('parses every marked tool-argument JSON block from the generated Markdown through the referenced DTO schema', () => {
    const markdown = sut.generateMarkdown();
    const blocks = [
      ...markdown.matchAll(
        /<!-- mcp-docs:tool-arguments tool="([^"]+)" example="([^"]+)" -->\n```json\n([\s\S]*?)\n```/g,
      ),
    ];

    expect(blocks).toHaveLength(sut.listDocumentedToolArgumentExamples().length);
    for (const [, toolNameValue, exampleName, jsonText] of blocks) {
      expect(Object.values(AgentToolName)).toContain(toolNameValue as AgentToolName);
      const toolName = toolNameValue as AgentToolName;
      const schema =
        toolName in AgentReadToolRequestSchemas
          ? AgentReadToolRequestSchemas[toolName as keyof typeof AgentReadToolRequestSchemas]
          : AgentOperationPlanToolRequestSchemas[toolName as keyof typeof AgentOperationPlanToolRequestSchemas];
      const parsed = JSON.parse(jsonText);
      const result = schema.safeParse(parsed);

      expect(result.success, `${toolName} ${exampleName}`).toBe(true);
    }
  });

  it('exposes JSON-RPC examples with params.arguments for tools/call', () => {
    const examples = sut.listJsonRpcExamples();

    expect(examples.map((example) => example.name)).toEqual(
      expect.arrayContaining(['initialize', 'tools-list', 'tools-call-read', 'tools-call-plan']),
    );
    for (const example of examples.filter((candidate) => candidate.request.method === 'tools/call')) {
      const params = example.request.params as Record<string, unknown>;

      expect(example.request).toMatchObject({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: expect.any(String),
          arguments: expect.any(Object),
        },
      });
      expect(example.request).not.toHaveProperty('input');
      expect(example.request).not.toHaveProperty('arguments');
      expect(params).not.toHaveProperty('input');
    }
  });

  it('renders parseable JSON code fences', () => {
    const markdown = sut.generateMarkdown();
    const blocks = [...markdown.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => match[1]);

    expect(blocks.length).toBeGreaterThan(10);
    for (const block of blocks) {
      expect(() => JSON.parse(block)).not.toThrow();
    }
  });

  it('includes create album and create-plus-add-assets planning examples', () => {
    const markdown = sut.generateMarkdown();

    expect(markdown).toContain('create-empty-album');
    expect(markdown).toContain('create-album-and-add-assets');
    expect(markdown).toContain('temporaryTargetId');
  });

  it('distinguishes bare MCP tool names from Pi-visible prefixed names', () => {
    const markdown = sut.generateMarkdown();

    expect(markdown).toContain('Bare MCP tool names');
    expect(markdown).toContain('Pi-visible names may be shown with an `mcp_gallery_` prefix');
    expect(markdown).toContain('`searchAssets`');
    expect(markdown).toContain('`mcp_gallery_searchAssets`');
  });

  it('does not leak real secrets, stack traces, filesystem paths, or direct mutation tools', () => {
    const markdown = sut.generateMarkdown();

    expect(markdown).not.toMatch(forbiddenGeneratedDocPattern);
    expect(markdown).toContain('Bearer <agent-runner-token>');
  });

  it('does not expose apply or direct-mutation MCP tools in the generated guide', () => {
    const contracts = contractService.listToolContracts();
    const markdown = sut.generateMarkdown();

    for (const contract of contracts) {
      expect(contract.name, contract.name).not.toMatch(directMutationToolNamePattern);
    }
    expect(markdown).not.toContain('MCP tool name: `apply');
    expect(markdown).not.toContain('MCP tool name: `execute');
    expect(markdown).not.toContain('MCP tool name: `write');
    expect(markdown).not.toContain('MCP tool name: `delete');
  });

  it('keeps the committed generated guide in sync with the renderer', () => {
    const generatedPath = resolve(process.cwd(), '..', AGENT_MCP_GENERATED_DOC_RELATIVE_PATH);
    const committed = readFileSync(generatedPath, 'utf8');

    expect(committed).toBe(sut.generateMarkdown());
  });
});
