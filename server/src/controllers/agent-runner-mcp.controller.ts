import { Body, Controller, HttpCode, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import { ApiAcceptedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AgentRunnerToolGuard } from 'src/controllers/agent-runner-tool.controller';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { ApiTag } from 'src/enum';
import { AgentMcpService } from 'src/services/agent-mcp.service';
import type { AgentMcpHandleResponse } from 'src/types/agent-mcp.types';

const history = () => new HistoryBuilder().added('v2.7.5').internal('v2.7.5');

@ApiTags(ApiTag.AgentSessions)
@Controller('agent/internal/mcp/sessions/:id')
@UseGuards(AgentRunnerToolGuard)
export class AgentRunnerMcpController {
  constructor(private readonly service: AgentMcpService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'MCP JSON-RPC response' })
  @ApiAcceptedResponse({ description: 'MCP notification accepted' })
  @Endpoint({
    summary: 'Handle the internal runner MCP endpoint',
    description: 'Internal runner MCP endpoint for a first-party Pi agent session.',
    history: history(),
  })
  handle(@Body() body: unknown, @Res({ passthrough: true }) response: Response): AgentMcpHandleResponse {
    const result = this.service.handle(body);
    if (result === undefined) {
      response.status(HttpStatus.ACCEPTED);
    }

    return result;
  }
}
