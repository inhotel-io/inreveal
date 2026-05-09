import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempRepo } from "../test/fixtures";
import { planBatches, writeBatchPlanReports } from "./batch";
import {
  readRollingState,
  rollingStatePath,
  runRollingStartCommand,
  validateRollingState,
  writeRollingState,
} from "./rolling";
import type { RollingState } from "./rolling";
import type { BatchPlan, ClassifiedCommit, RiskLevel } from "./types";

describe("rolling state validation", () => {
  it("accepts a valid v1 rolling state", () => {
    expect(validateRollingState(validState(), "state.json")).toEqual(
      validState(),
    );
  });

  it("rejects invalid shape with actionable errors", () => {
    expect(() => validateRollingState({ version: 2 }, "state.json")).toThrow(
      "Invalid rolling state state.json: version must be 1",
    );
    expect(() =>
      validateRollingState(
        { ...validState(), upstreamTargetHead: "abc" },
        "state.json",
      ),
    ).toThrow("upstreamTargetHead must be a full 40-character SHA");
    expect(() =>
      validateRollingState(
        { ...validState(), branch: undefined },
        "state.json",
      ),
    ).toThrow("branch is required");
    expect(() =>
      validateRollingState(
        { ...validState(), startedForkHead: undefined },
        "state.json",
      ),
    ).toThrow("startedForkHead must be a full 40-character SHA");
    expect(() =>
      validateRollingState(
        { ...validState(), startedAt: "not-a-date" },
        "state.json",
      ),
    ).toThrow("startedAt must be an ISO timestamp");
    expect(() =>
      validateRollingState(
        {
          ...validState(),
          activeForkSync: {
            status: "checks-failed",
            from: sha("222222222"),
            to: "abc",
            commits: [],
            preSyncHead: sha("333333333"),
          },
        },
        "state.json",
      ),
    ).toThrow("activeForkSync.to must be a full 40-character SHA");
    expect(() =>
      validateRollingState(
        {
          ...validState(),
          activeForkSync: {
            status: "checks-failed",
            from: sha("222222222"),
            to: sha("333333333"),
            commits: [],
          },
        },
        "state.json",
      ),
    ).toThrow("activeForkSync.preSyncHead must be a full 40-character SHA");
  });

  it("reads and writes rolling state under git metadata", () => {
    const repo = createTempRepo();
    repo.write("README.md", "base");
    repo.commit("base commit");
    const state = validState();

    const written = writeRollingState(repo.path, state);
    const read = readRollingState(repo.path);
    const expectedPath = path.join(
      repo.path,
      ".git",
      "upstream-preflight",
      "rolling-state.json",
    );

    expect(written).toBe(rollingStatePath(repo.path));
    expect(written).toBe(expectedPath);
    expect(path.isAbsolute(written)).toBe(true);
    expect(fs.existsSync(written)).toBe(true);
    expect(read).toEqual(state);
    expect(repo.git("status", "--short")).toBe("");
  });
});

