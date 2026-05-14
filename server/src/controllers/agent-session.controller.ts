import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { AgentSessionCreateDto, AgentSessionResponseDto } from 'src/dtos/agent-session.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { ApiTag, Permission } from 'src/enum';
import { Auth, Authenticated } from 'src/middleware/auth.guard';
import { AgentSessionService } from 'src/services/agent-session.service';
import { UUIDParamDto } from 'src/validation';

@ApiTags(ApiTag.AgentSessions)
@Controller('agent/sessions')
export class AgentSessionController {
  constructor(private readonly service: AgentSessionService) {}

  @Post()
  @Authenticated({ permission: Permission.AgentSessionCreate })
  @Endpoint({
    summary: 'Create an agent session',
    description:
      'Create a personal AI agent session with immutable credential, model, permission plan, and approval mode snapshots.',
    history: new HistoryBuilder().added('v2.7.5').alpha('v2.7.5'),
  })
  createAgentSession(
    @Auth() auth: AuthDto,
    @Body() dto: AgentSessionCreateDto,
  ): Promise<AgentSessionResponseDto> {
    return this.service.create(auth, dto);
  }

  @Get()
  @Authenticated({ permission: Permission.AgentSessionRead })
  @Endpoint({
    summary: 'List agent sessions',
    description: 'Retrieve all AI agent sessions owned by the current user.',
    history: new HistoryBuilder().added('v2.7.5').alpha('v2.7.5'),
  })
  getAgentSessions(@Auth() auth: AuthDto): Promise<AgentSessionResponseDto[]> {
    return this.service.getAll(auth);
  }

  @Get(':id')
  @Authenticated({ permission: Permission.AgentSessionRead })
  @Endpoint({
    summary: 'Retrieve an agent session',
    description: 'Retrieve an AI agent session by ID. The current user must own this session.',
    history: new HistoryBuilder().added('v2.7.5').alpha('v2.7.5'),
  })
  getAgentSession(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<AgentSessionResponseDto> {
    return this.service.getById(auth, id);
  }

  @Post(':id/cancel')
  @Authenticated({ permission: Permission.AgentSessionUpdate })
  @Endpoint({
    summary: 'Cancel an agent session',
    description: 'Cancel an active AI agent session owned by the current user.',
    history: new HistoryBuilder().added('v2.7.5').alpha('v2.7.5'),
  })
  cancelAgentSession(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<AgentSessionResponseDto> {
    return this.service.cancel(auth, id);
  }
}
