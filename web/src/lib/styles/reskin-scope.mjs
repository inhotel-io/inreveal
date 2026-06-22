// Pure scope-guard logic — NO node builtins, so it type-checks cleanly via the
// spec import and is reused by the CLI at web/scripts/reskin-scope.mjs.
export const ALLOWED_PREFIXES = ['web/src/styles/', 'web/src/lib/styles/', 'web/scripts/', 'web/src/lib/assets/fonts/'];
export const ALLOWED_EXACT = new Set(['web/package.json', 'web/pnpm-lock.yaml']);

export function isInScope(changedPaths, appCssAddedLines) {
  const violations = [];
  for (const p of changedPaths) {
    if (ALLOWED_EXACT.has(p)) continue;
    if (ALLOWED_PREFIXES.some((prefix) => p.startsWith(prefix))) continue;
    if (p === 'web/src/app.css') {
      const offending = appCssAddedLines
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !/^@import\s+['"]\.\/styles\/gallery-theme\.css['"];$/.test(l));
      if (offending.length > 0) violations.push(`web/src/app.css (non-import additions: ${offending.join(' | ')})`);
      continue;
    }
    violations.push(p);
  }
  return { ok: violations.length === 0, violations };
}
