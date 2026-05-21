import { AgentOperationPlanToolRequestSchemas } from 'src/dtos/agent-operation.dto';
import { AgentReadToolRequestSchemas } from 'src/dtos/agent-tool.dto';
import { AgentOperationTargetKind, AgentOperationType, AgentToolName } from 'src/enum';
import { AgentMcpToolContractService } from 'src/services/agent-mcp-tool-contract.service';

const expectedReadToolNames = [
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
] as const;

const expectedPlanningToolNames = [
  AgentToolName.ProposeAlbumOperations,
  AgentToolName.ReviseProposedOperations,
  AgentToolName.SummarizePlan,
] as const;

const expectedProposalExampleNames = [
  'create-empty-album',
  'create-album-and-add-assets',
  'add-assets-to-existing-album',
  'remove-assets-from-existing-album',
  'update-album-details',
  'set-album-cover',
  'create-space',
  'create-space-and-add-assets',
  'add-assets-to-existing-space',
  'remove-assets-from-existing-space',
  'update-space-details',
  'rename-existing-space',
  'update-existing-space-description',
  'clear-existing-space-description',
  'update-existing-space-color',
  'rotate-assets',
  'favorite-assets',
  'archive-assets',
  'add-tag-to-assets',
  'remove-tag-from-assets',
] as const;

