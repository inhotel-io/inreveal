import { Kysely } from 'kysely';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { DB } from 'src/schema';
import { describe, expect, it, vitest } from 'vitest';

const deadlock = () => Object.assign(new Error('deadlock detected'), { code: '40P01' });

/**
 * The recount is a deadlock victim under a real delete storm (#864): the representativeFaceId
 * ON DELETE SET NULL cascade locks shared_space_person rows in face order, so Postgres can pick
 * a recount to kill even though the recount itself claims its rows in id order.
 *
 * These cover the retry wiring. The end-to-end effect is measured by the library-unmap repro,
 * which cannot be expressed as a deterministic unit test.
 */
describe(`${SharedSpaceRepository.name}.recountPersons deadlock retry (#864)`, () => {
  const ids = ['11111111-1111-4111-8111-111111111111'];

  it('re-drives the recount in a FRESH transaction when it is chosen as the victim', async () => {
    let attempts = 0;
    const execute = vitest.fn(() => {
      attempts++;
      if (attempts < 3) {
        return Promise.reject(deadlock());
      }
      return Promise.resolve(void 0);
    });
    const transaction = vitest.fn(() => ({ execute }));
    const db = { isTransaction: false, transaction } as unknown as Kysely<DB>;

    await expect(new SharedSpaceRepository(db).recountPersons(ids, db)).resolves.toBeUndefined();

    // a retry must open a new transaction: the deadlocked one is already dead
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('does not retry failures that are not deadlocks', async () => {
    const execute = vitest.fn(() => Promise.reject(Object.assign(new Error('nope'), { code: '23503' })));
    const transaction = vitest.fn(() => ({ execute }));
    const db = { isTransaction: false, transaction } as unknown as Kysely<DB>;

    await expect(new SharedSpaceRepository(db).recountPersons(ids, db)).rejects.toMatchObject({ code: '23503' });

    expect(transaction).toHaveBeenCalledTimes(1);
  });

  // A deadlock aborts the caller's whole transaction, so re-running the statements inside it would
  // only raise "current transaction is aborted". The caller has to re-drive its own transaction.
  it('never retries, or nests a transaction, when the caller supplied one', async () => {
    const transaction = vitest.fn();
    let claims = 0;
    const chain: any = {
      select: () => chain,
      where: () => chain,
      orderBy: () => chain,
      forUpdate: () => chain,
      execute: () => {
        claims++;
        return Promise.reject(deadlock());
      },
    };
    const trx = { isTransaction: true, transaction, selectFrom: () => chain } as unknown as Kysely<DB>;

    await expect(new SharedSpaceRepository(trx).recountPersons(ids, trx)).rejects.toMatchObject({ code: '40P01' });

    expect(claims).toBe(1);
    expect(transaction).not.toHaveBeenCalled();
  });
});
