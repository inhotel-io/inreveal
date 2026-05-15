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
import { ApiTags } from '@nestjs/swagger';
import { Endpoint, HistoryBuilder } from 'src/decorators';
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
  constructor(private readonly service: AgentToolService) {}

  @Post('search-assets')
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
}
