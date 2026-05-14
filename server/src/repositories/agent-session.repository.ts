import { Injectable } from '@nestjs/common';
import { Insertable, Kysely, Updateable } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { columns } from 'src/database';
import { DummyValue, GenerateSql } from 'src/decorators';
import { DB } from 'src/schema';
import { AgentSessionTable } from 'src/schema/tables/agent-session.table';
import { asUuid } from 'src/utils/database';

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

  update(userId: string, id: string, dto: Updateable<AgentSessionTable>) {
    return this.db
      .updateTable('agent_session')
      .set(dto)
      .where('userId', '=', userId)
      .where('id', '=', asUuid(id))
      .returning(columns.agentSession)
      .executeTakeFirstOrThrow();
  }
}
