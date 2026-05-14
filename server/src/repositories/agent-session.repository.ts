import { Injectable } from '@nestjs/common';
import { Insertable, Kysely, Updateable } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { columns } from 'src/database';
import { DummyValue, GenerateSql } from 'src/decorators';
import { AgentSessionStatus } from 'src/enum';
import { DB } from 'src/schema';
import { AgentSessionTable } from 'src/schema/tables/agent-session.table';
import { asUuid } from 'src/utils/database';

type AgentSessionUpdate = Pick<
  Updateable<AgentSessionTable>,
  'status' | 'endedAt' | 'runnerEndpoint' | 'runnerSessionId' | 'runnerCapabilitiesSnapshot'
>;

@Injectable()
export class AgentSessionRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  create(dto: Insertable<AgentSessionTable>) {
    return this.db.insertInto('agent_session').values(dto).returning(columns.agentSession).executeTakeFirstOrThrow();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  getByUserId(userId: string) {
    return this.db
      .selectFrom('agent_session')
      .select(columns.agentSession)
      .where('userId', '=', userId)
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID] })
  getById(userId: string, id: string) {
    return this.db
      .selectFrom('agent_session')
      .select(columns.agentSession)
      .where('userId', '=', userId)
      .where('id', '=', asUuid(id))
      .executeTakeFirst();
  }

  update(userId: string, id: string, dto: AgentSessionUpdate) {
    return this.db
      .updateTable('agent_session')
      .set(dto)
      .where('userId', '=', userId)
      .where('id', '=', asUuid(id))
      .returning(columns.agentSession)
      .executeTakeFirstOrThrow();
  }

  @GenerateSql({
    params: [
      DummyValue.UUID,
      DummyValue.UUID,
      [
        AgentSessionStatus.Created,
        AgentSessionStatus.Running,
        AgentSessionStatus.WaitingForToolApproval,
        AgentSessionStatus.WaitingForPlanReview,
        AgentSessionStatus.Interrupted,
      ],
      DummyValue.DATE,
    ],
  })
  cancel(userId: string, id: string, cancellableStatuses: AgentSessionStatus[], endedAt: Date) {
    return this.db
      .updateTable('agent_session')
      .set({ status: AgentSessionStatus.Cancelled, endedAt })
      .where('userId', '=', userId)
      .where('id', '=', asUuid(id))
      .where('status', 'in', cancellableStatuses)
      .returning(columns.agentSession)
      .executeTakeFirst();
  }
}
