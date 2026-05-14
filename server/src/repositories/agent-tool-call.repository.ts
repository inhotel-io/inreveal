import { Injectable } from '@nestjs/common';
import { Insertable, Kysely, sql, Updateable } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { columns } from 'src/database';
import { DummyValue, GenerateSql } from 'src/decorators';
import { AgentToolCallStatus } from 'src/enum';
import { DB } from 'src/schema';
import { AgentToolCallTable } from 'src/schema/tables/agent-tool-call.table';
import { asUuid } from 'src/utils/database';

type AgentToolCallCreate = Insertable<AgentToolCallTable>;
type AgentToolCallUpdate = Pick<
  Updateable<AgentToolCallTable>,
  'status' | 'approvalDecision' | 'responseSummary' | 'redactedResponseMetadata' | 'completedAt' | 'error'
>;

@Injectable()
export class AgentToolCallRepository {
  private static readonly countedStatuses = [
    AgentToolCallStatus.PendingApproval,
    AgentToolCallStatus.Approved,
    AgentToolCallStatus.Executing,
    AgentToolCallStatus.Completed,
  ];

  constructor(@InjectKysely() private db: Kysely<DB>) {}

  create(dto: Insertable<AgentToolCallTable>) {
    return this.db.insertInto('agent_tool_call').values(dto).returning(columns.agentToolCall).executeTakeFirstOrThrow();
  }

  async createPendingReadAssetMetadataWithSessionLimit(
    pendingDto: AgentToolCallCreate,
    deniedDto: AgentToolCallCreate,
    maxAssetsPerSession: number,
  ) {
    return this.db.transaction().execute(async (trx) => {
      await trx
        .selectFrom('agent_session')
        .select('id')
        .where('id', '=', asUuid(pendingDto.sessionId))
        .forUpdate()
        .executeTakeFirstOrThrow();

      const result = await trx
        .selectFrom('agent_tool_call')
        .select((eb) => sql<number>`coalesce(sum(${eb.ref('assetCount')}), 0)::int`.as('assetCount'))
        .where('sessionId', '=', asUuid(pendingDto.sessionId))
        .where('status', 'in', AgentToolCallRepository.countedStatuses)
        .executeTakeFirstOrThrow();

      const dto = result.assetCount + Number(pendingDto.assetCount) > maxAssetsPerSession ? deniedDto : pendingDto;
      const toolCall = await trx
        .insertInto('agent_tool_call')
        .values(dto)
        .returning(columns.agentToolCall)
        .executeTakeFirstOrThrow();

      return dto === deniedDto ? ({ status: 'limit-exceeded', toolCall } as const) : ({ status: 'created', toolCall } as const);
    });
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  getBySessionId(sessionId: string) {
    return this.db
      .selectFrom('agent_tool_call')
      .select(columns.agentToolCall)
      .where('sessionId', '=', asUuid(sessionId))
      .orderBy('startedAt', 'desc')
      .orderBy('id', 'desc')
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID] })
  getByIdForSession(sessionId: string, id: string) {
    return this.db
      .selectFrom('agent_tool_call')
      .select(columns.agentToolCall)
      .where('sessionId', '=', asUuid(sessionId))
      .where('id', '=', asUuid(id))
      .executeTakeFirst();
  }

  @GenerateSql(
    { name: 'including all', params: [DummyValue.UUID] },
    { name: 'excluding tool call', params: [DummyValue.UUID, DummyValue.UUID] },
  )
  async getCountedAssetCountBySession(sessionId: string, excludedToolCallId?: string): Promise<number> {
    const result = await this.db
      .selectFrom('agent_tool_call')
      .select((eb) => sql<number>`coalesce(sum(${eb.ref('assetCount')}), 0)::int`.as('assetCount'))
      .where('sessionId', '=', asUuid(sessionId))
      .where('status', 'in', AgentToolCallRepository.countedStatuses)
      .$if(Boolean(excludedToolCallId), (qb) => qb.where('id', '!=', asUuid(excludedToolCallId!)))
      .executeTakeFirstOrThrow();

    return result.assetCount;
  }

  transition(sessionId: string, id: string, expectedStatus: AgentToolCallStatus, dto: AgentToolCallUpdate) {
    return this.db
      .updateTable('agent_tool_call')
      .set(dto)
      .where('sessionId', '=', asUuid(sessionId))
      .where('id', '=', asUuid(id))
      .where('status', '=', expectedStatus)
      .returning(columns.agentToolCall)
      .executeTakeFirst();
  }
}
