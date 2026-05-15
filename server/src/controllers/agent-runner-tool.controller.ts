import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Injectable,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import {
  AgentOperationPlanParamsDto,
  AgentOperationPlanSummaryRequestDto,
  AgentOperationPlanToolResponseDto,
  AgentProposeAlbumOperationsDto,
  AgentReviseAlbumOperationsDto,
} from 'src/dtos/agent-operation.dto';
import {
  AgentListAlbumsToolRequestDto,
  AgentListAlbumsToolResponseDto,
  AgentReadAlbumToolRequestDto,
  AgentReadAlbumToolResponseDto,
  AgentReadAssetMetadataToolRequestDto,
  AgentReadAssetMetadataToolResponseDto,
  AgentReadAssetOriginalsToolRequestDto,
  AgentReadAssetOriginalsToolResponseDto,
  AgentReadAssetPreviewsToolRequestDto,
  AgentReadAssetPreviewsToolResponseDto,
  AgentSearchAssetsToolRequestDto,
  AgentSearchAssetsToolResponseDto,
} from 'src/dtos/agent-tool.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { ApiTag } from 'src/enum';
import { Auth, AuthRequest } from 'src/middleware/auth.guard';
import { AgentOperationPlanService } from 'src/services/agent-operation-plan.service';
import { AgentRunnerToolTokenService } from 'src/services/agent-runner-tool-token.service';
import { AgentToolService } from 'src/services/agent-tool.service';
import { UUIDParamDto } from 'src/validation';

const history = () => new HistoryBuilder().added('v2.7.5').internal('v2.7.5');
const INVALID_TOKEN = 'Invalid agent runner tool token';

@Injectable()
export class AgentRunnerToolGuard implements CanActivate {
  constructor(private readonly tokenService: AgentRunnerToolTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = this.getBearerToken(request.headers.authorization);
    const claims = this.tokenService.verify(token);
    if (claims.sessionId !== request.params.id) {
      throw new UnauthorizedException(INVALID_TOKEN);
    }

    request.user = { user: { id: claims.userId } } as AuthDto;
    return true;
  }

  private getBearerToken(authorization: string | undefined) {
    if (!authorization) {
      throw new UnauthorizedException(INVALID_TOKEN);
    }

    const [scheme, token, extra] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token || extra !== undefined) {
      throw new UnauthorizedException(INVALID_TOKEN);
    }

    return token;
  }
}

@ApiTags(ApiTag.AgentSessions)
@Controller('agent/internal/tools/sessions/:id')
@UseGuards(AgentRunnerToolGuard)
export class AgentRunnerToolController {
  constructor(
    private readonly service: AgentToolService,
    private readonly operationPlanService: AgentOperationPlanService,
  ) {}

  @Post('search-assets')
  @ApiCreatedResponse({ type: AgentSearchAssetsToolResponseDto })
  @Endpoint({
    summary: 'Execute the runner searchAssets agent tool',
    description: 'Internal runner gateway for executing an asset search tool call for an AI agent session.',
    history: history(),
  })
  runnerSearchAssets(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: AgentSearchAssetsToolRequestDto,
  ): Promise<AgentSearchAssetsToolResponseDto> {
    return this.service.searchAssets(auth, id, dto);
  }

  @Post('read-asset-metadata')
  @ApiCreatedResponse({ type: AgentReadAssetMetadataToolResponseDto })
  @Endpoint({
    summary: 'Execute the runner readAssetMetadata agent tool',
    description: 'Internal runner gateway for executing a metadata read tool call for an AI agent session.',
    history: history(),
  })
  runnerReadAssetMetadata(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: AgentReadAssetMetadataToolRequestDto,
  ): Promise<AgentReadAssetMetadataToolResponseDto> {
    return this.service.readAssetMetadata(auth, id, dto);
  }

