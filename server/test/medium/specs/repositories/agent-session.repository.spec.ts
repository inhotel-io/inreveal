import { Kysely } from 'kysely';
import { AgentApprovalMode, AgentPermissionPreset, AgentProviderType, AgentSessionStatus } from 'src/enum';
import { AgentProviderCredentialRepository } from 'src/repositories/agent-provider-credential.repository';
import { AgentSessionRepository } from 'src/repositories/agent-session.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { DB } from 'src/schema';
import { BaseService } from 'src/services/base.service';
import { newMediumService } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

let defaultDatabase: Kysely<DB>;

const credentialSnapshot = {
  id: '00000000-0000-4000-8000-000000000001',
  providerType: AgentProviderType.OpenAI,
  label: 'OpenAI personal',
  baseUrl: null,
  models: ['gpt-5.1'],
  defaultModel: 'gpt-5.1',
};

const modelSnapshot = {
  providerCredentialId: credentialSnapshot.id,
  model: 'gpt-5.1',
};

const permissionPlanSnapshot = {
  read: {
    metadata: true,
    previews: true,
    originals: false,
  },
  providerExposure: {
    metadata: true,
    previews: true,
    originals: false,
    allowOriginalsForExternalProviders: false,
  },
  assetScope: {
    owned: true,
    sharedSpaces: false,
    locked: false,
  },
  writeScope: {
    createAlbum: true,
    addAssets: true,
    updateDetails: false,
    setCover: false,
  },
  limits: {
    maxAssetsPerToolCall: 100,
    maxAssetsPerSession: 1_000,
    maxPreviewsPerToolCall: 50,
    maxOriginalsPerToolCall: 0,
    expiresInMinutes: 60,
  },
};

const runnerCapabilitiesSnapshot = {
  protocol: 'pi-agent-v1',
  tools: ['album.create', 'asset.search'],
};

const initialContextSnapshot = {
  prompt: 'Find the best mountain photos',
  filters: { rating: 5 },
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
    credentialRepository: new AgentProviderCredentialRepository(database),
    sut: new AgentSessionRepository(database),
  };
};

const assertUpdateType = (sut: AgentSessionRepository) => {
  void sut.update('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', {
    status: AgentSessionStatus.Completed,
    endedAt: new Date('2026-05-14T13:00:00Z'),
    runnerEndpoint: 'http://localhost:3001',
    runnerSessionId: 'runner-session-2',
    runnerCapabilitiesSnapshot: { protocol: 'pi-agent-v1', finished: true },
  });

  void sut.update('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', {
    // @ts-expect-error ownership must be immutable
    userId: '00000000-0000-4000-8000-000000000003',
  });
  void sut.update('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', {
    // @ts-expect-error provider linkage must be immutable
    providerCredentialId: '00000000-0000-4000-8000-000000000004',
  });
  void sut.update('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', {
    // @ts-expect-error credential snapshot must be immutable
    credentialSnapshot,
  });
  void sut.update('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', {
    // @ts-expect-error model snapshot must be immutable
    modelSnapshot,
  });
  void sut.update('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', {
    // @ts-expect-error permission preset must be immutable
    permissionPreset: AgentPermissionPreset.Custom,
  });
  void sut.update('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', {
    // @ts-expect-error permission plan snapshot must be immutable
    permissionPlanSnapshot,
  });
  void sut.update('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', {
    // @ts-expect-error approval mode must be immutable
    approvalMode: AgentApprovalMode.DangerouslySkipPermissions,
  });
  void sut.update('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', {
    // @ts-expect-error initial context snapshot must be immutable
    initialContextSnapshot,
  });
  void sut.update('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', {
    // @ts-expect-error created timestamp must be immutable
    createdAt: new Date('2026-05-14T13:00:00Z'),
  });
};

void assertUpdateType;

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

