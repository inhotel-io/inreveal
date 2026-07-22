import fs from 'node:fs';
import path from 'node:path';
import {
  assertBoolean,
  assertFullSha,
  assertNumber,
  assertRecord,
  assertRisk,
  assertString,
  assertStringArray,
} from './asserts';
import {
  errorMessage,
  getGitPath,
  isAncestor,
  revParse,
  shortSha,
} from './git';
import type {
  Batch,
  BatchPlan,
  BatchPlanMetadata,
  CheckEntry,
  ClassifiedCommit,
  RiskLevel,
} from './types';

const riskRank: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };
const invalidPlan = 'persisted batch plan';

export type BatchAuditScopeInput = {
  batch?: string;
  batchPlan: BatchPlan;
  upstreamTouchedFiles: string[];
};

export type BatchAuditScope = {
  batch?: string;
  upstreamTouchedFiles: string[];
};

export type PlanBatchesOptions = {
  metadata: BatchPlanMetadata;
  softCap?: number;
  checks?: Record<string, CheckEntry>;
};

export type BatchPlanReportPaths = {
  markdownPath: string;
  jsonPath: string;
};

export type NextBatchSelection =
  | { status: 'none'; plan: BatchPlan }
  | { status: 'complete'; plan: BatchPlan; completedBatchCount: number }
  | {
      status: 'next';
      plan: BatchPlan;
      batch: Batch;
      completedBatchCount: number;
    };

export type NextBatchCommandOptions = {
  repoPath: string;
  outputDir?: string;
  expectedUpstreamHead?: string;
  checks?: Record<string, CheckEntry>;
  write?: (message: string) => void;
  writeError?: (message: string) => void;
};

export type BatchPlanValidationOptions = {
  expectedUpstreamHead?: string;
};

function batchRisk(commits: ClassifiedCommit[]): RiskLevel {
  return commits.reduce<RiskLevel>(
    (risk, commit) =>
      riskRank[commit.risk] > riskRank[risk] ? commit.risk : risk,
    'low',
  );
}

function makeBatch(index: number, commits: ClassifiedCommit[]): Batch {
  const requiredChecks = [
    ...new Set(commits.flatMap((commit) => commit.requiredChecks)),
  ].sort();
  const why = [...new Set(commits.flatMap((commit) => commit.reasons))];
  const tip = commits.at(-1);

  if (!tip) {
    throw new Error('Cannot create an empty batch');
  }

  return {
    id: String(index).padStart(2, '0'),
    tipSha: tip.sha,
    commits,
    risk: batchRisk(commits),
    why,
    requiredChecks,
    postBatchChecks: [],
    checkpointChecks: [],
    checkpoint: false,
  };
}

function mustStartOwnBatch(commit: ClassifiedCommit): boolean {
  return (
    commit.risk === 'high' ||
    commit.features.length > 1 ||
    commit.reasons.some((reason) => reason.includes('openapi-generated'))
  );
}

export function planBatches(
  commits: ClassifiedCommit[],
  options: PlanBatchesOptions,
): BatchPlan {
  const softCap = options.softCap ?? options.metadata.softCap;
  const batches: Batch[] = [];
  let current: ClassifiedCommit[] = [];

  const flush = () => {
    if (current.length > 0) {
      batches.push(makeBatch(batches.length + 1, current));
      current = [];
    }
  };

  for (const commit of commits) {
    if (mustStartOwnBatch(commit)) {
      flush();
      batches.push(makeBatch(batches.length + 1, [commit]));
      continue;
    }

    current.push(commit);
    if (current.length >= softCap) flush();
  }

  flush();
  applyCheckpointPolicy(batches, softCap, options.checks);
  return { metadata: { ...options.metadata, softCap }, batches };
}

export function selectBatchAuditScope(
  input: BatchAuditScopeInput,
): BatchAuditScope {
  if (!input.batch) {
    return { upstreamTouchedFiles: input.upstreamTouchedFiles };
  }

  const requestedBatch = normalizeBatchId(input.batch);
  const batch = input.batchPlan.batches.find(
    (candidate) => candidate.id === requestedBatch,
  );
  if (!batch) {
    const availableBatches = input.batchPlan.batches
      .map((candidate) => candidate.id)
      .join(', ');
    throw new Error(
      `Unknown upstream batch ${input.batch}. Available batches: ${availableBatches || 'none'}`,
    );
  }

  return {
    batch: batch.id,
    upstreamTouchedFiles: [
      ...new Set(batch.commits.flatMap((commit) => commit.files)),
    ].sort(),
  };
}

