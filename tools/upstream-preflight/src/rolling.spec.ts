import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempRepo } from "../test/fixtures";
import { planBatches, writeBatchPlanReports } from "./batch";
import { getGitPath } from "./git";
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

  it("resumes existing rolling state without rewriting it", () => {
    const { repo, outputDir, plan } = createRepoWithPlan();
    const output: string[] = [];
    repo.git("checkout", "-b", "rebase/upstream-2026-05");
    const state = validStateFromPlan(plan, undefined, {
      integratedForkHead: sha("333333333"),
      lastForkSyncAt: "2026-05-09T09:00:00.000Z",
      activeForkSync: {
        status: "checks-failed",
        from: plan.metadata.forkHead,
        to: sha("333333333"),
        commits: [sha("444444444")],
        preSyncHead: sha("555555555"),
      },
      appendHistory: [
        {
          at: "2026-05-09T09:05:00.000Z",
          from: plan.metadata.forkHead,
          to: sha("333333333"),
          commits: [sha("444444444")],
          lastCompletedBatch: "02",
          checks: ["pnpm check"],
        },
      ],
      checkHistory: [
        {
          at: "2026-05-09T09:10:00.000Z",
          phase: "fork-sync",
          commands: ["pnpm check"],
          ok: false,
        },
        {
          at: "2026-05-09T09:15:00.000Z",
          phase: "final",
          commands: ["pnpm test"],
          ok: true,
        },
      ],
    });
    const statePath = rollingStatePath(repo.path, outputDir);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, `${JSON.stringify(state)}\n`);
    const before = fs.readFileSync(statePath, "utf8");

    const exitCode = runRollingStartCommand({
      repoPath: repo.path,
      outputDir,
      resume: true,
      now: () => "2026-05-09T10:00:00.000Z",
      write: (message) => output.push(message),
    });
    const resumedState = readRollingState(repo.path, outputDir);

    expect(exitCode).toBe(0);
    expect(output.join("\n")).toContain(
      "Resumed rolling upstream rebase on rebase/upstream-2026-05",
    );
    expect(fs.readFileSync(statePath, "utf8")).toBe(before);
    expect(resumedState.integratedForkHead).toBe(state.integratedForkHead);
    expect(resumedState.activeForkSync).toEqual(state.activeForkSync);
    expect(resumedState.appendHistory).toEqual(state.appendHistory);
    expect(resumedState.checkHistory).toEqual(state.checkHistory);
  });

  it("refuses resume when rolling state is missing instead of creating new state", () => {
    const { repo, outputDir } = createRepoWithPlan({
      forkCommitsAfterStart: 1,
    });
    const errors: string[] = [];
    repo.git("checkout", "-b", "rebase/upstream-2026-05");
    const statePath = rollingStatePath(repo.path, outputDir);

    const exitCode = runRollingStartCommand({
      repoPath: repo.path,
      outputDir,
      resume: true,
      now: () => "2026-05-09T08:00:00.000Z",
      writeError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain("Missing rolling state");
    expect(errors.join("\n")).toContain(
      "run make upstream-rolling-start first",
    );
    expect(fs.existsSync(statePath)).toBe(false);
  });

  it("refuses to start or resume while a git operation is in progress", () => {
    const { repo, outputDir, plan } = createRepoWithPlan();
    const errors: string[] = [];
    repo.git("checkout", "-b", "rebase/upstream-2026-05");
    const state = validStateFromPlan(plan);
    writeRollingState(repo.path, state, outputDir);
    writeGitControlFile(repo.path, "MERGE_HEAD", `${plan.metadata.forkHead}\n`);

    const exitCode = runRollingStartCommand({
      repoPath: repo.path,
      outputDir,
      resume: true,
      writeError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain("Git operation in progress");
    expect(readRollingState(repo.path, outputDir)).toEqual(state);
  });

  it("refuses to start from a detached HEAD with a clear error", () => {
    const { repo, outputDir, plan } = createRepoWithPlan();
    const errors: string[] = [];
    repo.git("checkout", "--detach", plan.metadata.forkHead);

    const exitCode = runRollingStartCommand({
      repoPath: repo.path,
      outputDir,
      now: () => "2026-05-09T08:00:00.000Z",
      writeError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain("Detached HEAD");
    expect(errors.join("\n")).toContain("rebase branch");
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

function classifiedCommit(shaValue: string, risk: RiskLevel): ClassifiedCommit {
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

function writeGitControlFile(
  repoPath: string,
  gitPath: string,
  content: string,
) {
  const metadataPath = getGitPath(repoPath, gitPath);
  const fullPath = path.isAbsolute(metadataPath)
    ? metadataPath
    : path.resolve(repoPath, metadataPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function sha(prefix: string): string {
  return `${prefix}${"0".repeat(40 - prefix.length)}`;
}
