// M12: sql-tools compares `migration_overrides` rows by exact string equality against the
// DDL `registerFunction(...)` in src/schema/functions.ts would emit (via its internal
// asFunctionExpression helper, surfaced here as DatabaseFunction.expression). If a
// migration's executed CREATE OR REPLACE FUNCTION / its migration_overrides `sql` value
// ever drifts from that registered expression (e.g. a hand-edit that drops comment lines
// or truncates the trailing `$$;`), a future `migrations:generate` against a DB that ran
// this migration emits a spurious FunctionCreate + OverrideUpdate. This pins both strings
// to the registered function byte-for-byte so drift fails fast, independent of a DB.
//
// Captures the literal strings passed to every `sql\`...\`` call in the migration's up()
// by mocking `kysely`'s `sql` tag — since none of this migration's templates interpolate
// values, the single element of the tagged-template `strings` array IS the exact runtime
// string (already escape-processed by the JS engine), the same text Kysely would compile
// and send to Postgres. This avoids hand-simulating template-literal escaping rules by
// regex-parsing the raw source file.
const capturedSql = vi.hoisted(() => [] as string[]);

function fakeSql(strings: TemplateStringsArray, ...values: unknown[]): { execute: () => Promise<void> } {
  if (values.length > 0) {
    throw new Error('migration-override-parity fake sql`` does not support interpolated values');
  }
  capturedSql.push(strings[0]);
  return { execute: () => Promise.resolve() };
}

vi.mock('kysely', async () => {
  const actual = await vi.importActual<typeof import('kysely')>('kysely');
  return { ...actual, sql: fakeSql };
});

import {
  album_soft_delete_shared_space_album,
  album_space_asset_delete_audit,
  shared_space_member_after_insert_album,
} from 'src/schema/functions';
// Static import (not dynamic `import()`): tsc's node16/nodenext resolution can't resolve a
// `src/`-aliased specifier inside a dynamic import expression (TS2307), unlike a static
// import. vitest hoists `vi.mock('kysely', ...)` above every import in this file regardless
// of source position (same pattern as composite-migration-provider.spec.ts), so the mock is
// already installed by the time this migration module's top-level `import { sql } from
// 'kysely'` resolves.
import { up as upAlbumSoftDelete } from 'src/schema/migrations-gallery/1782050000000-AddAlbumSoftDeleteSharedSpaceAlbumTrigger';
import { up as upAlbumSpaceAssetSyncAndAudit } from 'src/schema/migrations-gallery/1783100000000-AddAlbumSpaceAssetSyncAndAudit';
import { up as upMemberJoinGrantCreateId } from 'src/schema/migrations-gallery/1783700000000-FixSharedSpaceMemberJoinGrantCreateId';

describe('1782050000000-AddAlbumSoftDeleteSharedSpaceAlbumTrigger override parity', () => {
  beforeEach(() => {
    capturedSql.length = 0;
  });

  it('executes and overrides the function with DDL byte-identical to functions.ts', async () => {
    await upAlbumSoftDelete({} as any);

    const [executedFunctionDdl, , functionOverrideInsert] = capturedSql;

    // The registered function's DDL (functions.ts) is the source of truth `migrations:generate`
    // diffs against — both the migration's executed statement and its override row must match it
    // byte-for-byte, or a scratch-DB `migrations:generate` run emits a spurious diff.
    expect(executedFunctionDdl).toBe(album_soft_delete_shared_space_album.expression);

    const overrideValue = JSON.parse(
      functionOverrideInsert.match(/VALUES \('function_album_soft_delete_shared_space_album', '(.+)'::jsonb\)/s)![1],
    ) as { type: string; name: string; sql: string };
    expect(overrideValue.sql).toBe(album_soft_delete_shared_space_album.expression);
  });
});

// This migration REPLACED the body registered in functions.ts (ON CONFLICT DO NOTHING ->
// DO UPDATE SET createId/createdAt, fixing #752 review F-A: a re-added member whose grant
// survived removal kept its original createId, so the grant-keyed backfill never re-fired and
// contributions made during the absence stayed undeliverable). Its sibling 1782100000000 updated
// functions.ts to match; this one did not, so every DB that ran it reports FunctionCreate +
// OverrideUpdate forever — and `migrations:generate` would emit a migration REVERTING the fix.
describe('1783700000000-FixSharedSpaceMemberJoinGrantCreateId override parity', () => {
  beforeEach(() => {
    capturedSql.length = 0;
  });

  it('executes and overrides the function with DDL byte-identical to functions.ts', async () => {
    await upMemberJoinGrantCreateId({} as any);

    const [executedFunctionDdl, functionOverrideUpdate] = capturedSql;

    expect(executedFunctionDdl).toBe(shared_space_member_after_insert_album.expression);

    const overrideValue = JSON.parse(functionOverrideUpdate.match(/SET "value" = '(.+)'::jsonb/s)![1]) as {
      type: string;
      name: string;
      sql: string;
    };
    expect(overrideValue.sql).toBe(shared_space_member_after_insert_album.expression);
  });
});

// This migration created album_space_asset_delete_audit (function + statement AFTER DELETE
// trigger) but nothing was ever registered in functions.ts / on AlbumSpaceAssetTable, so
// schema-check reported FunctionDrop + two OverrideDrops on every DB that ran it. The generated
// `DROP FUNCTION` can't even execute (the trigger depends on it, and no DROP TRIGGER is emitted);
// forcing it with CASCADE would silently break #764's sync delete stream.
describe('1783100000000-AddAlbumSpaceAssetSyncAndAudit override parity', () => {
  beforeEach(() => {
    capturedSql.length = 0;
  });

  it('executes and overrides the delete-audit function with DDL byte-identical to functions.ts', async () => {
    await upAlbumSpaceAssetSyncAndAudit({} as any);

    // Located by content rather than index — this migration also emits the sync columns, the
    // audit table and four indexes, and that ordering is not what this test is pinning.
    const executedFunctionDdl = capturedSql.find((s) =>
      s.startsWith('CREATE OR REPLACE FUNCTION album_space_asset_delete_audit()'),
    );
    expect(executedFunctionDdl).toBe(album_space_asset_delete_audit.expression);

    const functionOverrideInsert = capturedSql.find((s) =>
      s.includes(`VALUES ('function_album_space_asset_delete_audit'`),
    )!;
    const overrideValue = JSON.parse(
      functionOverrideInsert.match(/VALUES \('function_album_space_asset_delete_audit', '(.+)'::jsonb\)/s)![1],
    ) as { type: string; name: string; sql: string };
    expect(overrideValue.sql).toBe(album_space_asset_delete_audit.expression);
  });
});
