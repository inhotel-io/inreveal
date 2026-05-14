import { BadRequestException } from '@nestjs/common';
import { AgentSession } from 'src/database';
import { AgentSessionCreateDto } from 'src/dtos/agent-session.dto';
import { AgentApprovalMode, AgentPermissionPreset, AgentProviderType, AgentSessionStatus } from 'src/enum';
import { AgentSessionRepository } from 'src/repositories/agent-session.repository';
import { AgentProviderCredentialService } from 'src/services/agent-provider-credential.service';
import { AgentSessionService } from 'src/services/agent-session.service';
import { AgentInitialContextSnapshot, AgentPermissionPlanSnapshot } from 'src/types/agent-session.types';
import { AuthFactory } from 'test/factories/auth.factory';
import { newUuid } from 'test/small.factory';
import { automock } from 'test/utils';

const now = new Date('2026-05-14T12:00:00.000Z');

const carefulPermissionPlan: AgentPermissionPlanSnapshot = {
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
    maxAssetsPerToolCall: 200,
    maxAssetsPerSession: 2000,
    maxPreviewsPerToolCall: 0,
    maxOriginalsPerToolCall: 0,
    expiresInMinutes: 120,
  },
};

const visualOrganizerPermissionPlan: AgentPermissionPlanSnapshot = {
  read: { metadata: true, previews: true, originals: false },
  providerExposure: {
    metadata: true,
    previews: true,
    originals: false,
    allowOriginalsForExternalProviders: false,
  },
  assetScope: { owned: true, sharedSpaces: true, locked: false },
  writeScope: { createAlbum: true, addAssets: true, updateDetails: true, setCover: true },
  limits: {
    maxAssetsPerToolCall: 500,
    maxAssetsPerSession: 5000,
    maxPreviewsPerToolCall: 100,
    maxOriginalsPerToolCall: 0,
    expiresInMinutes: 120,
  },
};

const localPowerUserPermissionPlan: AgentPermissionPlanSnapshot = {
  read: { metadata: true, previews: true, originals: true },
  providerExposure: {
    metadata: true,
    previews: true,
    originals: true,
    allowOriginalsForExternalProviders: false,
  },
  assetScope: { owned: true, sharedSpaces: true, locked: false },
  writeScope: { createAlbum: true, addAssets: true, updateDetails: true, setCover: true },
  limits: {
    maxAssetsPerToolCall: 500,
    maxAssetsPerSession: 5000,
    maxPreviewsPerToolCall: 100,
    maxOriginalsPerToolCall: 25,
    expiresInMinutes: 120,
  },
};

const makeCredential = (overrides: Partial<Awaited<ReturnType<AgentProviderCredentialService['getById']>>> = {}) => ({
  id: newUuid(),
  providerType: AgentProviderType.OpenAI,
  label: 'OpenAI personal',
  baseUrl: null,
  models: ['gpt-5.1', 'gpt-5.1-mini'],
  defaultModel: 'gpt-5.1',
  createdAt: now,
  updatedAt: now,
  lastUsedAt: null,
  ...overrides,
});

const makeCreateDto = (overrides: Partial<AgentSessionCreateDto> = {}): AgentSessionCreateDto => ({
  providerCredentialId: newUuid(),
  model: 'gpt-5.1',
  permissionPreset: AgentPermissionPreset.Careful,
  approvalMode: AgentApprovalMode.Strict,
  ...overrides,
});

const makeSession = (overrides: Partial<AgentSession> = {}): AgentSession => {
  const providerCredentialId = newUuid();
  const initialContextSnapshot: AgentInitialContextSnapshot = { source: 'manual-test' };

  return {
    id: newUuid(),
    userId: newUuid(),
    providerCredentialId,
    credentialSnapshot: {
      id: providerCredentialId,
      providerType: AgentProviderType.OpenAI,
      label: 'OpenAI personal',
      baseUrl: null,
      models: ['gpt-5.1', 'gpt-5.1-mini'],
      defaultModel: 'gpt-5.1',
    },
    modelSnapshot: { providerCredentialId, model: 'gpt-5.1' },
    permissionPreset: AgentPermissionPreset.Careful,
    permissionPlanSnapshot: carefulPermissionPlan,
    approvalMode: AgentApprovalMode.Strict,
    runnerEndpoint: 'https://runner.example.com/sessions',
    runnerSessionId: 'runner-session-id',
    runnerCapabilitiesSnapshot: { tools: ['album.create'] },
    status: AgentSessionStatus.Created,
    initialContextSnapshot,
    createdAt: now,
    updatedAt: now,
    endedAt: null,
    updateId: newUuid(),
    ...overrides,
  };
};

