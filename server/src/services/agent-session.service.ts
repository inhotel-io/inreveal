import { BadRequestException, Injectable } from '@nestjs/common';
import { AgentSession } from 'src/database';
import { AgentSessionCreateDto, AgentSessionResponseDto } from 'src/dtos/agent-session.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { AgentPermissionPreset, AgentSessionStatus } from 'src/enum';
import { AgentSessionRepository } from 'src/repositories/agent-session.repository';
import { AgentProviderCredentialService } from 'src/services/agent-provider-credential.service';
import { AgentRunnerService } from 'src/services/agent-runner.service';
import {
  AgentCredentialSnapshot,
  AgentPermissionPlanSnapshot,
  AgentPermissionPresetMap,
} from 'src/types/agent-session.types';

@Injectable()
export class AgentSessionService {
  static readonly permissionPresets: AgentPermissionPresetMap = {
    [AgentPermissionPreset.Careful]: {
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
        maxPreviewsPerSession: 0,
        maxOriginalsPerToolCall: 0,
        maxOriginalsPerSession: 0,
        expiresInMinutes: 120,
      },
    },
    [AgentPermissionPreset.VisualOrganizer]: {
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
        maxPreviewsPerSession: 500,
        maxOriginalsPerToolCall: 0,
        maxOriginalsPerSession: 0,
        expiresInMinutes: 120,
      },
    },
    [AgentPermissionPreset.LocalPowerUser]: {
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
        maxPreviewsPerSession: 500,
        maxOriginalsPerToolCall: 25,
        maxOriginalsPerSession: 50,
        expiresInMinutes: 120,
      },
    },
  };

  constructor(
    private readonly repository: AgentSessionRepository,
    private readonly credentialService: AgentProviderCredentialService,
    private readonly agentRunnerService: AgentRunnerService,
  ) {}

  async create(auth: AuthDto, dto: AgentSessionCreateDto): Promise<AgentSessionResponseDto> {
    const permissionPlanSnapshot = this.resolvePermissionPlan(dto);
    const credential = await this.credentialService.getById(auth, dto.providerCredentialId);

    if (credential.models.length > 0 && !credential.models.includes(dto.model)) {
      throw new BadRequestException('Model is not listed for the selected credential');
    }

    const credentialSecret = await this.credentialService.getSecret(auth, dto.providerCredentialId);

    const credentialSnapshot: AgentCredentialSnapshot = {
      id: credential.id,
      providerType: credential.providerType,
      label: credential.label,
      baseUrl: credential.baseUrl,
      models: credential.models,
      defaultModel: credential.defaultModel,
    };

    const session = await this.repository.create({
      userId: auth.user.id,
      providerCredentialId: credential.id,
      credentialSnapshot,
      modelSnapshot: {
        providerCredentialId: credential.id,
        model: dto.model,
      },
      permissionPreset: dto.permissionPreset,
      permissionPlanSnapshot,
      approvalMode: dto.approvalMode,
      runnerEndpoint: dto.runnerEndpoint ?? null,
      runnerSessionId: null,
      runnerCapabilitiesSnapshot: null,
      status: AgentSessionStatus.Created,
      initialContextSnapshot: dto.initialContext ?? {},
    });

    let runnerSession: Awaited<ReturnType<AgentRunnerService['createSession']>>;
    try {
      runnerSession = await this.agentRunnerService.createSession({
        gallerySessionId: session.id,
        credential: { ...session.credentialSnapshot, secret: credentialSecret },
        model: session.modelSnapshot.model,
        permissionPreset: session.permissionPreset,
        permissionPlan: session.permissionPlanSnapshot,
        approvalMode: session.approvalMode,
        initialContext: session.initialContextSnapshot,
      });
    } catch (error) {
      try {
        await this.repository.markFailedFromCreated(auth.user.id, session.id, new Date());
      } catch {
        // Preserve the runner start error; failed-state marking is best-effort diagnostics.
      }
      throw error;
    }

    const runningSession = await this.repository.markRunningFromCreated(auth.user.id, session.id, {
      status: AgentSessionStatus.Running,
      runnerEndpoint: runnerSession.runnerEndpoint,
      runnerSessionId: runnerSession.runnerSessionId,
      runnerCapabilitiesSnapshot: runnerSession.runnerCapabilitiesSnapshot,
    });

    if (!runningSession) {
      const current = await this.repository.getById(auth.user.id, session.id);
      if (current) {
        return this.map(current);
      }

      throw new BadRequestException('Agent session not found');
    }

    return this.map(runningSession);
  }

  async getAll(auth: AuthDto): Promise<AgentSessionResponseDto[]> {
    const sessions = await this.repository.getByUserId(auth.user.id);
    return sessions.map((session) => this.map(session));
  }

  async getById(auth: AuthDto, id: string): Promise<AgentSessionResponseDto> {
    const session = await this.getOwned(auth, id);
    return this.map(session);
  }

  async cancel(auth: AuthDto, id: string): Promise<AgentSessionResponseDto> {
    const session = await this.getOwned(auth, id);

    if (session.status === AgentSessionStatus.Cancelled) {
      return this.map(session);
    }

    if (
      session.status === AgentSessionStatus.Applying ||
      session.status === AgentSessionStatus.Completed ||
      session.status === AgentSessionStatus.Failed
    ) {
      throw new BadRequestException('Agent session cannot be cancelled in its current state');
    }

    const updated = await this.repository.cancel(auth.user.id, id, new Date());

    if (!updated) {
      const current = await this.repository.getById(auth.user.id, id);
      if (current?.status === AgentSessionStatus.Cancelled) {
        return this.map(current);
      }

      throw new BadRequestException('Agent session cannot be cancelled in its current state');
    }

    return this.map(updated);
  }

  private resolvePermissionPlan(dto: AgentSessionCreateDto): AgentPermissionPlanSnapshot {
    if (dto.permissionPreset === AgentPermissionPreset.Custom) {
      if (!dto.permissionPlan) {
        throw new BadRequestException('permissionPlan is required when permissionPreset is custom');
      }

      return this.backfillPermissionPlan(structuredClone(dto.permissionPlan));
    }

    if (dto.permissionPlan) {
      throw new BadRequestException('permissionPlan is only accepted when permissionPreset is custom');
    }

    return structuredClone(AgentSessionService.permissionPresets[dto.permissionPreset]);
  }

  private backfillPermissionPlan(permissionPlan: AgentPermissionPlanSnapshot): AgentPermissionPlanSnapshot {
    return {
      ...permissionPlan,
      limits: {
        ...permissionPlan.limits,
        maxPreviewsPerSession:
          permissionPlan.limits.maxPreviewsPerSession ?? permissionPlan.limits.maxPreviewsPerToolCall,
        maxOriginalsPerSession:
          permissionPlan.limits.maxOriginalsPerSession ?? permissionPlan.limits.maxOriginalsPerToolCall,
      },
    };
  }

  private async getOwned(auth: AuthDto, id: string) {
    const session = await this.repository.getById(auth.user.id, id);
    if (!session) {
      throw new BadRequestException('Agent session not found');
    }

    return session;
  }

  private map(session: AgentSession): AgentSessionResponseDto {
    return {
      id: session.id,
      status: session.status,
      providerCredentialId: session.providerCredentialId,
      credentialSnapshot: session.credentialSnapshot,
      modelSnapshot: session.modelSnapshot,
      permissionPreset: session.permissionPreset,
      permissionPlanSnapshot: session.permissionPlanSnapshot,
      approvalMode: session.approvalMode,
      runnerEndpoint: session.runnerEndpoint,
      runnerSessionId: session.runnerSessionId,
      runnerCapabilitiesSnapshot: session.runnerCapabilitiesSnapshot,
      initialContextSnapshot: session.initialContextSnapshot,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      endedAt: session.endedAt,
    };
  }
}
