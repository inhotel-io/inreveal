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

      for (const correction of [countryCorrection, ratingCorrection]) {
        expect(correction?.mistakeId).toBe('search-filters-outside-filters');
        expect(correction?.hint).toBe(
          'Place date, location, favorite, rating, album, tag, camera, and media filters inside the filters object.',
        );
        expect(correction?.exampleArguments).toEqual({
          filters: {
            takenAfter: '2026-05-01T00:00:00.000Z',
            takenBefore: '2026-05-18T23:59:59.999Z',
            city: 'Berlin',
            country: 'Germany',
          },
          limit: 50,
        });
      }
    });

    it('returns a read-tool fallback when no common mistake matches', () => {
      const correction = sut.getReadToolValidationCorrection(AgentToolName.SearchAssets, {
        requestShape: 'tool-arguments',
        issues: [{ path: 'filters.rating', message: 'Too big: expected number to be <=5' }],
      });

      expect(correction).toEqual({
        expected: 'Put all search filters under filters. Use only toolCallId when retrying a Gallery-approved search.',
        hint: 'Put all search filters under filters. Use only toolCallId when retrying a Gallery-approved search.',
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