describe(AgentSessionRepository.name, () => {
  it('persists snapshots and scopes reads, lists, and updates by user', async () => {
    const { ctx, credentialRepository, sut } = setup();
    const { user } = await ctx.newUser();
    const { user: otherUser } = await ctx.newUser();
    const credential = await credentialRepository.create({
      userId: user.id,
      providerType: AgentProviderType.OpenAI,
      label: 'OpenAI personal',
      baseUrl: null,
      encryptedSecret: 'v1:encrypted',
      models: ['gpt-5.1'],
      defaultModel: 'gpt-5.1',
    });

    const created = await sut.create({
      userId: user.id,
      providerCredentialId: credential.id,
      credentialSnapshot: { ...credentialSnapshot, id: credential.id },
      modelSnapshot: { ...modelSnapshot, providerCredentialId: credential.id },
      permissionPreset: AgentPermissionPreset.VisualOrganizer,
      permissionPlanSnapshot,
      approvalMode: AgentApprovalMode.AskOnEscalation,
      runnerEndpoint: 'http://localhost:3001',
      runnerSessionId: 'runner-session-1',
      runnerCapabilitiesSnapshot,
      status: AgentSessionStatus.Running,
      initialContextSnapshot,
      createdAt: new Date('2026-05-14T11:00:00Z'),
    });

    expect(created).toMatchObject({
      userId: user.id,
      providerCredentialId: credential.id,
      credentialSnapshot: { ...credentialSnapshot, id: credential.id },
      modelSnapshot: { ...modelSnapshot, providerCredentialId: credential.id },
      permissionPreset: AgentPermissionPreset.VisualOrganizer,
      permissionPlanSnapshot,
      approvalMode: AgentApprovalMode.AskOnEscalation,
      runnerEndpoint: 'http://localhost:3001',
      runnerSessionId: 'runner-session-1',
      runnerCapabilitiesSnapshot,
      status: AgentSessionStatus.Running,
      initialContextSnapshot,
      endedAt: null,
    });
    expect(created.id).toBeDefined();
    expect(created.createdAt).toBeDefined();
    expect(created.updatedAt).toBeDefined();
    expect(created.updateId).toBeDefined();

    const newer = await sut.create({
      userId: user.id,
      providerCredentialId: credential.id,
      credentialSnapshot: { ...credentialSnapshot, id: credential.id },
      modelSnapshot: { ...modelSnapshot, providerCredentialId: credential.id, model: 'gpt-5.1-mini' },
      permissionPreset: AgentPermissionPreset.Careful,
      permissionPlanSnapshot,
      approvalMode: AgentApprovalMode.Strict,
      runnerEndpoint: null,
      runnerSessionId: null,
      runnerCapabilitiesSnapshot: null,
      initialContextSnapshot: {},
      createdAt: new Date('2026-05-14T12:00:00Z'),
    });

    await expect(sut.getById(user.id, created.id)).resolves.toMatchObject({ id: created.id });
    await expect(sut.getById(otherUser.id, created.id)).resolves.toBeUndefined();
    await expect(sut.getByUserId(otherUser.id)).resolves.toEqual([]);
    await expect(sut.getByUserId(user.id)).resolves.toMatchObject([{ id: newer.id }, { id: created.id }]);

    const endedAt = new Date('2026-05-14T13:00:00Z');
    const updated = await sut.update(user.id, created.id, {
      status: AgentSessionStatus.Completed,
      endedAt,
      runnerSessionId: 'runner-session-2',
      runnerCapabilitiesSnapshot: { protocol: 'pi-agent-v1', finished: true },
    });

    expect(updated).toMatchObject({
      id: created.id,
      status: AgentSessionStatus.Completed,
      endedAt,
      runnerSessionId: 'runner-session-2',
      runnerCapabilitiesSnapshot: { protocol: 'pi-agent-v1', finished: true },
    });

    await expect(sut.update(otherUser.id, created.id, { status: AgentSessionStatus.Failed })).rejects.toThrow();
    await expect(sut.getById(user.id, created.id)).resolves.toMatchObject({
      id: created.id,
      status: AgentSessionStatus.Completed,
    });
  });

  it('sets providerCredentialId null when a credential is deleted while preserving snapshots', async () => {
    const { ctx, credentialRepository, sut } = setup();
    const { user } = await ctx.newUser();
    const credential = await credentialRepository.create({
      userId: user.id,
      providerType: AgentProviderType.Anthropic,
      label: 'Anthropic work',
      baseUrl: null,
      encryptedSecret: 'v1:encrypted',
      models: ['claude-sonnet-4.5'],
      defaultModel: 'claude-sonnet-4.5',
    });
    const savedCredentialSnapshot = {
      id: credential.id,
      providerType: AgentProviderType.Anthropic,
      label: 'Anthropic work',
      baseUrl: null,
      models: ['claude-sonnet-4.5'],
      defaultModel: 'claude-sonnet-4.5',
    };
    const savedModelSnapshot = {
      providerCredentialId: credential.id,
      model: 'claude-sonnet-4.5',
    };
    const session = await sut.create({
      userId: user.id,
      providerCredentialId: credential.id,
      credentialSnapshot: savedCredentialSnapshot,
      modelSnapshot: savedModelSnapshot,
      permissionPreset: AgentPermissionPreset.Careful,
      permissionPlanSnapshot,
      approvalMode: AgentApprovalMode.Strict,
      runnerEndpoint: null,
      runnerSessionId: null,
      runnerCapabilitiesSnapshot: null,
      initialContextSnapshot,
    });

    await credentialRepository.delete(user.id, credential.id);

    await expect(sut.getById(user.id, session.id)).resolves.toMatchObject({
      id: session.id,
      providerCredentialId: null,
      credentialSnapshot: savedCredentialSnapshot,
      modelSnapshot: savedModelSnapshot,
      permissionPlanSnapshot,
      initialContextSnapshot,
    });
  });

  it('cascades sessions when the owning user is deleted', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const session = await sut.create({
      userId: user.id,
      providerCredentialId: null,
      credentialSnapshot,
      modelSnapshot,
      permissionPreset: AgentPermissionPreset.Careful,
      permissionPlanSnapshot,
      approvalMode: AgentApprovalMode.Strict,
      runnerEndpoint: null,
      runnerSessionId: null,
      runnerCapabilitiesSnapshot: null,
      initialContextSnapshot,
    });

    await ctx.database.deleteFrom('user').where('id', '=', user.id).execute();

    await expect(sut.getById(user.id, session.id)).resolves.toBeUndefined();
  });
});