export function renderBatchMarkdown(
  plan: BatchPlan,
  checks: Record<string, CheckEntry> = {},
): string {
  const rows = plan.batches
    .map(
      (batch) =>
        `| ${batch.id} | \`${shortSha(batch.tipSha)}\` | ${batch.commits.length} | ${batch.risk.toUpperCase()} | ${batch.checkpoint ? 'yes' : 'no'} | ${batch.why.join('; ') || '-'} | ${batch.postBatchChecks.join(', ') || '-'} | ${batch.checkpointChecks.join(', ') || '-'} |`,
    )
    .join('\n');
  const commands = plan.batches
    .map(
      (batch) => `### Batch ${batch.id}

\`\`\`bash
${renderBatchCommands(batch, checks)}
\`\`\``,
    )
    .join('\n\n');

  return `| Batch | Tip SHA | Commits | Risk | Checkpoint | Why | Post-Batch Checks | Checkpoint Checks |
| --- | --- | ---: | --- | --- | --- | --- | --- |
${rows || '| - | - | 0 | LOW | - | No incoming upstream commits | - | - |'}

## Batch Commands

${commands || 'No upstream batches are required.'}
`;
}

export function writeBatchPlanReports(
  plan: BatchPlan,
  outputDir: string,
  checks: Record<string, CheckEntry> = {},
): BatchPlanReportPaths {
  fs.mkdirSync(outputDir, { recursive: true });
  const markdownPath = path.join(outputDir, 'batch-plan.md');
  const jsonPath = path.join(outputDir, 'batch-plan.json');
  fs.writeFileSync(markdownPath, renderBatchMarkdown(plan, checks));
  fs.writeFileSync(jsonPath, `${JSON.stringify(plan, null, 2)}\n`);

  return { markdownPath, jsonPath };
}

export function persistedBatchPlanPath(
  repoPath: string,
  outputDir?: string,
): string {
  return path.join(
    persistedBatchPlanDir(repoPath, outputDir),
    'batch-plan.json',
  );
}

export function readPersistedBatchPlan(
  repoPath: string,
  outputDir?: string,
): BatchPlan {
  const jsonPath = persistedBatchPlanPath(repoPath, outputDir);

  if (!fs.existsSync(jsonPath)) {
    throw new Error(
      `Missing persisted batch plan ${jsonPath}; run make upstream-batch-plan first.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Failed to parse persisted batch plan ${jsonPath}: ${errorMessage(error)}`,
    );
  }

  validateBatchPlanShape(parsed, jsonPath);
  return parsed;
}

export function readPersistedBatchAuditScope(
  repoPath: string,
  outputDir: string | undefined,
  batch?: string,
): BatchAuditScope {
  const batchPlan = readPersistedBatchPlan(repoPath, outputDir);
  const upstreamTouchedFiles = [
    ...new Set(
      batchPlan.batches.flatMap((planBatch) =>
        planBatch.commits.flatMap((commit) => commit.files),
      ),
    ),
  ].sort();

  return selectBatchAuditScope({
    batch,
    batchPlan,
    upstreamTouchedFiles,
  });
}

export function validatePersistedBatchPlan(
  plan: BatchPlan,
  repoPath: string,
  options: BatchPlanValidationOptions = {},
): void {
  if (options.expectedUpstreamHead !== undefined) {
    if (options.expectedUpstreamHead !== plan.metadata.upstreamHead) {
      throw new Error(
        `Persisted batch plan target ${plan.metadata.upstreamHead} does not match expected upstream target ${options.expectedUpstreamHead}. Run make upstream-batch-plan and review the new plan before continuing.`,
      );
    }
  } else {
    const currentUpstreamHead = revParse(repoPath, plan.metadata.upstreamRef);
    if (currentUpstreamHead !== plan.metadata.upstreamHead) {
      throw new Error(
        `Persisted batch plan is stale: ${plan.metadata.upstreamRef} is ${currentUpstreamHead}, but batch-plan.json was generated for ${plan.metadata.upstreamHead}. Run make upstream-batch-plan.`,
      );
    }
  }

  for (const batch of plan.batches) {
    if (!isAncestor(repoPath, batch.tipSha, plan.metadata.upstreamHead)) {
      throw new Error(
        `Persisted batch ${batch.id} tip ${batch.tipSha} is not an ancestor of upstream head ${plan.metadata.upstreamHead}. Run make upstream-batch-plan.`,
      );
    }
  }
}