const expectedPlanningOperationTypes = [
  AgentOperationType.AlbumCreate,
  AgentOperationType.AlbumAddAssets,
  AgentOperationType.AlbumRemoveAssets,
  AgentOperationType.AlbumUpdateDetails,
  AgentOperationType.AlbumSetCover,
  AgentOperationType.SpaceCreate,
  AgentOperationType.SpaceAddAssets,
  AgentOperationType.SpaceRemoveAssets,
  AgentOperationType.SpaceUpdateDetails,
  AgentOperationType.AssetRotate,
  AgentOperationType.AssetSetFavorite,
  AgentOperationType.AssetSetArchive,
  AgentOperationType.AssetAddTag,
  AgentOperationType.AssetRemoveTag,
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

  it('returns exactly the planning-tool contracts in stable order', () => {
    expect(sut.listPlanningToolContracts().map((contract) => contract.name)).toEqual(expectedPlanningToolNames);
  });

  it('returns all tool contracts in stable MCP tool order', () => {
    expect(sut.listToolContracts().map((contract) => contract.name)).toEqual([
      ...expectedReadToolNames,
      ...expectedPlanningToolNames,
    ]);
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
        'space-filter-search',
        'resolved-id-filter-search',
        'unalbumed-berlin-may-search',
        'five-star-video-search',
        'ocr-invoice-screenshot-search',
        'approved-retry',
      ]),
    );

    const resolver = sut.getReadToolContract(AgentToolName.ResolveAssetSearchFilters);
    expect(resolver?.examples.map((example) => example.name)).toEqual(
      expect.arrayContaining([
        'resolve-named-filters',
        'resolve-alex-family-space-filters',
        'resolve-space-person-filters',
      ]),
    );
  });

  it('defines Slice 7 natural-language search examples that parse into supported MCP arguments', () => {
    const search = sut.getReadToolContract(AgentToolName.SearchAssets);
    const examplesByName = new Map(search?.examples.map((example) => [example.name, example]));

    const unalbumedBerlinMay = examplesByName.get('unalbumed-berlin-may-search');
    const fiveStarVideos = examplesByName.get('five-star-video-search');
    const ocrInvoiceScreenshots = examplesByName.get('ocr-invoice-screenshot-search');
    const resolver = sut.getReadToolContract(AgentToolName.ResolveAssetSearchFilters);
    const resolverExamplesByName = new Map(resolver?.examples.map((example) => [example.name, example]));
    const alexFamilySpace = resolverExamplesByName.get('resolve-alex-family-space-filters');

    expect(unalbumedBerlinMay?.arguments).toEqual({
      mode: 'metadata',
      filters: {
        takenAfter: '2026-05-01T00:00:00.000Z',
        takenBefore: '2026-05-31T23:59:59.999Z',
        city: 'Berlin',
        country: 'Germany',
        isNotInAlbum: true,
      },
      limit: 50,
      page: 1,
      order: 'desc',
    });
    expect(fiveStarVideos?.arguments).toEqual({
      filters: {
        rating: 5,
        type: 'VIDEO',
      },
      limit: 50,
    });
    expect(ocrInvoiceScreenshots?.arguments).toEqual({
      mode: 'ocr',
      query: 'invoice',
      filters: {
        takenAfter: '2024-01-01T00:00:00.000Z',
        takenBefore: '2024-12-31T23:59:59.999Z',
        type: 'IMAGE',
      },
      limit: 50,
    });

    for (const example of [unalbumedBerlinMay, fiveStarVideos, ocrInvoiceScreenshots]) {
      expect(example, 'scenario example should exist').toBeDefined();
      expect(AgentReadToolRequestSchemas[AgentToolName.SearchAssets].safeParse(example?.arguments).success).toBe(true);
    }

    expect(alexFamilySpace?.arguments).toEqual({
      people: ['Alex'],
      spaces: ['Family'],
    });
    expect(
      AgentReadToolRequestSchemas[AgentToolName.ResolveAssetSearchFilters].safeParse(alexFamilySpace?.arguments)
        .success,
    ).toBe(true);
  });

  it('instructs models to resolve named search filters before searchAssets', () => {
    const resolver = sut.getReadToolContract(AgentToolName.ResolveAssetSearchFilters);

    expect(resolver).toMatchObject({
      title: 'Resolve asset search filters',
      usage: expect.stringContaining('Use before searchAssets when the user gives names'),
    });
    expect(resolver?.examples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'resolve-named-filters',
          arguments: { tags: ['Travel'], albums: ['Berlin'] },
        }),
      ]),
    );
  });

  it('documents resolver-first people organization flows for global and shared-space people', () => {
    const contracts = sut.listToolContracts();
    const resolver = contracts.find((contract) => contract.name === AgentToolName.ResolveAssetSearchFilters);
    const search = contracts.find((contract) => contract.name === AgentToolName.SearchAssets);

    expect(resolver?.usage).toContain(
      'For named people in a named shared space, resolve the space and person together',
    );
    expect(resolver?.examples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'resolve-space-person-filters',
          arguments: { people: ['Pierre'], spaces: ['Family'] },
        }),
      ]),
    );
    expect(
      resolver?.examples.find((example) => example.name === 'resolve-space-person-filters')?.arguments,
    ).not.toHaveProperty('scope.withSharedSpaces');
    expect(search?.usage).toContain('Use returned personIds or spaceId plus spacePersonIds');
  });

  it('advertises executable text search modes and examples for searchAssets', () => {
    const search = sut.getReadToolContract(AgentToolName.SearchAssets);

    expect(search?.usage).toContain('Use mode smart, description, ocr, or filename with query for text search');
    expect(search?.usage).not.toContain('Text modes, later pages, and non-desc order are not available yet');
    expect(search?.argumentModes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'text-search',
          requiredFields: ['mode', 'query'],
        }),
      ]),
    );
    expect(search?.examples.map((example) => example.name)).toEqual(
      expect.arrayContaining([
        'smart-text-search',
        'ocr-text-search',
        'description-text-search',
        'filename-text-search',
      ]),
    );

    for (const example of search?.examples ?? []) {
      const result = AgentReadToolRequestSchemas[AgentToolName.SearchAssets].safeParse(example.arguments);

      expect(result.success, `searchAssets example "${example.name}" should parse`).toBe(true);
    }
  });

  it('defines a search-specific approved retry mode that forbids all new search fields', () => {
    const search = sut.getReadToolContract(AgentToolName.SearchAssets);

    expect(search?.argumentModes.find((mode) => mode.name === 'approved-retry')).toMatchObject({
      requiredFields: ['toolCallId'],
      forbiddenFields: ['mode', 'query', 'filters', 'limit', 'page', 'order'],
    });
  });

  it('describes filtered search using deterministic executable metadata filters', () => {
    const search = sut.getReadToolContract(AgentToolName.SearchAssets);
    const filteredSearch = search?.argumentModes.find((mode) => mode.name === 'filtered-search');

    expect(filteredSearch?.whenToUse).toContain(
      'date, place, favorite, rating, album, tag, camera, media, people, space, or visibility filters',
    );
    expect(filteredSearch?.whenToUse).not.toContain('People, space, and visibility fields are contract fields');
    expect(filteredSearch?.whenToUse).not.toContain('not available yet');
  });

  it('advertises deterministic people and search filters as executable metadata filters', () => {
    const search = sut.getReadToolContract(AgentToolName.SearchAssets);
    const serialized = JSON.stringify({
      description: search?.description,
      usage: search?.usage,
      filteredSearch: search?.argumentModes.find((mode) => mode.name === 'filtered-search'),
      examples: search?.examples,
      commonMistakes: search?.commonMistakes,
    });

    for (const filter of [
      'personIds',
      'spaceId',
      'spacePersonIds',
      'withSharedSpaces',
      'visibility',
      'createdAfter',
      'createdBefore',
      'updatedAfter',
      'updatedBefore',
      'takenAfter',
      'takenBefore',
      'albumIds',
      'tagIds',
      'make',
      'model',
      'lensModel',
      'rating',
      'type',
    ]) {
      expect(serialized).toContain(filter);
    }

    expect(search?.usage).toContain(
      'Known ID filters: people, spaces, visibility, dates, albums, tags, camera fields, ratings, and media types.',
    );
    expect(search?.usage).not.toContain('Text modes, later pages, and non-desc order are not available yet');
    expect(search?.usage).not.toContain('people, space, visibility, later pages');
  });

  it('returns text-search correction for query used with metadata mode', () => {
    const correction = sut.getReadToolValidationCorrection(AgentToolName.SearchAssets, {
      requestShape: 'tool-arguments',
      issues: [{ path: 'query', message: 'query is only supported with smart, description, ocr, or filename mode' }],
    });

    expect(correction).toMatchObject({
      mistakeId: 'search-query-with-metadata-mode',
      hint: expect.stringContaining('Use mode smart, description, ocr, or filename with query'),
    });
    expect(correction?.hint).not.toContain('not available yet');
  });

  it('defines a space-filter-search example for scoped people filters', () => {
    const search = sut.getReadToolContract(AgentToolName.SearchAssets);

    expect(search?.examples.find((example) => example.name === 'space-filter-search')?.arguments).toEqual({
      filters: {
        spaceId: '00000000-0000-4000-8000-000000000020',
        spacePersonIds: ['00000000-0000-4000-8000-000000000021'],
      },
      limit: 25,
    });
  });

  it('defines people organization examples that parse against live schemas', () => {
    const contracts = sut.listToolContracts();
    const resolver = contracts.find((contract) => contract.name === AgentToolName.ResolveAssetSearchFilters);
    const search = contracts.find((contract) => contract.name === AgentToolName.SearchAssets);
    const peopleOrganizationExamples = [
      resolver?.examples.find((example) => example.name === 'resolve-space-person-filters'),
      search?.examples.find((example) => example.name === 'person-filter-search'),
      search?.examples.find((example) => example.name === 'space-filter-search'),
    ];

    for (const example of peopleOrganizationExamples) {
      expect(example, 'people organization example should exist').toBeDefined();
    }

    expect(
      AgentReadToolRequestSchemas[AgentToolName.ResolveAssetSearchFilters].safeParse(
        peopleOrganizationExamples[0]?.arguments,
      ).success,
    ).toBe(true);
    for (const example of peopleOrganizationExamples.slice(1)) {
      expect(AgentReadToolRequestSchemas[AgentToolName.SearchAssets].safeParse(example?.arguments).success).toBe(true);
    }
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

  it('defines the required list and space read examples from the spec', () => {
    const listSpaces = sut.getReadToolContract(AgentToolName.ListSpaces);
    const readSpace = sut.getReadToolContract(AgentToolName.ReadSpace);

    expect(listSpaces?.examples.map((example) => example.name)).toEqual(
      expect.arrayContaining(['list-visible-spaces', 'approved-retry']),
    );
    expect(readSpace?.examples.map((example) => example.name)).toEqual(
      expect.arrayContaining(['read-space-details', 'approved-retry']),
    );
    expect(readSpace?.argumentModes.find((mode) => mode.name === 'approved-retry')?.forbiddenFields).toContain(
      'spaceId',
    );
  });

  it('returns model-actionable corrections for invalid space payloads', () => {
    const missing = sut.getReadToolValidationCorrection(AgentToolName.ReadSpace, {
      requestShape: 'tool-arguments',
      issues: [{ path: '', message: 'Provide spaceId, or retry an approved tool call with toolCallId' }],
    });
    const mixed = sut.getReadToolValidationCorrection(AgentToolName.ReadSpace, {
      requestShape: 'tool-arguments',
      issues: [{ path: '', message: 'Use either spaceId or toolCallId, not both' }],
    });
    const wrongField = sut.getReadToolValidationCorrection(AgentToolName.ReadSpace, {
      requestShape: 'tool-arguments',
      issues: [{ path: '', message: 'Unrecognized key: "spaceName"' }],
    });

    expect(missing).toMatchObject({
      hint: expect.stringContaining('spaceId'),
      exampleArguments: { spaceId: '00000000-0000-4000-8000-000000000020' },
    });
    expect(mixed).toMatchObject({
      hint: expect.stringContaining('toolCallId'),
      exampleArguments: { toolCallId: '00000000-0000-4000-8000-000000000111' },
    });
    expect(wrongField).toMatchObject({
      hint: expect.stringContaining('Call listSpaces first'),
      exampleArguments: { spaceId: '00000000-0000-4000-8000-000000000020' },
    });
  });

  it('defines the required planning examples from the spec', () => {
    const proposal = sut.getPlanningToolContract(AgentToolName.ProposeAlbumOperations);
    const revise = sut.getPlanningToolContract(AgentToolName.ReviseProposedOperations);
    const summarize = sut.getPlanningToolContract(AgentToolName.SummarizePlan);

    expect(proposal?.examples.map((example) => example.name)).toEqual(
      expect.arrayContaining([...expectedProposalExampleNames]),
    );
    expect(revise?.examples.map((example) => example.name)).toEqual(
      expect.arrayContaining(['revise-add-assets-to-existing-album', 'revise-create-empty-album']),
    );
    expect(summarize?.examples.map((example) => example.name)).toEqual(
      expect.arrayContaining(['summarize-plan', 'summarize-plan-risks']),
    );
  });

  it('defines executable examples for every planning tool', () => {
    for (const contract of sut.listPlanningToolContracts()) {
      const schema = AgentOperationPlanToolRequestSchemas[contract.name];

      expect(contract.examples.length).toBeGreaterThan(0);
      for (const example of contract.examples) {
        const result = schema.safeParse(example.arguments);

        expect(result.success, `${contract.name} example "${example.name}" should parse`).toBe(true);
      }
    }
  });

  it('defines focused existing-space detail update examples with only supported fields', () => {
    const contract = sut.getPlanningToolContract(AgentToolName.ProposeAlbumOperations);
    const expected = [
      { name: 'rename-existing-space', payload: { spaceName: 'Family 2026' } },
      { name: 'update-existing-space-description', payload: { description: 'Photos for everyone.' } },
      { name: 'clear-existing-space-description', payload: { description: '' } },
      { name: 'update-existing-space-color', payload: { color: 'blue' } },
    ];

    for (const expectation of expected) {
      const example = contract?.examples.find((candidate) => candidate.name === expectation.name);

      expect(example, expectation.name).toBeDefined();
      const parsed = AgentOperationPlanToolRequestSchemas[AgentToolName.ProposeAlbumOperations].parse(
        example?.arguments,
      );
      expect(parsed.operations).toHaveLength(1);
      expect(parsed.operations[0]).toMatchObject({
        type: AgentOperationType.SpaceUpdateDetails,
        targetKind: AgentOperationTargetKind.ExistingSpace,
        targetId: '00000000-0000-4000-8000-000000000020',
        payload: expectation.payload,
      });
      expect(parsed.operations[0]).not.toHaveProperty('temporaryTargetId');
      expect(parsed.operations[0]).not.toHaveProperty('assetIds');
    }
  });

  it('covers every supported planning operation type with proposal examples', () => {
    const proposal = sut.getPlanningToolContract(AgentToolName.ProposeAlbumOperations)!;
    const serializedExamples = JSON.stringify(proposal.examples.map((example) => example.arguments));

    for (const operationType of expectedPlanningOperationTypes) {
      expect(serializedExamples, `${operationType} should have a valid proposal example`).toContain(operationType);
    }
  });

  it('shows correct temporary target dependencies in planning examples', () => {
    const proposal = sut.getPlanningToolContract(AgentToolName.ProposeAlbumOperations)!;
    const albumExample = proposal.examples.find((example) => example.name === 'create-album-and-add-assets')!;
    const spaceExample = proposal.examples.find((example) => example.name === 'create-space-and-add-assets')!;

    expect(albumExample.arguments).toMatchObject({
      operations: [
        expect.objectContaining({
          type: AgentOperationType.AlbumCreate,
          targetKind: AgentOperationTargetKind.NewAlbum,
          temporaryTargetId: 'tmp-today-test',
        }),
        expect.objectContaining({
          type: AgentOperationType.AlbumAddAssets,
          targetKind: AgentOperationTargetKind.NewAlbum,
          temporaryTargetId: 'tmp-today-test',
        }),
      ],
    });
    expect(spaceExample.arguments).toMatchObject({
      operations: [
        expect.objectContaining({
          type: AgentOperationType.SpaceCreate,
          targetKind: AgentOperationTargetKind.NewSpace,
          temporaryTargetId: 'tmp-family-space',
        }),
        expect.objectContaining({
          type: AgentOperationType.SpaceAddAssets,
          targetKind: AgentOperationTargetKind.NewSpace,
          temporaryTargetId: 'tmp-family-space',
        }),
      ],
    });
  });

  it('defines existing-space asset planning examples with targetId and no temporary target', () => {
    const contract = sut.getPlanningToolContract(AgentToolName.ProposeAlbumOperations);

    for (const exampleName of ['add-assets-to-existing-space', 'remove-assets-from-existing-space'] as const) {
      const example = contract?.examples.find((candidate) => candidate.name === exampleName);

      expect(example, exampleName).toBeDefined();
      const parsed = AgentOperationPlanToolRequestSchemas[AgentToolName.ProposeAlbumOperations].parse(
        example?.arguments,
      );

      const operation = parsed.operations[0];
      expect(operation).toMatchObject({
        targetKind: AgentOperationTargetKind.ExistingSpace,
        targetId: '00000000-0000-4000-8000-000000000020',
        payload: {},
      });
      expect(operation).not.toHaveProperty('temporaryTargetId');
    }
  });

  it('does not include secrets, internal routes, or direct apply language', () => {
    const serialized = JSON.stringify(sut.listReadToolContracts().map(({ safety: _safety, ...contract }) => contract));

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

  it('defines planning common mistakes with usable correction hints', () => {
    for (const contract of sut.listPlanningToolContracts()) {
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

  it('provides actionable correction hints for wrong existing-space asset target shapes', () => {
    const contract = sut.getPlanningToolContract(AgentToolName.ProposeAlbumOperations);
    const mistakeIds = contract?.commonMistakes.map((mistake) => mistake.id);
    const failureCaseIds = sut.listRuntimeFailureMatrixCases().map((failureCase) => failureCase.id);

    expect(mistakeIds).toEqual(
      expect.arrayContaining([
        'planning-wrong-space-target-kind',
        'planning-existing-space-missing-target-id',
        'planning-existing-space-with-temporary-target',
      ]),
    );
    expect(failureCaseIds).toEqual(
      expect.arrayContaining([
        'planning-wrong-space-target-kind',
        'planning-existing-space-missing-target-id',
        'planning-existing-space-with-temporary-target',
      ]),
    );

    const wrongKind = contract?.commonMistakes.find((mistake) => mistake.id === 'planning-wrong-space-target-kind');
    expect(wrongKind?.hint).toMatch(/existing_space/i);
    expect(wrongKind?.hint).toMatch(/targetId/i);
  });

  it('does not include secrets, internal routes, or direct apply tool names in planning contracts', () => {
    const serialized = JSON.stringify(
      sut.listPlanningToolContracts().map(({ safety: _safety, ...contract }) => contract),
    );

    expect(serialized).not.toMatch(forbiddenContractPattern);
  });

  it('marks planning contracts as non-mutating and requiring Gallery apply for final writes', () => {
    for (const contract of sut.listPlanningToolContracts()) {
      expect(contract.safety).toEqual({
        allowsDirectMutation: false,
        exposesSecrets: false,
        requiresGalleryApplyForWrites: true,
      });
    }
  });

  it('returns defensive copies of contracts', () => {
    const firstContracts = sut.listReadToolContracts();
    firstContracts[0].description = 'mutated description';
    firstContracts[0].examples[0].arguments = { mutated: true };

    expect(sut.listReadToolContracts()[0].description).not.toBe('mutated description');
    expect(sut.listReadToolContracts()[0].examples[0].arguments).not.toEqual({ mutated: true });
  });

  it('returns defensive copies of planning contracts', () => {
    const firstContracts = sut.listPlanningToolContracts();
    firstContracts[0].description = 'mutated description';
    firstContracts[0].examples[0].arguments = { mutated: true };

    expect(sut.listPlanningToolContracts()[0].description).not.toBe('mutated description');
    expect(sut.listPlanningToolContracts()[0].examples[0].arguments).not.toEqual({ mutated: true });
  });

  describe('validation correction lookup', () => {
    it('returns the matching hint, expected usage, and example arguments for a read-tool mistake', () => {
      const correction = sut.getReadToolValidationCorrection(AgentToolName.ReadAssetPreviews, {
        requestShape: 'tool-arguments',
        issues: [{ path: '', message: 'Provide either assetIds or toolCallId, not both' }],
      });

      expect(correction).toEqual({
        mistakeId: 'asset-read-combined-asset-ids-and-tool-call-id',
        issuePath: '',
        expected: 'Use assetIds for a new request. Use only toolCallId when retrying a Gallery-approved request.',
        hint: 'Use either assetIds for a new request or toolCallId for an approved retry, not both.',
        exampleArguments: {
          toolCallId: '00000000-0000-4000-8000-000000000111',
        },
      });
    });

    it('matches JSON-RPC wrapper mistakes separately from tool-argument mistakes', () => {
      const correction = sut.getReadToolValidationCorrection(AgentToolName.ReadAssetMetadata, {
        requestShape: 'json-rpc',
        issues: [{ path: 'arguments', message: 'arguments is required' }],
      });

      expect(correction).toMatchObject({
        mistakeId: 'tool-call-arguments-missing',
        issuePath: 'arguments',
        hint: 'Put the tool arguments object at params.arguments in the MCP tools/call request.',
        exampleArguments: {
          assetIds: ['00000000-0000-4000-8000-000000000001'],
        },
      });
    });

    it('prefers the most specific mistake when multiple issues share a path', () => {
      const correction = sut.getReadToolValidationCorrection(AgentToolName.ReadAssetMetadata, {
        requestShape: 'tool-arguments',
        issues: [
          { path: 'assetIds', message: 'Too small: expected array to have >=1 items' },
          { path: 'assetIds', message: 'assetIds must be unique' },
        ],
      });

      expect(correction?.mistakeId).toBe('asset-read-duplicate-asset-ids');
      expect(correction?.issuePath).toBe('assetIds');
      expect(correction?.hint).toBe('Provide each asset id only once.');
    });

    it('returns the asset id limit correction for max array validation failures', () => {
      const correction = sut.getReadToolValidationCorrection(AgentToolName.ReadAssetMetadata, {
        requestShape: 'tool-arguments',
        issues: [{ path: 'assetIds', message: 'Too big: expected array to have <=10000 items' }],
      });

      expect(correction?.mistakeId).toBe('asset-read-too-many-asset-ids');
      expect(correction?.hint).toContain('at most 10000');
    });

    it('returns the search filter placement correction for supported filters at the argument root', () => {
      const countryCorrection = sut.getReadToolValidationCorrection(AgentToolName.SearchAssets, {
        requestShape: 'tool-arguments',
        issues: [{ path: '', message: 'Unrecognized key: "country"' }],
      });
      const ratingCorrection = sut.getReadToolValidationCorrection(AgentToolName.SearchAssets, {
        requestShape: 'tool-arguments',
        issues: [{ path: '', message: 'Unrecognized key: "rating"' }],
      });
      const createdAfterCorrection = sut.getReadToolValidationCorrection(AgentToolName.SearchAssets, {
        requestShape: 'tool-arguments',
        issues: [{ path: '', message: 'Unrecognized key: "createdAfter"' }],
      });
      const personIdsCorrection = sut.getReadToolValidationCorrection(AgentToolName.SearchAssets, {
        requestShape: 'tool-arguments',
        issues: [{ path: '', message: 'Unrecognized key: "personIds"' }],
      });

      for (const correction of [countryCorrection, ratingCorrection, createdAfterCorrection, personIdsCorrection]) {
        expect(correction?.mistakeId).toBe('search-filters-outside-filters');
        expect(correction?.hint).toBe(
          'Place supported metadata filters for date, location, favorite, rating, album, tag, camera, media, people, space, shared-space, and visibility inside the filters object.',
        );
        expect(correction?.hint).toContain('people, space, shared-space, and visibility');
        expect(correction?.exampleArguments).toEqual({
          mode: 'metadata',
          filters: {
            takenAfter: '2026-05-01T00:00:00.000Z',
            takenBefore: '2026-05-18T23:59:59.999Z',
            city: 'Berlin',
            country: 'Germany',
          },
          limit: 50,
          page: 1,
          order: 'desc',
        });
      }
    });

    it('returns a metadata query correction when a model sends query with metadata mode', () => {
      const correction = sut.getReadToolValidationCorrection(AgentToolName.SearchAssets, {
        requestShape: 'tool-arguments',
        issues: [
          { path: 'query', message: 'query is only supported for smart, description, ocr, and filename search modes' },
        ],
      });

      expect(correction?.mistakeId).toBe('search-query-with-metadata-mode');
      expect(correction?.hint).toContain('Use mode smart, description, ocr, or filename with query');
      expect(correction?.hint).not.toContain('not available yet');
      expect(correction?.exampleArguments).toEqual({
        mode: 'smart',
        query: 'beach sunset',
        filters: { withSharedSpaces: true },
        limit: 25,
      });
    });

    it('documents executable search page continuation', () => {
      const search = sut.getReadToolContract(AgentToolName.SearchAssets);

      expect(search?.description).toContain('bounded result pages');
      expect(search?.usage).toContain(
        'repeat the same mode, query, filters, order, and limit using the returned nextPage value as page',
      );
      expect(search?.usage).not.toContain('Only page 1');
      expect(search?.usage).not.toContain('later pages and non-desc order are not available yet');
      expect(search?.examples.map((example) => example.name)).toContain('metadata-next-page-search');
    });

    it('parses the search next-page example against the live schema', () => {
      const search = sut.getReadToolContract(AgentToolName.SearchAssets);
      const example = search?.examples.find((candidate) => candidate.name === 'metadata-next-page-search');

      expect(example).toBeDefined();
      expect(AgentReadToolRequestSchemas[AgentToolName.SearchAssets].safeParse(example?.arguments).success).toBe(true);
    });

    it('uses page correction hints to explain nextPage instead of denying later pages', () => {
      const search = sut.getReadToolContract(AgentToolName.SearchAssets);
      const hint = search?.commonMistakes.find((mistake) => mistake.id === 'search-page-continuation');

      expect(hint?.hint).toContain('Use the returned nextPage value');
      expect(hint?.hint).not.toContain('Only page 1');
    });

    it('documents unavailable search ordering fields without deferring text modes', () => {
      const contract = sut.listToolContracts().find((candidate) => candidate.name === AgentToolName.SearchAssets);

      expect(contract?.usage).not.toContain('Only page 1');
      expect(contract?.usage).not.toContain('later pages and non-desc order are not available yet');
      expect(contract?.usage).not.toContain('Text modes, later pages, and non-desc order are not available yet');
      expect(contract?.commonMistakes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'search-order-unavailable',
            hint: expect.stringContaining('Only order desc is executable'),
          }),
        ]),
      );
    });

    it('returns a current search field and toolCallId correction', () => {
      const correction = sut.getReadToolValidationCorrection(AgentToolName.SearchAssets, {
        requestShape: 'tool-arguments',
        issues: [{ path: '', message: 'Provide either search fields or toolCallId, not both' }],
      });

      expect(correction?.mistakeId).toBe('search-combined-filters-and-tool-call-id');
      expect(correction?.hint).toContain('mode, query, filters, limit, page, or order');
      expect(correction?.exampleArguments).toEqual({
        toolCallId: '00000000-0000-4000-8000-000000000111',
      });
    });

    it('returns a spacePersonIds scope correction', () => {
      const correction = sut.getReadToolValidationCorrection(AgentToolName.SearchAssets, {
        requestShape: 'tool-arguments',
        issues: [{ path: 'filters.spacePersonIds', message: 'spacePersonIds requires spaceId' }],
      });

      expect(correction?.mistakeId).toBe('search-space-person-without-space');
      expect(correction?.hint).toBe(
        'spacePersonIds requires filters.spaceId. Resolve or choose the space first, then call searchAssets with both fields under filters.',
      );
      expect(correction?.exampleArguments).toEqual({
        filters: {
          spaceId: '00000000-0000-4000-8000-000000000020',
          spacePersonIds: ['00000000-0000-4000-8000-000000000021'],
        },
        limit: 25,
      });
      expect(correction?.hint).not.toContain('Use global personIds');
    });

    it('returns searchAssets corrections for names passed to id filter fields', () => {
      const cases = [
        {
          path: 'filters.tagIds.0',
          mistakeId: 'search-filter-name-in-tag-ids',
          exampleArguments: {
            filters: {
              tagIds: ['00000000-0000-4000-8000-000000000030'],
              albumIds: ['00000000-0000-4000-8000-000000000010'],
            },
            limit: 25,
          },
        },
        {
          path: 'filters.personIds.0',
          mistakeId: 'search-filter-name-in-person-ids',
          exampleArguments: {
            filters: {
              personIds: ['00000000-0000-4000-8000-000000000040'],
            },
            limit: 25,
          },
        },
        {
          path: 'filters.spaceId',
          mistakeId: 'search-filter-name-in-space-id',
          exampleArguments: {
            filters: {
              spaceId: '00000000-0000-4000-8000-000000000020',
            },
            limit: 25,
          },
        },
        {
          path: 'filters.spacePersonIds.0',
          mistakeId: 'search-filter-name-in-space-person-ids',
          exampleArguments: {
            filters: {
              spaceId: '00000000-0000-4000-8000-000000000020',
              spacePersonIds: ['00000000-0000-4000-8000-000000000021'],
            },
            limit: 25,
          },
        },
      ] as const;

      for (const { path, mistakeId, exampleArguments } of cases) {
        const correction = sut.getReadToolValidationCorrection(AgentToolName.SearchAssets, {
          requestShape: 'tool-arguments',
          issues: [{ path, message: 'Invalid UUID' }],
        });

        expect(correction).toMatchObject({
          mistakeId,
          issuePath: path,
          hint: expect.stringContaining('Use resolveAssetSearchFilters'),
          exampleArguments,
        });
        expect(
          AgentReadToolRequestSchemas[AgentToolName.SearchAssets].safeParse(correction?.exampleArguments).success,
        ).toBe(true);
      }
    });

    it('returns targeted corrections for every Slice 7 search mistake', () => {
      const cases = [
        {
          label: 'root filters',
          issues: [{ path: '', message: 'Unrecognized keys: "isFavorite", "rating", "type"' }],
          mistakeId: 'search-filters-outside-filters',
          hint: 'inside the filters object',
        },
        {
          label: 'tag name in id field',
          issues: [{ path: 'filters.tagIds.0', message: 'Invalid UUID' }],
          mistakeId: 'search-filter-name-in-tag-ids',
          hint: 'Use resolveAssetSearchFilters',
        },
        {
          label: 'album name in id field',
          issues: [{ path: 'filters.albumIds.0', message: 'Invalid UUID' }],
          mistakeId: 'search-filter-name-in-album-ids',
          hint: 'Use resolveAssetSearchFilters',
        },
        {
          label: 'person name in id field',
          issues: [{ path: 'filters.personIds.0', message: 'Invalid UUID' }],
          mistakeId: 'search-filter-name-in-person-ids',
          hint: 'Use resolveAssetSearchFilters',
        },
        {
          label: 'space name in id field',
          issues: [{ path: 'filters.spaceId', message: 'Invalid UUID' }],
          mistakeId: 'search-filter-name-in-space-id',
          hint: 'Use resolveAssetSearchFilters',
        },
        {
          label: 'metadata query',
          issues: [
            { path: 'query', message: 'query is only supported for smart, description, ocr, and filename search modes' },
          ],
          mistakeId: 'search-query-with-metadata-mode',
          hint: 'Use mode smart, description, ocr, or filename with query',
        },
        {
          label: 'space person without space',
          issues: [{ path: 'filters.spacePersonIds', message: 'spacePersonIds requires spaceId' }],
          mistakeId: 'search-space-person-without-space',
          hint: 'spacePersonIds requires filters.spaceId',
        },
        {
          label: 'toolCallId with new search fields',
          issues: [{ path: '', message: 'Provide either search fields or toolCallId, not both' }],
          mistakeId: 'search-combined-filters-and-tool-call-id',
          hint: 'only toolCallId for an approved retry',
        },
      ] as const;

      for (const { label, issues, mistakeId, hint } of cases) {
        const correction = sut.getReadToolValidationCorrection(AgentToolName.SearchAssets, {
          requestShape: 'tool-arguments',
          issues,
        });

        expect(correction?.mistakeId, label).toBe(mistakeId);
        expect(correction?.issuePath, label).toBe(issues[0].path);
        expect(correction?.hint, label).toContain(hint);
        expect(AgentReadToolRequestSchemas[AgentToolName.SearchAssets].safeParse(correction?.exampleArguments).success)
          .toBe(true);
      }
    });

    it('returns resolver corrections for missing fields and combined resolver fields with toolCallId', () => {
      const missing = sut.getReadToolValidationCorrection(AgentToolName.ResolveAssetSearchFilters, {
        requestShape: 'tool-arguments',
        issues: [{ path: '', message: 'Provide at least one resolver field' }],
      });
      const mixed = sut.getReadToolValidationCorrection(AgentToolName.ResolveAssetSearchFilters, {
        requestShape: 'tool-arguments',
        issues: [{ path: '', message: 'Provide either resolver fields or toolCallId, not both' }],
      });

      expect(missing).toMatchObject({
        mistakeId: 'resolver-missing-fields',
        hint: expect.stringContaining('Provide at least one name field'),
        exampleArguments: { tags: ['Travel'], albums: ['Berlin'] },
      });
      expect(mixed).toMatchObject({
        mistakeId: 'resolver-combined-fields-and-tool-call-id',
        hint: expect.stringContaining('Use resolver fields for a new request or only toolCallId'),
        exampleArguments: { toolCallId: '00000000-0000-4000-8000-000000000111' },
      });
    });

    it('returns a read-tool fallback when no common mistake matches', () => {
      const correction = sut.getReadToolValidationCorrection(AgentToolName.SearchAssets, {
        requestShape: 'tool-arguments',
        issues: [{ path: 'filters.rating', message: 'Too big: expected number to be <=5' }],
      });

      const expectedUsage =
        'Put deterministic metadata search filters under filters. Known ID filters: people, spaces, visibility, dates, albums, tags, camera fields, ratings, and media types. Use returned personIds or spaceId plus spacePersonIds, then propose operation plans with the returned asset IDs. Use mode smart, description, ocr, or filename with query for text search. Search responses are bounded; when hasMore is true, repeat the same mode, query, filters, order, and limit using the returned nextPage value as page.';
      expect(correction).toEqual({
        expected: expectedUsage,
        hint: expectedUsage,
        exampleArguments: {},
      });
    });

    it('returns defensive copies of example arguments', () => {
      const firstCorrection = sut.getReadToolValidationCorrection(AgentToolName.ReadAlbum, {
        requestShape: 'tool-arguments',
        issues: [{ path: 'albumId', message: 'Invalid UUID' }],
      });

      firstCorrection!.exampleArguments = { mutated: true };

      expect(
        sut.getReadToolValidationCorrection(AgentToolName.ReadAlbum, {
          requestShape: 'tool-arguments',
          issues: [{ path: 'albumId', message: 'Invalid UUID' }],
        })?.exampleArguments,
      ).toEqual({
        albumId: '00000000-0000-4000-8000-000000000010',
      });
    });

    it('returns a planning correction for missing temporary target dependencies', () => {
      const correction = sut.getPlanningToolValidationCorrection(AgentToolName.ProposeAlbumOperations, {
        requestShape: 'tool-arguments',
        issues: [
          { path: 'operations.0.temporaryTargetId', message: 'No matching create operation for temporaryTargetId' },
        ],
      });

      expect(correction).toMatchObject({
        mistakeId: 'planning-missing-temporary-target-dependency',
        issuePath: 'operations.0.temporaryTargetId',
        expected: expect.stringContaining('reviewable Gallery operation plan'),
        hint: expect.stringContaining('Create the new album or space first'),
        exampleArguments: expect.objectContaining({
          summary: 'Create today test and add selected photos.',
          operations: expect.any(Array),
        }),
      });
    });

    it('returns a planning correction for wrong asset batch target kind', () => {
      const correction = sut.getPlanningToolValidationCorrection(AgentToolName.ProposeAlbumOperations, {
        requestShape: 'tool-arguments',
        issues: [{ path: 'operations.0.targetKind', message: 'asset.setFavorite requires an asset_batch target' }],
      });

      expect(correction).toMatchObject({
        mistakeId: 'planning-wrong-asset-batch-target-kind',
        issuePath: 'operations.0.targetKind',
        hint: expect.stringContaining('asset_batch'),
        exampleArguments: expect.objectContaining({
          operations: [expect.objectContaining({ targetKind: AgentOperationTargetKind.AssetBatch })],
        }),
      });
    });

    it('returns a planning correction for invalid rotate angles', () => {
      const correction = sut.getPlanningToolValidationCorrection(AgentToolName.ProposeAlbumOperations, {
        requestShape: 'tool-arguments',
        issues: [{ path: 'operations.0.payload.angle', message: 'angle must be 90, 180, or 270' }],
      });

      expect(correction).toMatchObject({
        mistakeId: 'planning-invalid-rotate-angle',
        issuePath: 'operations.0.payload.angle',
        hint: expect.stringContaining('90, 180, or 270'),
        exampleArguments: expect.objectContaining({
          operations: [expect.objectContaining({ type: AgentOperationType.AssetRotate })],
        }),
      });
    });

    it('returns operation-specific planning examples for revise corrections', () => {
      const correction = sut.getPlanningToolValidationCorrection(AgentToolName.ReviseProposedOperations, {
        requestShape: 'tool-arguments',
        issues: [{ path: 'operations.0.payload.angle', message: 'angle must be 90, 180, or 270' }],
      });

      expect(correction).toMatchObject({
        mistakeId: 'planning-invalid-rotate-angle',
        hint: expect.stringContaining('90, 180, or 270'),
        exampleArguments: expect.objectContaining({
          planId: '00000000-0000-4000-8000-000000000222',
          operations: [expect.objectContaining({ type: AgentOperationType.AssetRotate })],
        }),
      });
    });

    it('returns wrapper corrections for summarize plan JSON-RPC argument mistakes', () => {
      const correction = sut.getPlanningToolValidationCorrection(AgentToolName.SummarizePlan, {
        requestShape: 'json-rpc',
        issues: [{ path: 'arguments', message: 'arguments is required' }],
      });

      expect(correction).toMatchObject({
        mistakeId: 'planning-tool-arguments-missing',
        issuePath: 'arguments',
        hint: expect.stringContaining('params.arguments'),
        exampleArguments: { planId: '00000000-0000-4000-8000-000000000222' },
      });
    });

    it('returns a planning-tool fallback when no common mistake matches', () => {
      const correction = sut.getPlanningToolValidationCorrection(AgentToolName.ProposeAlbumOperations, {
        requestShape: 'tool-arguments',
        issues: [{ path: 'summary', message: 'Too small: expected string to have >=1 characters' }],
      });

      expect(correction).toEqual({
        expected:
          'Create a reviewable Gallery operation plan. Put all writes in operations and let Gallery apply the plan after user review.',
        hint: 'Create a reviewable Gallery operation plan. Put all writes in operations and let Gallery apply the plan after user review.',
        exampleArguments: expect.objectContaining({
          summary: 'Create today test album.',
          operations: expect.any(Array),
        }),
      });
    });
  });

  it('defines a Slice 4 planning failure matrix with unique ids', () => {
    const cases = sut.listSlice4PlanningFailureMatrixCases();

    expect(cases.length).toBeGreaterThan(0);
    expect(new Set(cases.map((failureCase) => failureCase.id)).size).toBe(cases.length);
    expect(cases.map((failureCase) => failureCase.id)).toEqual(
      expect.arrayContaining([
        'planning-missing-arguments',
        'planning-missing-new-album-dependency',
        'planning-wrong-album-target-kind',
        'planning-wrong-space-target-kind',
        'planning-wrong-asset-batch-target-kind',
        'planning-wrong-image-edit-target-kind',
        'planning-duplicate-asset-ids',
        'planning-invalid-rotate-angle',
        'planning-invented-create-album-tool',
        'planning-invented-add-assets-tool',
      ]),
    );
  });

  it('connects planning failure cases to contract common mistakes', () => {
    const planningContracts = sut.listPlanningToolContracts();

    for (const failureCase of sut.listSlice4PlanningFailureMatrixCases()) {
      if (!failureCase.toolName) {
        continue;
      }

      const contract = planningContracts.find((candidate) => candidate.name === failureCase.toolName);

      if (!contract) {
        continue;
      }

      const mistakeIds = contract.commonMistakes.map((mistake) => mistake.id);

      expect(mistakeIds, `${failureCase.id} should map to ${failureCase.toolName}`).toContain(
        failureCase.expectedContractMistakeId,
      );
    }
  });

  it('documents actionable correction hints for invalid space detail updates', () => {
    const contract = sut.getPlanningToolContract(AgentToolName.ProposeAlbumOperations);
    const mistakeIds = contract?.commonMistakes.map((mistake) => mistake.id);
    const failureCaseIds = sut.listRuntimeFailureMatrixCases().map((failureCase) => failureCase.id);

    expect(mistakeIds).toEqual(
      expect.arrayContaining([
        'planning-space-update-empty-payload',
        'planning-space-update-unsupported-fields',
        'planning-space-update-missing-target-id',
        'planning-direct-space-mutation',
      ]),
    );
    expect(failureCaseIds).toEqual(
      expect.arrayContaining([
        'planning-space-update-empty-payload',
        'planning-space-update-unsupported-fields',
        'planning-space-update-missing-target-id',
      ]),
    );

    const unsupported = contract?.commonMistakes.find(
      (mistake) => mistake.id === 'planning-space-update-unsupported-fields',
    );
    expect(unsupported?.hint).toMatch(/spaceName/i);
    expect(unsupported?.hint).toMatch(/description/i);
    expect(unsupported?.hint).toMatch(/color/i);
    expect(unsupported?.hint).toMatch(/thumbnail|pets|face|linked|delete/i);
  });

  describe('Slice 7 runtime failure matrix contract', () => {
    const expectedRuntimeFailureMatrixCategories = [
      'request-wrapper',
      'read-retry',
      'read-request',
      'album-read',
      'search',
      'safety',
      'planning-wrapper',
      'planning-dependency',
      'planning-target',
      'planning-payload',
      'planning-safety',
    ] as const;

    const expectedSlice7FailureCaseIds = [
      'pi-prefixed-search-tool-name',
      'pi-prefixed-planning-tool-name',
      'invented-prefixed-apply-tool',
      'planning-dependent-add-assets-wrong-temporary-target-kind',
      'planning-dependent-set-cover-missing-new-album',
      'planning-direct-add-assets-tool',
      'search-root-taken-after-filter',
      'search-root-favorite-rating-filters',
      'search-tag-name-in-id-filter',
      'search-album-name-in-id-filter',
      'search-person-name-in-id-filter',
      'search-space-name-in-id-filter',
      'search-query-with-metadata-mode',
      'search-space-person-without-space',
      'search-fields-with-tool-call-id',
    ] as const;

    it('returns a combined runtime failure matrix with complete metadata', () => {
      const cases = sut.listRuntimeFailureMatrixCases();
      const caseIds = cases.map((failureCase) => failureCase.id);

      expect(caseIds).toEqual(expect.arrayContaining(sut.listSlice1RuntimeFailureMatrixCases().map(({ id }) => id)));
      expect(caseIds).toEqual(expect.arrayContaining(sut.listSlice4PlanningFailureMatrixCases().map(({ id }) => id)));
      expect(new Set(caseIds).size).toBe(cases.length);
      expect(cases.map((failureCase) => failureCase.category)).toEqual(
        expect.arrayContaining([...expectedRuntimeFailureMatrixCategories]),
      );

      for (const failureCase of cases) {
        expect(failureCase.id.trim().length).toBeGreaterThan(0);
        expect(failureCase.category).toBeTruthy();
        expect(failureCase.description.trim().length).toBeGreaterThan(0);
        expect(failureCase.request).toEqual(expect.any(Object));
        expect(failureCase.expectedResult).toEqual(expect.any(Object));

        if (failureCase.expectedResult.kind === 'tool-validation') {
          expect(failureCase.toolName, `${failureCase.id} should declare its tool`).toBeTruthy();
          expect(
            failureCase.expectedContractMistakeId,
            `${failureCase.id} should declare its expected contract mistake`,
          ).toBeTruthy();
        } else {
          expect(failureCase.expectedContractMistakeId, `${failureCase.id} should not link a protocol error`).toBe(
            undefined,
          );
        }
      }
    });

    it('includes explicit Slice 7 hardening case ids', () => {
      const caseIds = sut.listRuntimeFailureMatrixCases().map((failureCase) => failureCase.id);

      expect(caseIds).toEqual(expect.arrayContaining([...expectedSlice7FailureCaseIds]));
    });

    it('links every tool-validation matrix case to an executable contract mistake example', () => {
      const contractsByName = new Map(sut.listToolContracts().map((contract) => [contract.name, contract]));

      for (const failureCase of sut.listRuntimeFailureMatrixCases()) {
        if (failureCase.expectedResult.kind !== 'tool-validation') {
          continue;
        }

        const contract = contractsByName.get(failureCase.toolName!);
        const mistake = contract?.commonMistakes.find(
          (candidate) => candidate.id === failureCase.expectedContractMistakeId,
        );

        expect(contract, `${failureCase.id} should map to a known tool contract`).toBeTruthy();
        expect(mistake, `${failureCase.id} should map to ${failureCase.expectedContractMistakeId}`).toBeTruthy();
        expect(mistake!.hint.trim().length).toBeGreaterThan(20);

        if (!mistake!.exampleName) {
          continue;
        }

        const example = contract!.examples.find((candidate) => candidate.name === mistake!.exampleName);

        expect(example, `${failureCase.id} should reference an existing example`).toBeTruthy();

        if (failureCase.toolName! in AgentReadToolRequestSchemas) {
          const schema = AgentReadToolRequestSchemas[failureCase.toolName as keyof typeof AgentReadToolRequestSchemas];

          expect(schema.safeParse(example!.arguments).success, `${failureCase.id} example should parse`).toBe(true);
        } else {
          const schema =
            AgentOperationPlanToolRequestSchemas[
              failureCase.toolName as keyof typeof AgentOperationPlanToolRequestSchemas
            ];

          expect(schema.safeParse(example!.arguments).success, `${failureCase.id} example should parse`).toBe(true);
        }
      }
    });

    it('keeps matrix metadata and representative requests compact', () => {
      for (const failureCase of sut.listRuntimeFailureMatrixCases()) {
        expect(failureCase.description.length, `${failureCase.id} description`).toBeLessThanOrEqual(220);

        if (failureCase.expectedResult.kind === 'protocol-error') {
          expect(
            failureCase.expectedResult.expectedErrorMessage.length,
            `${failureCase.id} protocol message`,
          ).toBeLessThanOrEqual(100);
        }

        if (failureCase.id !== 'asset-read-too-many-asset-ids') {
          expect(JSON.stringify(failureCase.request).length, `${failureCase.id} request`).toBeLessThanOrEqual(5000);
        }
      }
    });
  });
});
