import { AgentReadToolRequestSchemas } from 'src/dtos/agent-tool.dto';
import { AgentToolName } from 'src/enum';
import { AgentMcpToolContractService } from 'src/services/agent-mcp-tool-contract.service';

const expectedReadToolNames = [
  AgentToolName.SearchAssets,
  AgentToolName.ReadAssetMetadata,
  AgentToolName.ReadAssetPreviews,
  AgentToolName.ReadAssetOriginals,
  AgentToolName.ListAlbums,
  AgentToolName.ReadAlbum,
] as const;

const forbiddenContractPattern =
  /\/api|agent\/internal|bearer|token|secret|provider key|applyAlbumOperations|applyOperations|createAlbum|addAssetsToAlbum/i;

describe(AgentMcpToolContractService.name, () => {
  let sut: AgentMcpToolContractService;

  beforeEach(() => {
    sut = new AgentMcpToolContractService();
  });

  it('returns exactly the slice 1 read-tool contracts in stable order', () => {
    expect(sut.listReadToolContracts().map((contract) => contract.name)).toEqual(expectedReadToolNames);
  });

  it('does not expose planning contracts before the planning guidance slice', () => {
    const toolNames = sut.listReadToolContracts().map((contract) => contract.name);

    expect(toolNames).not.toContain(AgentToolName.ProposeAlbumOperations);
    expect(toolNames).not.toContain(AgentToolName.ReviseProposedOperations);
    expect(toolNames).not.toContain(AgentToolName.SummarizePlan);
  });

  it('defines executable examples for every read tool', () => {
    for (const contract of sut.listReadToolContracts()) {
      const schema = AgentReadToolRequestSchemas[contract.name];

      expect(contract.examples.length).toBeGreaterThan(0);
      for (const example of contract.examples) {
        const result = schema.safeParse(example.arguments);

        expect(result.success, `${contract.name} example "${example.name}" should parse`).toBe(true);
      }
    }
  });

  it('defines approved retry mode and example for every read tool', () => {
    for (const contract of sut.listReadToolContracts()) {
      expect(contract.argumentModes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'approved-retry',
            requiredFields: ['toolCallId'],
            forbiddenFields: expect.any(Array),
          }),
        ]),
      );
      expect(contract.approvalRetry).toMatchObject({
        field: 'toolCallId',
      });
      expect(contract.examples).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'approved-retry',
            arguments: {
              toolCallId: '00000000-0000-4000-8000-000000000111',
            },
          }),
        ]),
      );
    }
  });

  it('defines the required search examples from the spec', () => {
    const search = sut.getReadToolContract(AgentToolName.SearchAssets);

    expect(search?.examples.map((example) => example.name)).toEqual(
      expect.arrayContaining([
        'empty-search',
        'bounded-date-location-search',
        'favorite-rating-search',
        'approved-retry',
      ]),
    );
  });

  it('defines the required list and album read examples from the spec', () => {
    const listAlbums = sut.getReadToolContract(AgentToolName.ListAlbums);
    const readAlbum = sut.getReadToolContract(AgentToolName.ReadAlbum);

    expect(listAlbums?.examples.map((example) => example.name)).toEqual(
      expect.arrayContaining(['list-visible-albums', 'approved-retry']),
    );
    expect(readAlbum?.examples.map((example) => example.name)).toEqual(
      expect.arrayContaining(['read-visible-album', 'approved-retry']),
    );
  });

  it('does not include secrets, internal routes, or direct apply language', () => {
    const serialized = JSON.stringify(sut.listReadToolContracts());

    expect(serialized).not.toMatch(forbiddenContractPattern);
  });

  it('marks read contracts as non-mutating and requiring Gallery apply for final writes', () => {
    for (const contract of sut.listReadToolContracts()) {
      expect(contract.safety).toEqual({
        allowsDirectMutation: false,
        exposesSecrets: false,
        requiresGalleryApplyForWrites: true,
      });
    }
  });

  it('defines common mistakes with usable correction hints', () => {
    for (const contract of sut.listReadToolContracts()) {
      const exampleNames = new Set(contract.examples.map((example) => example.name));

      expect(contract.commonMistakes.length).toBeGreaterThan(0);
      for (const mistake of contract.commonMistakes) {
        expect(mistake.id.trim().length).toBeGreaterThan(0);
        expect(mistake.hint.trim().length).toBeGreaterThan(20);
        if (mistake.exampleName) {
          expect(exampleNames.has(mistake.exampleName), `${contract.name} mistake ${mistake.id}`).toBe(true);
        }
      }
    }
  });

  it('returns defensive copies of contracts', () => {
    const firstContracts = sut.listReadToolContracts();
    firstContracts[0].description = 'mutated description';
    firstContracts[0].examples[0].arguments = { mutated: true };

    expect(sut.listReadToolContracts()[0].description).not.toBe('mutated description');
    expect(sut.listReadToolContracts()[0].examples[0].arguments).not.toEqual({ mutated: true });
  });
});