export function selectNextBatch(
  plan: BatchPlan,
  repoPath: string,
): NextBatchSelection {
  if (plan.batches.length === 0) {
    return { status: 'none', plan };
  }

  if (isAncestor(repoPath, plan.metadata.upstreamHead, 'HEAD')) {
    return {
      status: 'complete',
      plan,
      completedBatchCount: plan.batches.length,
    };
  }

  let completedBatchIndex = -1;
  for (const [index, batch] of plan.batches.entries()) {
    if (isAncestor(repoPath, batch.tipSha, 'HEAD')) {
      completedBatchIndex = index;
    }
  }

  if (completedBatchIndex === plan.batches.length - 1) {
    return {
      status: 'complete',
      plan,
      completedBatchCount: plan.batches.length,
    };
  }

  return {
    status: 'next',
    plan,
    batch: plan.batches[completedBatchIndex + 1],
    completedBatchCount: completedBatchIndex + 1,
  };
}

export function renderNextBatchMarkdown(
  selection: NextBatchSelection,
  checks: Record<string, CheckEntry> = {},
): string {
  if (selection.status === 'none') {
    return `No upstream batches are required for ${selection.plan.metadata.upstreamRef} (${shortSha(selection.plan.metadata.upstreamHead)}).`;
  }

  if (selection.status === 'complete') {
    return `Upstream rebase already includes ${selection.plan.metadata.upstreamRef} (${selection.plan.metadata.upstreamHead}).
Completed batches: ${selection.completedBatchCount}
No rebase command is required.`;
  }

  const { batch, completedBatchCount, plan } = selection;
  const reasons = batch.why.length > 0 ? batch.why.join('\n- ') : 'none';

  return `Next upstream batch: ${batch.id}
Completed batches: ${completedBatchCount}
Upstream ref: ${plan.metadata.upstreamRef}
Upstream head: ${plan.metadata.upstreamHead}
Tip SHA: ${batch.tipSha}
Risk: ${batch.risk.toUpperCase()}
Reasons:
- ${reasons}

Commands:

\`\`\`bash
${renderBatchCommands(batch, checks)}
\`\`\``;
}

export function runNextBatchCommand(options: NextBatchCommandOptions): number {
  const write = options.write ?? console.log;
  const writeError = options.writeError ?? console.error;

  try {
    const plan = readPersistedBatchPlan(options.repoPath, options.outputDir);
    validatePersistedBatchPlan(plan, options.repoPath, {
      expectedUpstreamHead: options.expectedUpstreamHead,
    });
    write(
      renderNextBatchMarkdown(
        selectNextBatch(plan, options.repoPath),
        options.checks,
      ),
    );
    return 0;
  } catch (error) {
    writeError(errorMessage(error));
    return 1;
  }
}

export function renderBatchCommands(
  batch: Batch,
  checks: Record<string, CheckEntry> = {},
): string {
  const commands = [
    `git rebase ${batch.tipSha}`,
    `make upstream-postrebase-audit BATCH=${batch.id}`,
    ...batch.postBatchChecks.map((check) =>
      renderRequiredCheckCommand(check, batch.id, checks),
    ),
  ];

  if (batch.checkpoint) {
    commands.push(
      ...batch.checkpointChecks.map((check) =>
        renderRequiredCheckCommand(check, batch.id, checks),
      ),
      `git push origin HEAD:rebase/upstream-batch-${batch.id} --force`,
    );
  }

  return commands.join('\n');
}

