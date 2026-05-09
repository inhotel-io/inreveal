import fs from "node:fs";
import path from "node:path";
import { getGitPath } from "./git";

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

export function rollingStatePath(repoPath: string, outputDir?: string): string {
  return path.join(
    outputDir ?? getGitPath(repoPath, "upstream-preflight"),
    "rolling-state.json",
  );
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
