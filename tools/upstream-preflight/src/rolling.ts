import fs from "node:fs";
import path from "node:path";
import {
  readPersistedBatchPlan,
  selectNextBatch,
  validatePersistedBatchPlan,
} from "./batch";
import {
  currentBranch,
  getGitPath,
  hasGitOperationInProgress,
  isAncestor,
  isCleanWorktree,
  listCommits,
  revParse,
} from "./git";

const fullShaPattern = /^[0-9a-f]{40}$/;

export type RollingState = {
  version: 1;
  mode: "rolling-upstream-rebase";
  branch: string;
  upstreamRef: string;
  upstreamTargetHead: string;
  forkRef: string;
  startedForkHead: string;
  integratedForkHead: string;
  startedAt: string;
  lastForkSyncAt?: string;
  activeForkSync?: {
    status: "checks-failed";
    from: string;
    to: string;
    commits: string[];
    preSyncHead: string;
  };
  appendHistory?: Array<{
    at: string;
    from: string;
    to: string;
    commits: string[];
    lastCompletedBatch?: string;
    checks: string[];
  }>;
  checkHistory?: Array<{
    at: string;
    phase: "fork-sync" | "final";
    commands: string[];
    ok: boolean;
  }>;
};

export type RollingCommandOptions = {
  repoPath: string;
  outputDir?: string;
  resume?: boolean;
  now?: () => string;
  write?: (message: string) => void;
  writeError?: (message: string) => void;
};

export function rollingStatePath(repoPath: string, outputDir?: string): string {
  if (outputDir !== undefined) {
    return path.join(outputDir, "rolling-state.json");
  }

  const gitPath = getGitPath(repoPath, "upstream-preflight");
  const stateDir = path.isAbsolute(gitPath)
    ? gitPath
    : path.resolve(repoPath, gitPath);

  return path.join(stateDir, "rolling-state.json");
}

export function readRollingState(
  repoPath: string,
  outputDir?: string,
): RollingState {
  const statePath = rollingStatePath(repoPath, outputDir);
  if (!fs.existsSync(statePath)) {
    throw new Error(
      `Missing rolling state ${statePath}; run make upstream-rolling-start first.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Failed to parse rolling state ${statePath}: ${errorMessage(error)}`,
    );
  }

  return validateRollingState(parsed, statePath);
}

export function writeRollingState(
  repoPath: string,
  state: RollingState,
  outputDir?: string,
): string {
  const statePath = rollingStatePath(repoPath, outputDir);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(
    statePath,
    `${JSON.stringify(validateRollingState(state, "rolling state"), null, 2)}\n`,
  );
  return statePath;
}

export function runRollingStartCommand(options: RollingCommandOptions): number {
  const write = options.write ?? console.log;
  const writeError = options.writeError ?? console.error;

  try {
    const branch = currentBranch(options.repoPath);
    if (branch.length === 0) {
      throw new Error(
        "Detached HEAD; check out a rebase branch before starting rolling rebase.",
      );
    }
    if (branch === "main") {
      throw new Error("Refusing to start rolling rebase on main");
    }
    if (hasGitOperationInProgress(options.repoPath)) {
      throw new Error(
        "Git operation in progress; finish or abort it before starting or resuming rolling rebase.",
      );
    }

    if (options.resume) {
      const state = readRollingState(options.repoPath, options.outputDir);
      if (branch !== state.branch) {
        throw new Error(
          `Cannot resume rolling rebase on ${branch}; rolling state is for ${state.branch}. Check out ${state.branch} before resuming.`,
        );
      }
      write(`Resumed rolling upstream rebase on ${state.branch}`);
      return 0;
    }

    if (!isCleanWorktree(options.repoPath)) {
      throw new Error(
        "Worktree is dirty; commit or stash changes before starting rolling rebase.",
      );
    }

    const statePath = rollingStatePath(options.repoPath, options.outputDir);
    if (fs.existsSync(statePath) && !options.resume) {
      throw new Error(
        `Rolling state already exists at ${statePath}; pass --resume to reuse it.`,
      );
    }

    const plan = readPersistedBatchPlan(options.repoPath, options.outputDir);
    validatePersistedBatchPlan(plan, options.repoPath);

    const head = revParse(options.repoPath, "HEAD");
    if (head !== plan.metadata.forkHead) {
      throw new Error(
        `HEAD ${head} does not match planned fork head ${plan.metadata.forkHead}; pass --resume only after verifying branch state.`,
      );
    }

    const state: RollingState = {
      version: 1,
      mode: "rolling-upstream-rebase",
      branch,
      upstreamRef: plan.metadata.upstreamRef,
      upstreamTargetHead: plan.metadata.upstreamHead,
      forkRef: plan.metadata.forkRef,
      startedForkHead: plan.metadata.forkHead,
      integratedForkHead: plan.metadata.forkHead,
      startedAt: options.now?.() ?? new Date().toISOString(),
      appendHistory: [],
      checkHistory: [],
    };

    writeRollingState(options.repoPath, state, options.outputDir);
    write(`Started rolling upstream rebase on ${branch}`);
    return 0;
  } catch (error) {
    writeError(errorMessage(error));
    return 1;
  }
}

