import { Injectable } from '@nestjs/common';
import { Insertable, Kysely, sql, Updateable } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { columns } from 'src/database';
import { DummyValue, GenerateSql } from 'src/decorators';
import { AgentToolCallStatus } from 'src/enum';
import { DB } from 'src/schema';
import { AgentToolCallTable } from 'src/schema/tables/agent-tool-call.table';
import { asUuid } from 'src/utils/database';

type AgentToolCallUpdate = Pick<
  Updateable<AgentToolCallTable>,
  | 'status'
  | 'approvalDecision'
  | 'responseSummary'
  | 'redactedResponseMetadata'
  | 'completedAt'
  | 'error'
>;

@Injectable()
export class AgentToolCallRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  create(dto: Insertable<AgentToolCallTable>) {
    return this.db.insertInto('agent_tool_call').values(dto).returning(columns.agentToolCall).executeTakeFirstOrThrow();
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

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID] })
  async getCountedAssetCountBySession(sessionId: string, excludedToolCallId?: string): Promise<number> {
    const result = await this.db
      .selectFrom('agent_tool_call')
      .select((eb) => sql<number>`coalesce(sum(${eb.ref('assetCount')}), 0)::int`.as('assetCount'))
      .where('sessionId', '=', asUuid(sessionId))
      .where('status', 'in', [
        AgentToolCallStatus.PendingApproval,
        AgentToolCallStatus.Approved,
        AgentToolCallStatus.Executing,
        AgentToolCallStatus.Completed,
      ])
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
