import { Body, Controller, Headers, Param, Post, UnauthorizedException } from '@nestjs/common';
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
import { AgentRunnerToolTokenService } from 'src/services/agent-runner-tool-token.service';
import { AgentToolService } from 'src/services/agent-tool.service';
import { UUIDParamDto } from 'src/validation';

const history = () => new HistoryBuilder().added('v2.7.5').internal('v2.7.5');

@ApiTags(ApiTag.AgentSessions)
@Controller('agent/internal/tools/sessions/:id')
export class AgentRunnerToolController {
  constructor(
    private readonly tokenService: AgentRunnerToolTokenService,
    private readonly service: AgentToolService,
  ) {}

  @Post('search-assets')
  @Endpoint({
    summary: 'Execute the runner searchAssets agent tool',
    description: 'Internal runner gateway for executing an asset search tool call for an AI agent session.',
    history: history(),
  })
  runnerSearchAssets(
    @Param() { id }: UUIDParamDto,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: AgentSearchAssetsToolRequestDto,
  ): Promise<AgentSearchAssetsToolResponseDto> {
    return this.service.searchAssets(this.authFromRequest(id, authorization), id, dto);
  }

  @Post('read-asset-metadata')
  @Endpoint({
    summary: 'Execute the runner readAssetMetadata agent tool',
    description: 'Internal runner gateway for executing a metadata read tool call for an AI agent session.',
    history: history(),
  })
  runnerReadAssetMetadata(
    @Param() { id }: UUIDParamDto,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: AgentReadAssetMetadataToolRequestDto,
  ): Promise<AgentReadAssetMetadataToolResponseDto> {
    return this.service.readAssetMetadata(this.authFromRequest(id, authorization), id, dto);
  }

  @Post('read-asset-previews')
  @Endpoint({
    summary: 'Execute the runner readAssetPreviews agent tool',
    description: 'Internal runner gateway for executing a preview read tool call for an AI agent session.',
    history: history(),
  })
  runnerReadAssetPreviews(
    @Param() { id }: UUIDParamDto,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: AgentReadAssetPreviewsToolRequestDto,
  ): Promise<AgentReadAssetPreviewsToolResponseDto> {
    return this.service.readAssetPreviews(this.authFromRequest(id, authorization), id, dto);
  }

  @Post('read-asset-originals')
  @Endpoint({
    summary: 'Execute the runner readAssetOriginals agent tool',
    description: 'Internal runner gateway for executing an original read tool call for an AI agent session.',
    history: history(),
  })
  runnerReadAssetOriginals(
    @Param() { id }: UUIDParamDto,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: AgentReadAssetOriginalsToolRequestDto,
  ): Promise<AgentReadAssetOriginalsToolResponseDto> {
    return this.service.readAssetOriginals(this.authFromRequest(id, authorization), id, dto);
  }

  @Post('list-albums')
  @Endpoint({
    summary: 'Execute the runner listAlbums agent tool',
    description: 'Internal runner gateway for executing an album list tool call for an AI agent session.',
    history: history(),
  })
  runnerListAlbums(
    @Param() { id }: UUIDParamDto,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: AgentListAlbumsToolRequestDto,
  ): Promise<AgentListAlbumsToolResponseDto> {
    return this.service.listAlbums(this.authFromRequest(id, authorization), id, dto);
  }

  @Post('read-album')
  @Endpoint({
    summary: 'Execute the runner readAlbum agent tool',
    description: 'Internal runner gateway for executing an album read tool call for an AI agent session.',
    history: history(),
  })
  runnerReadAlbum(
    @Param() { id }: UUIDParamDto,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: AgentReadAlbumToolRequestDto,
  ): Promise<AgentReadAlbumToolResponseDto> {
    return this.service.readAlbum(this.authFromRequest(id, authorization), id, dto);
  }

  private authFromRequest(sessionId: string, authorization: string | undefined): AuthDto {
    const token = this.getBearerToken(authorization);
    const claims = this.tokenService.verify(token);
    if (claims.sessionId !== sessionId) {
      throw new UnauthorizedException('Invalid agent runner tool token');
    }

    return { user: { id: claims.userId } } as AuthDto;
  }

  private getBearerToken(authorization: string | undefined) {
    if (!authorization) {
      throw new UnauthorizedException('Invalid agent runner tool token');
    }

    const [scheme, token, extra] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token || extra !== undefined) {
      throw new UnauthorizedException('Invalid agent runner tool token');
    }

    return token;
  }
}
