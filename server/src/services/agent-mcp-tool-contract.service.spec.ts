import { AgentOperationPlanToolRequestSchemas } from 'src/dtos/agent-operation.dto';
import { AgentReadToolRequestSchemas } from 'src/dtos/agent-tool.dto';
import { AgentOperationTargetKind, AgentOperationType, AgentToolName } from 'src/enum';
import { AgentMcpToolContractService } from 'src/services/agent-mcp-tool-contract.service';

const expectedReadToolNames = [
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
        'approved-retry',
      ]),
    );
  });

  it('does not advertise future text search modes or examples for searchAssets', () => {
    const search = sut.getReadToolContract(AgentToolName.SearchAssets);

    expect(search?.argumentModes.map((mode) => mode.name)).not.toContain('text-search');
    expect(search?.examples.map((example) => example.name)).not.toContain('future-smart-search-contract');
    expect(search?.examples).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          arguments: expect.objectContaining({
            mode: expect.stringMatching(/^(smart|description|ocr|filename)$/),
          }),
        }),
      ]),
    );
  });

  it('defines a search-specific approved retry mode that forbids all new search fields', () => {
    const search = sut.getReadToolContract(AgentToolName.SearchAssets);

    expect(search?.argumentModes.find((mode) => mode.name === 'approved-retry')).toMatchObject({
      requiredFields: ['toolCallId'],
      forbiddenFields: ['mode', 'query', 'filters', 'limit', 'page', 'order'],
    });
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
          'Place date, location, favorite, rating, album, tag, camera, people, space, visibility, and media filters inside the filters object.',
        );
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
      expect(correction?.hint).toContain('Omit query and use metadata filters for now');
      expect(correction?.hint).toContain('Text search modes are in the contract but are not available yet');
      expect(correction?.hint).not.toContain('Use mode smart, description, ocr, or filename');
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

    it('returns a space person scope correction', () => {
      const correction = sut.getReadToolValidationCorrection(AgentToolName.SearchAssets, {
        requestShape: 'tool-arguments',
        issues: [{ path: 'filters.spacePersonIds', message: 'spacePersonIds requires spaceId' }],
      });

      expect(correction?.mistakeId).toBe('search-space-person-without-space');
      expect(correction?.hint).toContain('spacePersonIds requires filters.spaceId');
    });

    it('returns a read-tool fallback when no common mistake matches', () => {
      const correction = sut.getReadToolValidationCorrection(AgentToolName.SearchAssets, {
        requestShape: 'tool-arguments',
        issues: [{ path: 'filters.rating', message: 'Too big: expected number to be <=5' }],
      });

      expect(correction).toEqual({
        expected:
          'Put all search filters under filters. Use mode metadata for structured filters. Use only toolCallId when retrying a Gallery-approved search.',
        hint:
          'Put all search filters under filters. Use mode metadata for structured filters. Use only toolCallId when retrying a Gallery-approved search.',
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