  @Post('read-asset-previews')
  @ApiCreatedResponse({ type: AgentReadAssetPreviewsToolResponseDto })
  @Endpoint({
    summary: 'Execute the runner readAssetPreviews agent tool',
    description: 'Internal runner gateway for executing a preview read tool call for an AI agent session.',
    history: history(),
  })
  runnerReadAssetPreviews(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: AgentReadAssetPreviewsToolRequestDto,
  ): Promise<AgentReadAssetPreviewsToolResponseDto> {
    return this.service.readAssetPreviews(auth, id, dto);
  }

  @Post('read-asset-originals')
  @ApiCreatedResponse({ type: AgentReadAssetOriginalsToolResponseDto })
  @Endpoint({
    summary: 'Execute the runner readAssetOriginals agent tool',
    description: 'Internal runner gateway for executing an original read tool call for an AI agent session.',
    history: history(),
  })
  runnerReadAssetOriginals(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: AgentReadAssetOriginalsToolRequestDto,
  ): Promise<AgentReadAssetOriginalsToolResponseDto> {
    return this.service.readAssetOriginals(auth, id, dto);
  }

  @Post('list-albums')
  @ApiCreatedResponse({ type: AgentListAlbumsToolResponseDto })
  @Endpoint({
    summary: 'Execute the runner listAlbums agent tool',
    description: 'Internal runner gateway for executing an album list tool call for an AI agent session.',
    history: history(),
  })
  runnerListAlbums(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: AgentListAlbumsToolRequestDto,
  ): Promise<AgentListAlbumsToolResponseDto> {
    return this.service.listAlbums(auth, id, dto);
  }

  @Post('read-album')
  @ApiCreatedResponse({ type: AgentReadAlbumToolResponseDto })
  @Endpoint({
    summary: 'Execute the runner readAlbum agent tool',
    description: 'Internal runner gateway for executing an album read tool call for an AI agent session.',
    history: history(),
  })
  runnerReadAlbum(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: AgentReadAlbumToolRequestDto,
  ): Promise<AgentReadAlbumToolResponseDto> {
    return this.service.readAlbum(auth, id, dto);
  }

  @Post('propose-album-operations')
  @ApiCreatedResponse({ type: AgentOperationPlanToolResponseDto })
  @Endpoint({
    summary: 'Execute the runner proposeAlbumOperations agent tool',
    description: 'Internal runner gateway for storing proposed album operations for an AI agent session.',
    history: history(),
  })
  runnerProposeAlbumOperations(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: AgentProposeAlbumOperationsDto,
  ): Promise<AgentOperationPlanToolResponseDto> {
    return this.operationPlanService.proposeAlbumOperations(auth, id, dto);
  }

  @Post('revise-proposed-operations/:planId')
  @ApiCreatedResponse({ type: AgentOperationPlanToolResponseDto })
  @Endpoint({
    summary: 'Execute the runner reviseProposedOperations agent tool',
    description: 'Internal runner gateway for replacing a proposed album operation plan revision.',
    history: history(),
  })
  runnerReviseProposedOperations(
    @Auth() auth: AuthDto,
    @Param() { id, planId }: AgentOperationPlanParamsDto,
    @Body() dto: AgentReviseAlbumOperationsDto,
  ): Promise<AgentOperationPlanToolResponseDto> {
    return this.operationPlanService.reviseProposedOperations(auth, id, planId, dto);
  }

  @Post('summarize-plan/:planId')
  @ApiCreatedResponse({ type: AgentOperationPlanToolResponseDto })
  @Endpoint({
    summary: 'Execute the runner summarizePlan agent tool',
    description: 'Internal runner gateway for summarizing a proposed album operation plan.',
    history: history(),
  })
  runnerSummarizePlan(
    @Auth() auth: AuthDto,
    @Param() { id, planId }: AgentOperationPlanParamsDto,
    @Body() dto: AgentOperationPlanSummaryRequestDto,
  ): Promise<AgentOperationPlanToolResponseDto> {
    return this.operationPlanService.summarizePlan(auth, id, planId, dto);
  }
}