export function renderRollingStatus(
  options: Pick<RollingCommandOptions, "repoPath" | "outputDir">,
): string {
  const state = readRollingState(options.repoPath, options.outputDir);
  const branch = currentBranch(options.repoPath);
  if (branch !== state.branch) {
    throw new Error(
      `Cannot render rolling status on ${branch || "detached HEAD"}; rolling state is for ${state.branch}. Check out ${state.branch} before checking status.`,
    );
  }

  const plan = readPersistedBatchPlan(options.repoPath, options.outputDir);
  const warnings: string[] = [];
  try {
    validatePersistedBatchPlan(plan, options.repoPath);
  } catch (error) {
    warnings.push(`Warning: ${errorMessage(error)}`);
  }

  const selection = selectNextBatch(plan, options.repoPath);
  const completedBatchCount =
    selection.status === "none" ? 0 : selection.completedBatchCount;
  const currentForkHead = revParse(options.repoPath, state.forkRef);
  const forkPendingStatus = isAncestor(
    options.repoPath,
    state.integratedForkHead,
    state.forkRef,
  )
    ? String(
        listCommits(
          options.repoPath,
          `${state.integratedForkHead}..${state.forkRef}`,
        ).length,
      )
    : "unknown";
  if (forkPendingStatus === "unknown") {
    warnings.push(
      `Warning: integrated fork head ${state.integratedForkHead} is not an ancestor of ${state.forkRef} (${currentForkHead}); pending fork commits cannot be counted.`,
    );
  }
  const nextAction = state.activeForkSync
    ? "run make upstream-sync-fork-main ROLLING_CONTINUE=1"
    : forkPendingStatus === "unknown"
      ? "inspect fork ref divergence before continuing"
      : forkPendingStatus !== "0" && forkPendingStatus !== "unknown"
        ? "run make upstream-sync-fork-main"
        : "run make upstream-next-batch";

  return [
    "Rolling upstream rebase status",
    ...warnings,
    `Branch: ${state.branch}`,
    `Upstream target: ${state.upstreamRef} (${shortSha(state.upstreamTargetHead)})`,
    `Completed upstream batches: ${String(completedBatchCount).padStart(2, "0")} / ${String(plan.batches.length).padStart(2, "0")}`,
    `Integrated fork head: ${state.forkRef} @ ${shortSha(state.integratedForkHead)}`,
    `Current ${state.forkRef}: ${shortSha(currentForkHead)}`,
    `Fork commits pending: ${forkPendingStatus}`,
    `Next action: ${nextAction}`,
  ].join("\n");
}

export function runRollingStatusCommand(
  options: RollingCommandOptions,
): number {
  const write = options.write ?? console.log;
  const writeError = options.writeError ?? console.error;

  try {
    write(renderRollingStatus(options));
    return 0;
  } catch (error) {
    writeError(errorMessage(error));
    return 1;
  }
}

