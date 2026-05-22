import { Kysely } from 'kysely';
import { DummyValue, GenerateSqlQueries, GENERATE_SQL_KEY } from 'src/decorators';
import { AgentApprovalMode, AgentPermissionPreset, AgentProviderType } from 'src/enum';
import { AgentProviderCredentialRepository } from 'src/repositories/agent-provider-credential.repository';
import { AgentSelectionHandleRepository } from 'src/repositories/agent-selection-handle.repository';
import { AgentSessionRepository } from 'src/repositories/agent-session.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { DB } from 'src/schema';
import { BaseService } from 'src/services/base.service';
import { newMediumService } from 'test/medium.factory';
import { factory } from 'test/small.factory';
import { getKyselyDB } from 'test/utils';

let defaultDatabase: Kysely<DB>;

const permissionPlanSnapshot = {
  read: { metadata: true, previews: false, originals: false },
  providerExposure: {
    metadata: true,
    previews: false,
    originals: false,
    allowOriginalsForExternalProviders: false,
  },
  assetScope: { owned: true, sharedSpaces: false, locked: false },
  writeScope: { createAlbum: true, addAssets: true, updateDetails: true, setCover: true },
  limits: {
    maxAssetsPerToolCall: 10_000,
    maxAssetsPerSession: 10_000,
    maxPreviewsPerToolCall: 0,
    maxOriginalsPerToolCall: 0,
    expiresInMinutes: 60,
  },
};

const setup = (db?: Kysely<DB>) => {
  const database = db || defaultDatabase;
  const { ctx } = newMediumService(BaseService, {
    database,
    real: [],
    mock: [LoggingRepository],
  });

  return {
    ctx,
    database,
    credentialRepository: new AgentProviderCredentialRepository(database),
    sessionRepository: new AgentSessionRepository(database),
    sut: new AgentSelectionHandleRepository(database),
  };
};

const createSession = async (
  ctx: ReturnType<typeof setup>['ctx'],
  credentialRepository: AgentProviderCredentialRepository,
  sessionRepository: AgentSessionRepository,
) => {
  const { user } = await ctx.newUser();
  const credential = await credentialRepository.create({
    userId: user.id,
    providerType: AgentProviderType.OpenAI,
    label: 'OpenAI personal',
    baseUrl: null,
    encryptedSecret: 'v1:encrypted',
    models: ['gpt-5.1'],
    defaultModel: 'gpt-5.1',
  });

  const session = await sessionRepository.create({
    userId: user.id,
    providerCredentialId: credential.id,
    credentialSnapshot: {
      id: credential.id,
      providerType: AgentProviderType.OpenAI,
      label: 'OpenAI personal',
      baseUrl: null,
      models: ['gpt-5.1'],
      defaultModel: 'gpt-5.1',
    },
    modelSnapshot: { providerCredentialId: credential.id, model: 'gpt-5.1' },
    permissionPreset: AgentPermissionPreset.Careful,
    permissionPlanSnapshot,
    approvalMode: AgentApprovalMode.Strict,
    runnerEndpoint: null,
    runnerSessionId: null,
    runnerCapabilitiesSnapshot: null,
    initialContextSnapshot: {},
  });

  return { user, session };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

describe(AgentSelectionHandleRepository.name, () => {
  it('registers getValidForPlanning SQL generation with one lookup object parameter', () => {
    const queries = Reflect.getMetadata(
      GENERATE_SQL_KEY,
      AgentSelectionHandleRepository.prototype.getValidForPlanning,
    ) as GenerateSqlQueries[];

    expect(queries).toEqual([
      {
        params: [
          {
            id: DummyValue.UUID,
            sessionId: DummyValue.UUID,
            userId: DummyValue.UUID,
            now: DummyValue.DATE,
          },
        ],
      },
    ]);
  });

  it('creates ordered unique session/user-scoped handles with samples and expiry', async () => {
    const { ctx, credentialRepository, sessionRepository, sut } = setup();
    const { user, session } = await createSession(ctx, credentialRepository, sessionRepository);
    const first = factory.uuid();
    const second = factory.uuid();
    const expiresAt = new Date('2026-05-21T12:30:00.000Z');

    const handle = await sut.create({
      sessionId: session.id,
      userId: user.id,
      sourceToolCallId: null,
      assetIds: [first, second, first],
      expiresAt,
    });

    expect(handle).toMatchObject({
      sessionId: session.id,
      userId: user.id,
      assetIds: [first, second],
      assetCount: 2,
      sampleAssetIds: [first, second],
      expiresAt,
    });
  });

  it('resolves only for the same session and user before expiry', async () => {
    const { ctx, credentialRepository, sessionRepository, sut } = setup();
    const { user, session } = await createSession(ctx, credentialRepository, sessionRepository);
    const other = await createSession(ctx, credentialRepository, sessionRepository);
    const assetIds = [factory.uuid(), factory.uuid()];
    const handle = await sut.create({
      sessionId: session.id,
      userId: user.id,
      sourceToolCallId: null,
      assetIds,
      expiresAt: new Date('2026-05-21T12:30:00.000Z'),
    });

    await expect(
      sut.getValidForPlanning({
        id: handle.id,
        sessionId: session.id,
        userId: user.id,
        now: new Date('2026-05-21T12:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ id: handle.id, assetIds });

    await expect(
      sut.getValidForPlanning({
        id: handle.id,
        sessionId: other.session.id,
        userId: user.id,
        now: new Date('2026-05-21T12:00:00.000Z'),
      }),
    ).resolves.toBeUndefined();

    await expect(
      sut.getValidForPlanning({
        id: handle.id,
        sessionId: session.id,
        userId: other.user.id,
        now: new Date('2026-05-21T12:00:00.000Z'),
      }),
    ).resolves.toBeUndefined();

    await expect(
      sut.getValidForPlanning({
        id: handle.id,
        sessionId: session.id,
        userId: user.id,
        now: new Date('2026-05-21T12:30:00.000Z'),
      }),
    ).resolves.toBeUndefined();
  });

  it('handles thousands of assets deterministically without expanding samples', async () => {
    const { ctx, credentialRepository, sessionRepository, sut } = setup();
    const { user, session } = await createSession(ctx, credentialRepository, sessionRepository);
    const assetIds = Array.from({ length: 1500 }, () => factory.uuid());

    const handle = await sut.create({
      sessionId: session.id,
      userId: user.id,
      sourceToolCallId: null,
      assetIds,
      expiresAt: new Date('2026-05-21T12:30:00.000Z'),
    });

    expect(handle.assetCount).toBe(1500);
    expect(handle.sampleAssetIds).toEqual(assetIds.slice(0, 25));
    await expect(
      sut.getValidForPlanning({
        id: handle.id,
        sessionId: session.id,
        userId: user.id,
        now: new Date('2026-05-21T12:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ assetIds });
  });
});
