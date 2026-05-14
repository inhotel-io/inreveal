import { BadRequestException, Injectable } from '@nestjs/common';
import { AgentSession } from 'src/database';
import { AgentSessionCreateDto, AgentSessionResponseDto } from 'src/dtos/agent-session.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { AgentPermissionPreset, AgentSessionStatus } from 'src/enum';
import { AgentSessionRepository } from 'src/repositories/agent-session.repository';
import { AgentProviderCredentialService } from 'src/services/agent-provider-credential.service';
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
        maxOriginalsPerToolCall: 0,
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
        maxOriginalsPerToolCall: 0,
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
        maxOriginalsPerToolCall: 25,
        expiresInMinutes: 120,
      },
    },
  };

  constructor(
    private readonly repository: AgentSessionRepository,
    private readonly credentialService: AgentProviderCredentialService,
  ) {}

  async create(auth: AuthDto, dto: AgentSessionCreateDto): Promise<AgentSessionResponseDto> {
    const permissionPlanSnapshot = this.resolvePermissionPlan(dto);
    const credential = await this.credentialService.getById(auth, dto.providerCredentialId);

    if (credential.models.length > 0 && !credential.models.includes(dto.model)) {
      throw new BadRequestException('Model is not listed for the selected credential');
    }

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
      providerCredentialId: dto.providerCredentialId,
      credentialSnapshot,
      modelSnapshot: {
        providerCredentialId: dto.providerCredentialId,
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

    return this.map(session);
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

    const updated = await this.repository.update(auth.user.id, id, {
      status: AgentSessionStatus.Cancelled,
      endedAt: new Date(),
    });

    return this.map(updated);
  }

  private resolvePermissionPlan(dto: AgentSessionCreateDto): AgentPermissionPlanSnapshot {
    if (dto.permissionPreset === AgentPermissionPreset.Custom) {
      if (!dto.permissionPlan) {
        throw new BadRequestException('permissionPlan is required when permissionPreset is custom');
      }

      return dto.permissionPlan;
    }

    return AgentSessionService.permissionPresets[dto.permissionPreset];
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