export function validateRollingState(
  value: unknown,
  source: string,
): RollingState {
  assertRecord(value, source);
  if (value.version !== 1) {
    throw new Error(`Invalid rolling state ${source}: version must be 1`);
  }
  if (value.mode !== "rolling-upstream-rebase") {
    throw new Error(
      `Invalid rolling state ${source}: mode must be rolling-upstream-rebase`,
    );
  }

  for (const key of ["branch", "upstreamRef", "forkRef", "startedAt"]) {
    assertString(value[key], source, key);
  }
  for (const key of [
    "upstreamTargetHead",
    "startedForkHead",
    "integratedForkHead",
  ]) {
    assertFullSha(value[key], source, key);
  }
  assertIsoTimestamp(value.startedAt, source, "startedAt");

  if (value.lastForkSyncAt !== undefined) {
    assertIsoTimestamp(value.lastForkSyncAt, source, "lastForkSyncAt");
  }
  if (value.activeForkSync !== undefined) {
    validateActiveForkSync(value.activeForkSync, source);
  }
  if (value.appendHistory !== undefined) {
    validateAppendHistory(value.appendHistory, source);
  }
  if (value.checkHistory !== undefined) {
    validateCheckHistory(value.checkHistory, source);
  }

  return value as RollingState;
}

function validateActiveForkSync(value: unknown, source: string): void {
  assertRecord(value, `${source}: activeForkSync`);
  if (value.status !== "checks-failed") {
    throw new Error(
      `Invalid rolling state ${source}: activeForkSync.status must be checks-failed`,
    );
  }
  for (const key of ["from", "to", "preSyncHead"]) {
    assertFullSha(value[key], source, `activeForkSync.${key}`);
  }
  assertShaArray(value.commits, source, "activeForkSync.commits");
}

function validateAppendHistory(value: unknown, source: string): void {
  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid rolling state ${source}: appendHistory must be an array`,
    );
  }

  value.forEach((entry, index) => {
    const prefix = `appendHistory[${index}]`;
    assertRecord(entry, `${source}: ${prefix}`);
    assertIsoTimestamp(entry.at, source, `${prefix}.at`);
    for (const key of ["from", "to"]) {
      assertFullSha(entry[key], source, `${prefix}.${key}`);
    }
    assertShaArray(entry.commits, source, `${prefix}.commits`);
    if (entry.lastCompletedBatch !== undefined) {
      assertString(
        entry.lastCompletedBatch,
        source,
        `${prefix}.lastCompletedBatch`,
      );
    }
    assertStringArray(entry.checks, source, `${prefix}.checks`);
  });
}

function validateCheckHistory(value: unknown, source: string): void {
  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid rolling state ${source}: checkHistory must be an array`,
    );
  }

  value.forEach((entry, index) => {
    const prefix = `checkHistory[${index}]`;
    assertRecord(entry, `${source}: ${prefix}`);
    assertIsoTimestamp(entry.at, source, `${prefix}.at`);
    if (entry.phase !== "fork-sync" && entry.phase !== "final") {
      throw new Error(
        `Invalid rolling state ${source}: ${prefix}.phase must be fork-sync or final`,
      );
    }
    assertStringArray(entry.commands, source, `${prefix}.commands`);
    if (typeof entry.ok !== "boolean") {
      throw new Error(
        `Invalid rolling state ${source}: ${prefix}.ok must be a boolean`,
      );
    }
  });
}

function assertRecord(
  value: unknown,
  source: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid rolling state ${source}: object is required`);
  }
}

function assertString(
  value: unknown,
  source: string,
  key: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid rolling state ${source}: ${key} is required`);
  }
}

function assertFullSha(value: unknown, source: string, key: string): void {
  if (typeof value !== "string" || !fullShaPattern.test(value)) {
    throw new Error(
      `Invalid rolling state ${source}: ${key} must be a full 40-character SHA`,
    );
  }
}

function assertIsoTimestamp(value: unknown, source: string, key: string): void {
  assertString(value, source, key);
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(
      `Invalid rolling state ${source}: ${key} must be an ISO timestamp`,
    );
  }
}

function assertShaArray(value: unknown, source: string, key: string): void {
  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid rolling state ${source}: ${key} must be an array of SHAs`,
    );
  }
  value.forEach((item) => assertFullSha(item, source, `${key}[]`));
}

function assertStringArray(value: unknown, source: string, key: string): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(
      `Invalid rolling state ${source}: ${key} must be an array of strings`,
    );
  }
}

function shortSha(sha: string): string {
  return sha.slice(0, 9);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
