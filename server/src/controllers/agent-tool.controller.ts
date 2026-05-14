import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import {
  AgentReadAssetMetadataToolRequestDto,
  AgentReadAssetMetadataToolResponseDto,
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

  @Post('tools/read-asset-metadata')
  @Authenticated({ permission: Permission.AgentSessionUpdate })
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
