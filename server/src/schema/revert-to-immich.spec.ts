import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Note: co-located under src/schema/ (not server/test/) so it runs under the server:unit vitest
// config, which only globs `src/**/*.spec.ts` — mirrors sync-gallery-migrations.spec.ts.
const repoRoot = join(__dirname, '..', '..', '..');
const sqlPath = join(repoRoot, 'scripts', 'revert-to-immich.sql');
const migrationsGalleryDir = join(repoRoot, 'server', 'src', 'schema', 'migrations-gallery');

const sql = readFileSync(sqlPath, 'utf8');

// Only the shared_space_* / face_match fork tables the album slices added — this is a targeted
// regression guard, not an exhaustive drop-vs-guard differ.
const droppedForkTables = [...sql.matchAll(/DROP TABLE IF EXISTS "([^"]+)" CASCADE/g)]
  .map((m) => m[1])
  .filter((name) => name.startsWith('shared_space'));

// The step-9 guard IN-list is the parenthesised block after `tablename IN (`.
const guardBlock = sql.slice(sql.indexOf('AND tablename IN ('));
const guardTables = [...guardBlock.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

describe('revert-to-immich.sql', () => {
  it('lists every dropped shared_space fork table in the step-9 fork_tables_left guard', () => {
    const missing = droppedForkTables.filter((t) => !guardTables.includes(t));
    expect(missing).toEqual([]);
  });

  it('lists every migrations-gallery migration in the step-8 kysely_migrations DELETE block', () => {
    const migrationNames = readdirSync(migrationsGalleryDir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => f.replace(/\.ts$/, ''));
    const missing = migrationNames.filter((name) => !sql.includes(`'${name}'`));
    expect(missing).toEqual([]);
  });
});
