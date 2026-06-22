// CLI: compares the working branch against a base ref (default: main) and
// enforces the fork-owned-files-only invariant. Run: node scripts/reskin-scope.mjs [base]
import { execSync } from 'node:child_process';
import { isInScope } from '../src/lib/styles/reskin-scope.mjs';

const base = process.argv[2] ?? 'main';
// base is interpolated into a git command below; allow only ref-safe characters.
if (!/^[\w\-./]+$/.test(base)) {
  console.error(`Invalid base ref: ${base}`);
  process.exit(2);
}
const changed = execSync(`git diff --name-only ${base}...HEAD`, { encoding: 'utf8' })
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);
const appCssAdded = execSync(`git diff ${base}...HEAD -- web/src/app.css`, { encoding: 'utf8' })
  .split('\n')
  .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
  .map((l) => l.slice(1));

const { ok, violations } = isInScope(changed, appCssAdded);
if (!ok) {
  console.error('Re-skin scope violations (component-markup recoloring not allowed):');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log('Re-skin scope OK: only fork-owned files + the single app.css import changed.');
