import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
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
  AgentToolApprovalDto,
  AgentToolCallParamsDto,
  AgentToolCallResponseDto,
} from 'src/dtos/agent-tool.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { ApiTag, Permission } from 'src/enum';
import { Auth, Authenticated } from 'src/middleware/auth.guard';
import { AgentToolService } from 'src/services/agent-tool.service';
import { UUIDParamDto } from 'src/validation';

@ApiTags(ApiTag.AgentSessions)
@Controller('agent/sessions/:id')
export class AgentToolController {
  constructor(private readonly service: AgentToolService) {}

  @Post('tools/search-assets')
  @Authenticated({ permission: Permission.AgentSessionUpdate })
  @ApiCreatedResponse({ type: AgentSearchAssetsToolResponseDto })
  @Endpoint({
    summary: 'Execute the internal searchAssets agent tool',
    description:
      'Internal route for requesting or resuming a strict-approved asset search tool call for an AI agent session.',
    history: new HistoryBuilder().added('v2.7.5').internal('v2.7.5'),
  })
  executeAgentSearchAssets(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: AgentSearchAssetsToolRequestDto,
  ): Promise<AgentSearchAssetsToolResponseDto> {
    return this.service.searchAssets(auth, id, dto);
  }

  @Post('tools/read-asset-metadata')
  @Authenticated({ permission: Permission.AgentSessionUpdate })
  @ApiCreatedResponse({ type: AgentReadAssetMetadataToolResponseDto })
  @Endpoint({
    summary: 'Execute the internal readAssetMetadata agent tool',
    description:
      'Internal route for requesting or resuming a strict-approved metadata read tool call for an AI agent session.',
    history: new HistoryBuilder().added('v2.7.5').internal('v2.7.5'),
  })
  readAssetMetadata(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: AgentReadAssetMetadataToolRequestDto,
  ): Promise<AgentReadAssetMetadataToolResponseDto> {
    return this.service.readAssetMetadata(auth, id, dto);
  }

  @Post('tools/read-asset-previews')
  @Authenticated({ permission: Permission.AgentSessionUpdate })
  @ApiCreatedResponse({ type: AgentReadAssetPreviewsToolResponseDto })
  @Endpoint({
    summary: 'Execute the internal readAssetPreviews agent tool',
    description:
      'Internal route for requesting or resuming a strict-approved preview read tool call for an AI agent session.',
    history: new HistoryBuilder().added('v2.7.5').internal('v2.7.5'),
  })
  readAssetPreviews(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: AgentReadAssetPreviewsToolRequestDto,
  ): Promise<AgentReadAssetPreviewsToolResponseDto> {
    return this.service.readAssetPreviews(auth, id, dto);
  }

  @Post('tools/read-asset-originals')
  @Authenticated({ permission: Permission.AgentSessionUpdate })
  @ApiCreatedResponse({ type: AgentReadAssetOriginalsToolResponseDto })
  @Endpoint({
    summary: 'Execute the internal readAssetOriginals agent tool',
    description:
      'Internal route for requesting or resuming a strict-approved original read tool call for an AI agent session.',
    history: new HistoryBuilder().added('v2.7.5').internal('v2.7.5'),
  })
  readAssetOriginals(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: AgentReadAssetOriginalsToolRequestDto,
  ): Promise<AgentReadAssetOriginalsToolResponseDto> {
    return this.service.readAssetOriginals(auth, id, dto);
  }

  @Post('tools/list-albums')
  @Authenticated({ permission: Permission.AgentSessionUpdate })
  @ApiCreatedResponse({ type: AgentListAlbumsToolResponseDto })
  @Endpoint({
    summary: 'Execute the internal listAlbums agent tool',
    description:
      'Internal route for requesting or resuming a strict-approved album list tool call for an AI agent session.',
    history: new HistoryBuilder().added('v2.7.5').internal('v2.7.5'),
  })
  listAlbums(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: AgentListAlbumsToolRequestDto,
  ): Promise<AgentListAlbumsToolResponseDto> {
    return this.service.listAlbums(auth, id, dto);
  }

  @Post('tools/read-album')
  @Authenticated({ permission: Permission.AgentSessionUpdate })
  @ApiCreatedResponse({ type: AgentReadAlbumToolResponseDto })
  @Endpoint({
    summary: 'Execute the internal readAlbum agent tool',
    description:
      'Internal route for requesting or resuming a strict-approved album read tool call for an AI agent session.',
    history: new HistoryBuilder().added('v2.7.5').internal('v2.7.5'),
  })
  readAlbum(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: AgentReadAlbumToolRequestDto,
  ): Promise<AgentReadAlbumToolResponseDto> {
    return this.service.readAlbum(auth, id, dto);
  }

  @Get('tool-calls')
  @Authenticated({ permission: Permission.AgentSessionRead })
  @Endpoint({
    summary: 'List agent tool calls',
    description: 'List audited internal tool calls for an AI agent session owned by the current user.',
    history: new HistoryBuilder().added('v2.7.5').alpha('v2.7.5'),
  })
  getToolCalls(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<AgentToolCallResponseDto[]> {
    return this.service.getToolCalls(auth, id);
  }

  @Post('tool-calls/:toolCallId/approval')
  @Authenticated({ permission: Permission.AgentSessionUpdate })
  @Endpoint({
    summary: 'Approve or deny an agent tool call',
    description: 'Record an explicit user approval decision for a pending internal agent tool call.',
    history: new HistoryBuilder().added('v2.7.5').alpha('v2.7.5'),
  })
  approveToolCall(
    @Auth() auth: AuthDto,
    @Param() { id, toolCallId }: AgentToolCallParamsDto,
    @Body() dto: AgentToolApprovalDto,
  ): Promise<AgentToolCallResponseDto> {
    return this.service.approveToolCall(auth, id, toolCallId, dto);
  }
}