describe(AgentSessionService.name, () => {
  let sut: AgentSessionService;
  let repository: ReturnType<typeof automock<AgentSessionRepository>>;
  let credentialService: ReturnType<typeof automock<AgentProviderCredentialService>>;

  beforeEach(() => {
    repository = automock(AgentSessionRepository, { args: [{} as never] });
    credentialService = automock(AgentProviderCredentialService, { args: [{} as never, {} as never] });
    sut = new AgentSessionService(repository, credentialService);
  });

  it('creates a session with credential, model, permission, approval, and initial context snapshots', async () => {
    const auth = AuthFactory.create();
    const providerCredentialId = newUuid();
    const credential = makeCredential({ id: providerCredentialId, baseUrl: 'https://api.example.com/v1' });
    const dto = makeCreateDto({
      providerCredentialId,
      permissionPreset: AgentPermissionPreset.VisualOrganizer,
      approvalMode: AgentApprovalMode.PlanOnly,
      runnerEndpoint: 'https://runner.example.com/sessions',
      initialContext: { albumId: newUuid(), selectedAssets: [newUuid()] },
    });
    const createdSession = makeSession({
      userId: auth.user.id,
      providerCredentialId,
      credentialSnapshot: {
        id: credential.id,
        providerType: credential.providerType,
        label: credential.label,
        baseUrl: credential.baseUrl,
        models: credential.models,
        defaultModel: credential.defaultModel,
      },
      modelSnapshot: { providerCredentialId, model: dto.model },
      permissionPreset: dto.permissionPreset,
      permissionPlanSnapshot: visualOrganizerPermissionPlan,
      approvalMode: dto.approvalMode,
      runnerEndpoint: dto.runnerEndpoint,
      runnerSessionId: null,
      runnerCapabilitiesSnapshot: null,
      initialContextSnapshot: dto.initialContext,
    });

    credentialService.getById.mockResolvedValue(credential);
    repository.create.mockResolvedValue(createdSession);

    const result = await sut.create(auth, dto);

    expect(credentialService.getById).toHaveBeenCalledWith(auth, providerCredentialId);
    expect(repository.create).toHaveBeenCalledWith({
      userId: auth.user.id,
      providerCredentialId,
      credentialSnapshot: {
        id: credential.id,
        providerType: credential.providerType,
        label: credential.label,
        baseUrl: credential.baseUrl,
        models: credential.models,
        defaultModel: credential.defaultModel,
      },
      modelSnapshot: { providerCredentialId, model: dto.model },
      permissionPreset: AgentPermissionPreset.VisualOrganizer,
      permissionPlanSnapshot: visualOrganizerPermissionPlan,
      approvalMode: AgentApprovalMode.PlanOnly,
      status: AgentSessionStatus.Created,
      runnerEndpoint: 'https://runner.example.com/sessions',
      runnerSessionId: null,
      runnerCapabilitiesSnapshot: null,
      initialContextSnapshot: dto.initialContext,
    });
    expect(result).toEqual({
      id: createdSession.id,
      status: createdSession.status,
      providerCredentialId,
      credentialSnapshot: createdSession.credentialSnapshot,
      modelSnapshot: createdSession.modelSnapshot,
      permissionPreset: createdSession.permissionPreset,
      permissionPlanSnapshot: createdSession.permissionPlanSnapshot,
      approvalMode: createdSession.approvalMode,
      runnerEndpoint: createdSession.runnerEndpoint,
      runnerSessionId: createdSession.runnerSessionId,
      runnerCapabilitiesSnapshot: createdSession.runnerCapabilitiesSnapshot,
      initialContextSnapshot: createdSession.initialContextSnapshot,
      createdAt: createdSession.createdAt,
      updatedAt: createdSession.updatedAt,
      endedAt: createdSession.endedAt,
    });
    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('updateId');
  });

  it('custom session requires and stores a full custom permission plan', async () => {
    const auth = AuthFactory.create();
    const credential = makeCredential();
    const dto = makeCreateDto({
      providerCredentialId: credential.id,
      permissionPreset: AgentPermissionPreset.Custom,
      permissionPlan: localPowerUserPermissionPlan,
    });
    const createdSession = makeSession({
      userId: auth.user.id,
      providerCredentialId: credential.id,
      permissionPreset: AgentPermissionPreset.Custom,
      permissionPlanSnapshot: localPowerUserPermissionPlan,
    });

    credentialService.getById.mockResolvedValue(credential);
    repository.create.mockResolvedValue(createdSession);

    await sut.create(auth, dto);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionPreset: AgentPermissionPreset.Custom,
        permissionPlanSnapshot: localPowerUserPermissionPlan,
      }),
    );
  });

  it('rejects custom session without permissionPlan before credential lookup/repo create', async () => {
    const auth = AuthFactory.create();

    await expect(
      sut.create(auth, makeCreateDto({ permissionPreset: AgentPermissionPreset.Custom }) as AgentSessionCreateDto),
    ).rejects.toThrow('permissionPlan is required when permissionPreset is custom');

    expect(credentialService.getById).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects non-custom session with permissionPlan before credential lookup/repo create', async () => {
    const auth = AuthFactory.create();

    await expect(
      sut.create(
        auth,
        makeCreateDto({
          permissionPreset: AgentPermissionPreset.Careful,
          permissionPlan: localPowerUserPermissionPlan,
        }),
      ),
    ).rejects.toThrow('permissionPlan is only accepted when permissionPreset is custom');

    expect(credentialService.getById).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('defaults runnerEndpoint to null, runnerCapabilitiesSnapshot to null, initialContextSnapshot to {}', async () => {
    const auth = AuthFactory.create();
    const credential = makeCredential();
    const createdSession = makeSession({
      userId: auth.user.id,
      providerCredentialId: credential.id,
      runnerEndpoint: null,
      runnerSessionId: null,
      runnerCapabilitiesSnapshot: null,
      initialContextSnapshot: {},
    });

    credentialService.getById.mockResolvedValue(credential);
    repository.create.mockResolvedValue(createdSession);

    await sut.create(auth, makeCreateDto({ providerCredentialId: credential.id }));

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runnerEndpoint: null,
        runnerCapabilitiesSnapshot: null,
        initialContextSnapshot: {},
      }),
    );
  });

  it('does not create when credential lookup fails', async () => {
    const auth = AuthFactory.create();
    const error = new BadRequestException('Agent provider credential not found');

    credentialService.getById.mockRejectedValue(error);

    await expect(sut.create(auth, makeCreateDto())).rejects.toBe(error);

    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects selected model not listed on credential when credential.models has constraints', async () => {
    const auth = AuthFactory.create();
    const credential = makeCredential({ models: ['gpt-5.1-mini'] });

    credentialService.getById.mockResolvedValue(credential);

    await expect(
      sut.create(auth, makeCreateDto({ providerCredentialId: credential.id, model: 'gpt-5.1' })),
    ).rejects.toThrow('Model is not listed for the selected credential');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('allows any model when credential.models is empty', async () => {
    const auth = AuthFactory.create();
    const credential = makeCredential({ models: [] });
    const createdSession = makeSession({
      userId: auth.user.id,
      providerCredentialId: credential.id,
      modelSnapshot: { providerCredentialId: credential.id, model: 'custom-model' },
    });

    credentialService.getById.mockResolvedValue(credential);
    repository.create.mockResolvedValue(createdSession);

    await sut.create(auth, makeCreateDto({ providerCredentialId: credential.id, model: 'custom-model' }));

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        modelSnapshot: { providerCredentialId: credential.id, model: 'custom-model' },
      }),
    );
  });

  it('lists sessions for authenticated user without re-reading credentials', async () => {
    const auth = AuthFactory.create();
    const sessions = [makeSession({ userId: auth.user.id }), makeSession({ userId: auth.user.id })];

    repository.getByUserId.mockResolvedValue(sessions);

    const result = await sut.getAll(auth);

    expect(repository.getByUserId).toHaveBeenCalledWith(auth.user.id);
    expect(credentialService.getById).not.toHaveBeenCalled();
    expect(result).toEqual(sessions.map(({ userId, updateId, ...session }) => session));
  });

  it('gets owned session preserving stored snapshots without consulting current credential metadata', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      credentialSnapshot: {
        id: newUuid(),
        providerType: AgentProviderType.OpenAICompatible,
        label: 'Archived gateway label',
        baseUrl: 'https://old-gateway.example.com/v1',
        models: ['archived-model'],
        defaultModel: 'archived-model',
      },
      permissionPlanSnapshot: localPowerUserPermissionPlan,
      initialContextSnapshot: { originalPrompt: 'organize favorites' },
    });

    repository.getById.mockResolvedValue(session);

    const result = await sut.getById(auth, session.id);

    expect(repository.getById).toHaveBeenCalledWith(auth.user.id, session.id);
    expect(credentialService.getById).not.toHaveBeenCalled();
    expect(result.credentialSnapshot).toEqual(session.credentialSnapshot);
    expect(result.permissionPlanSnapshot).toEqual(localPowerUserPermissionPlan);
    expect(result.initialContextSnapshot).toEqual({ originalPrompt: 'organize favorites' });
  });

  it("throws BadRequestException('Agent session not found') for missing session", async () => {
    const auth = AuthFactory.create();
    const id = newUuid();

    repository.getById.mockResolvedValue(void 0);

    await expect(sut.getById(auth, id)).rejects.toThrow(BadRequestException);
    await expect(sut.getById(auth, id)).rejects.toThrow('Agent session not found');
  });

  it.each([
    AgentSessionStatus.Created,
    AgentSessionStatus.Running,
    AgentSessionStatus.WaitingForToolApproval,
    AgentSessionStatus.WaitingForPlanReview,
    AgentSessionStatus.Interrupted,
  ])('cancels active %s sessions and sets endedAt', async (status) => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status });
    const cancelled = makeSession({ ...session, status: AgentSessionStatus.Cancelled, endedAt: now });

    repository.getById.mockResolvedValue(session);
    repository.cancel.mockResolvedValue(cancelled);

    const result = await sut.cancel(auth, session.id);

    expect(repository.cancel).toHaveBeenCalledWith(auth.user.id, session.id, expect.any(Date));
    expect(repository.update).not.toHaveBeenCalled();
    expect(result.status).toBe(AgentSessionStatus.Cancelled);
    expect(result.endedAt).toEqual(now);
  });

  it('returns cancelled session when a concurrent duplicate cancel wins the update race', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.Running });
    const cancelled = makeSession({ ...session, status: AgentSessionStatus.Cancelled, endedAt: now });

    repository.getById.mockResolvedValueOnce(session).mockResolvedValueOnce(cancelled);
    repository.cancel.mockResolvedValue(void 0);

    const result = await sut.cancel(auth, session.id);

    expect(repository.cancel).toHaveBeenCalledWith(auth.user.id, session.id, expect.any(Date));
    expect(repository.getById).toHaveBeenCalledTimes(2);
    expect(repository.update).not.toHaveBeenCalled();
    expect(result.status).toBe(AgentSessionStatus.Cancelled);
    expect(result.endedAt).toEqual(now);
  });

  it.each([AgentSessionStatus.Applying, AgentSessionStatus.Completed, AgentSessionStatus.Failed])(
    'rejects cancelling when the conditional update loses a race to %s',
    async (status) => {
      const auth = AuthFactory.create();
      const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.Running });
      const terminalSession = makeSession({ ...session, status });

      repository.getById.mockResolvedValueOnce(session).mockResolvedValueOnce(terminalSession);
      repository.cancel.mockResolvedValue(void 0);

      await expect(sut.cancel(auth, session.id)).rejects.toThrow(
        'Agent session cannot be cancelled in its current state',
      );
      expect(repository.cancel).toHaveBeenCalledWith(auth.user.id, session.id, expect.any(Date));
      expect(repository.getById).toHaveBeenCalledTimes(2);
      expect(repository.update).not.toHaveBeenCalled();
    },
  );

  it('returns already-cancelled session without updating again', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.Cancelled, endedAt: now });

    repository.getById.mockResolvedValue(session);

    const result = await sut.cancel(auth, session.id);

    expect(repository.cancel).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
    expect(result.status).toBe(AgentSessionStatus.Cancelled);
    expect(result.endedAt).toEqual(now);
  });

  it.each([AgentSessionStatus.Applying, AgentSessionStatus.Completed, AgentSessionStatus.Failed])(
    'rejects cancelling %s with current-state error',
    async (status) => {
      const auth = AuthFactory.create();
      const session = makeSession({ userId: auth.user.id, status });

      repository.getById.mockResolvedValue(session);

      await expect(sut.cancel(auth, session.id)).rejects.toThrow(
        'Agent session cannot be cancelled in its current state',
      );
      expect(repository.cancel).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
    },
  );
});