describe("rolling start", () => {
  it("refuses to start on main with a clear error", () => {
    const { repo, outputDir } = createRepoWithPlan();
    const errors: string[] = [];

    const exitCode = runRollingStartCommand({
      repoPath: repo.path,
      outputDir,
      now: () => "2026-05-09T08:00:00.000Z",
      writeError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain(
      "Refusing to start rolling rebase on main",
    );
  });

  it("writes rolling state from the persisted batch plan on a non-main rebase branch", () => {
    const { repo, outputDir, plan } = createRepoWithPlan();
    const branch = "rebase/upstream-2026-05";
    const output: string[] = [];
    repo.git("checkout", "-b", branch);

    const exitCode = runRollingStartCommand({
      repoPath: repo.path,
      outputDir,
      now: () => "2026-05-09T08:00:00.000Z",
      write: (message) => output.push(message),
    });

    expect(exitCode).toBe(0);
    expect(output.join("\n")).toContain(
      `Started rolling upstream rebase on ${branch}`,
    );
    expect(readRollingState(repo.path, outputDir)).toEqual(
      validStateFromPlan(plan, branch, {
        startedAt: "2026-05-09T08:00:00.000Z",
      }),
    );
  });

  it("refuses to start with a dirty worktree", () => {
    const { repo, outputDir } = createRepoWithPlan();
    const errors: string[] = [];
    repo.git("checkout", "-b", "rebase/upstream-2026-05");
    repo.write("dirty.txt", "dirty");

    const exitCode = runRollingStartCommand({
      repoPath: repo.path,
      outputDir,
      now: () => "2026-05-09T08:00:00.000Z",
      writeError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain("Worktree is dirty");
  });

  it("refuses to overwrite existing rolling state without resume", () => {
    const { repo, outputDir, plan } = createRepoWithPlan();
    const errors: string[] = [];
    repo.git("checkout", "-b", "rebase/upstream-2026-05");
    writeRollingState(repo.path, validStateFromPlan(plan), outputDir);

    const exitCode = runRollingStartCommand({
      repoPath: repo.path,
      outputDir,
      now: () => "2026-05-09T08:00:00.000Z",
      writeError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain("Rolling state already exists");
    expect(errors.join("\n")).toContain("pass --resume");
  });

  it("refuses to start when HEAD does not match the persisted fork head", () => {
    const { repo, outputDir, plan } = createRepoWithPlan({
      forkCommitsAfterStart: 1,
    });
    const errors: string[] = [];
    repo.git("checkout", "-b", "rebase/upstream-2026-05");
    const head = repo.git("rev-parse", "HEAD");

    const exitCode = runRollingStartCommand({
      repoPath: repo.path,
      outputDir,
      now: () => "2026-05-09T08:00:00.000Z",
      writeError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain(
      `HEAD ${head} does not match planned fork head ${plan.metadata.forkHead}`,
    );
  });
});

function validState(overrides: Partial<RollingState> = {}): RollingState {
  return {
    version: 1,
    mode: "rolling-upstream-rebase",
    branch: "rebase/upstream-2026-05",
    upstreamRef: "upstream/main",
    upstreamTargetHead: sha("111111111"),
    forkRef: "origin/main",
    startedForkHead: sha("222222222"),
    integratedForkHead: sha("222222222"),
    startedAt: "2026-05-09T07:30:00.000Z",
    appendHistory: [],
    checkHistory: [],
    ...overrides,
  };
}

function validStateFromPlan(
  plan: BatchPlan,
  branch = "rebase/upstream-2026-05",
  overrides: Partial<RollingState> = {},
): RollingState {
  return validState({
    branch,
    upstreamRef: plan.metadata.upstreamRef,
    upstreamTargetHead: plan.metadata.upstreamHead,
    forkRef: plan.metadata.forkRef,
    startedForkHead: plan.metadata.forkHead,
    integratedForkHead: plan.metadata.forkHead,
    ...overrides,
  });
}

function createRepoWithPlan(
  options: { forkCommitsAfterStart?: number; upstreamCommits?: number } = {},
) {
  const repo = createTempRepo();
  repo.write("README.md", "base");
  const base = repo.commit("base commit");
  repo.git("checkout", "-b", "upstream");

  const upstreamCommits: ClassifiedCommit[] = [];
  for (let index = 1; index <= (options.upstreamCommits ?? 1); index++) {
    repo.write(`upstream-${index}.txt`, `upstream ${index}`);
    const commitSha = repo.commit(`upstream commit ${index}`);
    upstreamCommits.push(classifiedCommit(commitSha, "low"));
  }

  repo.git("checkout", "main");
  repo.write("fork.txt", "fork");
  const forkHead = repo.commit("fork commit (#1)");

  const plan = planBatches(upstreamCommits, {
    metadata: {
      generatedAt: "2026-05-09T07:00:00.000Z",
      mergeBase: base,
      upstreamRef: "upstream",
      upstreamHead: upstreamCommits.at(-1)?.sha ?? base,
      forkRef: "main",
      forkHead,
      manifestForkBaseline: forkHead,
      softCap: 1,
    },
    softCap: 1,
  });

  for (let index = 1; index <= (options.forkCommitsAfterStart ?? 0); index++) {
    repo.write(`fork-after-${index}.txt`, `fork after ${index}`);
    repo.commit(`feat: fork after start ${index} (#${index + 1})`);
  }

  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "rolling-plan-"));
  writeBatchPlanReports(plan, outputDir);
  return { repo, outputDir, plan };
}

function classifiedCommit(
  shaValue: string,
  risk: RiskLevel,
): ClassifiedCommit {
  return {
    sha: shaValue,
    shortSha: shaValue.slice(0, 9),
    subject: `${risk} commit`,
    files: [`upstream/${shaValue.slice(0, 9)}.txt`],
    domains: [],
    overlapFiles: [],
    features: [],
    risk,
    reasons: risk === "high" ? ["Matches risk pattern mobile-drift"] : [],
    requiredChecks: risk === "high" ? ["mobile-drift-rebase-check"] : [],
  };
}

function sha(prefix: string): string {
  return `${prefix}${"0".repeat(40 - prefix.length)}`;
}