function validateBatchPlanShape(
  value: unknown,
  source: string,
): asserts value is BatchPlan {
  assertRecord(value, invalidPlan, source);
  assertRecord(value.metadata, invalidPlan, `${source}: metadata`);
  const metadata = value.metadata;

  for (const key of [
    'generatedAt',
    'mergeBase',
    'upstreamRef',
    'upstreamHead',
    'forkRef',
    'forkHead',
    'manifestForkBaseline',
  ]) {
    assertString(metadata[key], invalidPlan, `${source}: metadata.${key}`);
  }
  assertNumber(metadata.softCap, invalidPlan, `${source}: metadata.softCap`);
  assertFullSha(
    metadata.mergeBase,
    invalidPlan,
    `${source}: metadata.mergeBase`,
  );
  assertFullSha(
    metadata.upstreamHead,
    invalidPlan,
    `${source}: metadata.upstreamHead`,
  );
  assertFullSha(metadata.forkHead, invalidPlan, `${source}: metadata.forkHead`);
  assertFullSha(
    metadata.manifestForkBaseline,
    invalidPlan,
    `${source}: metadata.manifestForkBaseline`,
  );

  if (!Array.isArray(value.batches)) {
    throw new Error(
      `Invalid persisted batch plan ${source}: batches is required`,
    );
  }

  for (const [batchIndex, batch] of value.batches.entries()) {
    const label = `${source}: batches[${batchIndex}]`;
    assertRecord(batch, invalidPlan, label);
    assertString(batch.id, invalidPlan, `${label}.id`);
    assertString(batch.tipSha, invalidPlan, `${label}.tipSha`);
    assertFullSha(batch.tipSha, invalidPlan, `${label}.tipSha`);
    assertRisk(batch.risk, invalidPlan, `${label}.risk`);
    assertStringArray(batch.why, invalidPlan, `${label}.why`);
    assertStringArray(
      batch.requiredChecks,
      invalidPlan,
      `${label}.requiredChecks`,
    );
    assertStringArray(
      batch.postBatchChecks,
      invalidPlan,
      `${label}.postBatchChecks`,
    );
    assertStringArray(
      batch.checkpointChecks,
      invalidPlan,
      `${label}.checkpointChecks`,
    );
    assertBoolean(batch.checkpoint, invalidPlan, `${label}.checkpoint`);

    if (!Array.isArray(batch.commits) || batch.commits.length === 0) {
      throw new Error(
        `Invalid persisted batch plan ${source}: ${label}.commits must contain at least one commit`,
      );
    }

    for (const [commitIndex, commit] of batch.commits.entries()) {
      const commitLabel = `${label}.commits[${commitIndex}]`;
      assertRecord(commit, invalidPlan, commitLabel);
      assertString(commit.sha, invalidPlan, `${commitLabel}.sha`);
      assertFullSha(commit.sha, invalidPlan, `${commitLabel}.sha`);
      assertStringArray(commit.files, invalidPlan, `${commitLabel}.files`);
    }
  }
}

function applyCheckpointPolicy(
  batches: Batch[],
  softCap: number,
  checks: Record<string, CheckEntry> = {},
) {
  let commitsSinceCheckpoint = 0;
  let pendingCheckpointChecks = new Set<string>();

  for (const [index, batch] of batches.entries()) {
    const isFinal = index === batches.length - 1;
    commitsSinceCheckpoint += batch.commits.length;

    batch.postBatchChecks = batch.requiredChecks
      .filter((check) => checkCost(check, checks) === 'cheap')
      .sort();

    for (const check of batch.requiredChecks) {
      if (checkCost(check, checks) === 'expensive') {
        pendingCheckpointChecks.add(check);
      }
    }

    batch.checkpoint =
      batch.risk === 'high' || commitsSinceCheckpoint >= softCap || isFinal;

    if (batch.checkpoint) {
      batch.checkpointChecks = [...pendingCheckpointChecks].sort();
      pendingCheckpointChecks = new Set<string>();
      commitsSinceCheckpoint = 0;
    } else {
      batch.checkpointChecks = [];
    }
  }
}

function renderRequiredCheckCommand(
  check: string,
  batchId: string,
  checks: Record<string, CheckEntry>,
): string {
  const command = checks[check]?.command ?? `make ${check}`;
  if (check === 'mobile-drift-rebase-check' && !/\bBATCH=/.test(command)) {
    return `${command} BATCH=${batchId}`;
  }

  return command;
}

function checkCost(
  check: string,
  checks: Record<string, CheckEntry>,
): NonNullable<CheckEntry['cost']> {
  return checks[check]?.cost ?? 'expensive';
}

function normalizeBatchId(batch: string): string {
  return /^\d+$/.test(batch) ? batch.padStart(2, '0') : batch;
}

function persistedBatchPlanDir(repoPath: string, outputDir?: string): string {
  if (outputDir !== undefined) {
    return outputDir;
  }

  const gitPath = getGitPath(repoPath, 'upstream-preflight');
  return path.isAbsolute(gitPath) ? gitPath : path.resolve(repoPath, gitPath);
}
