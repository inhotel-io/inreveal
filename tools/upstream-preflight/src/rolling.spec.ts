import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTempRepo } from "../test/fixtures";
import { planBatches, writeBatchPlanReports } from "./batch";
import { getGitPath } from "./git";
import {
  readRollingState,
  renderRollingStatus,
  rollingStatePath,
  runRollingStartCommand,
  runRollingStatusCommand,
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

  it("refuses resume from a branch that does not match rolling state", () => {
    const { repo, outputDir, plan } = createRepoWithPlan();
    const errors: string[] = [];
    repo.git("checkout", "-b", "rebase/upstream-2026-05");
    const state = validStateFromPlan(plan);
    const statePath = rollingStatePath(repo.path, outputDir);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, `${JSON.stringify(state)}\n`);
    const before = fs.readFileSync(statePath, "utf8");
    repo.git("checkout", "-b", "rebase/upstream-2026-06");

    const exitCode = runRollingStartCommand({
      repoPath: repo.path,
      outputDir,
      resume: true,
      now: () => "2026-05-09T10:00:00.000Z",
      writeError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain(
      "Cannot resume rolling rebase on rebase/upstream-2026-06",
    );
    expect(errors.join("\n")).toContain(
      "rolling state is for rebase/upstream-2026-05",
    );
    expect(fs.readFileSync(statePath, "utf8")).toBe(before);
    expect(readRollingState(repo.path, outputDir)).toEqual(state);
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

describe("rolling status", () => {
  it("renders completed upstream batches and pending fork commits", () => {
    const { repo, outputDir, plan } = createRepoWithPlan({
      forkCommitsAfterStart: 2,
    });
    const branch = "rebase/upstream-2026-05";
    repo.git("checkout", "-b", branch, plan.batches[0].tipSha);
    writeRollingState(
      repo.path,
      validStateFromPlan(plan, branch, {
        integratedForkHead: plan.metadata.forkHead,
      }),
      outputDir,
    );

    const output = renderRollingStatus({ repoPath: repo.path, outputDir });

    expect(output).toContain(`Branch: ${branch}`);
    expect(output).toContain(
      `Upstream target: ${plan.metadata.upstreamRef} (${plan.metadata.upstreamHead.slice(0, 9)})`,
    );
    expect(output).toContain("Completed upstream batches: 01 / 01");
    expect(output).toContain(
      `Integrated fork head: main @ ${plan.metadata.forkHead.slice(0, 9)}`,
    );
    expect(output).toContain(
      `Current main: ${repo.git("rev-parse", "main").slice(0, 9)}`,
    );
    expect(output).toContain("Fork commits pending: 2");
    expect(output).toContain("Next action:");
    expect(output).toContain("run make upstream-sync-fork-main");
  });

  it("writes status and returns success", () => {
    const { repo, outputDir, plan } = createRepoWithPlan();
    const output: string[] = [];
    repo.git(
      "checkout",
      "-b",
      "rebase/upstream-2026-05",
      plan.metadata.forkHead,
    );
    writeRollingState(repo.path, validStateFromPlan(plan), outputDir);

    const exitCode = runRollingStatusCommand({
      repoPath: repo.path,
      outputDir,
      write: (message) => output.push(message),
    });

    expect(exitCode).toBe(0);
    expect(output.join("\n")).toContain("Rolling upstream rebase status");
    expect(output.join("\n")).toContain("Completed upstream batches: 00 / 01");
  });

  it("refuses status from a branch that does not match rolling state without rewriting state", () => {
    const { repo, outputDir, plan } = createRepoWithPlan();
    const errors: string[] = [];
    repo.git(
      "checkout",
      "-b",
      "rebase/upstream-2026-05",
      plan.metadata.forkHead,
    );
    const state = validStateFromPlan(plan, "rebase/upstream-2026-05");
    writeRollingState(repo.path, state, outputDir);
    const statePath = rollingStatePath(repo.path, outputDir);
    const before = fs.readFileSync(statePath, "utf8");
    repo.git("checkout", "-b", "rebase/upstream-2026-06");

    const exitCode = runRollingStatusCommand({
      repoPath: repo.path,
      outputDir,
      writeError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain(
      "Cannot render rolling status on rebase/upstream-2026-06",
    );
    expect(errors.join("\n")).toContain(
      "rolling state is for rebase/upstream-2026-05",
    );
    expect(fs.readFileSync(statePath, "utf8")).toBe(before);
    expect(readRollingState(repo.path, outputDir)).toEqual(state);
  });

  it("renders status with a warning when the persisted plan is stale", () => {
    const { repo, outputDir, plan } = createRepoWithPlan();
    const output: string[] = [];
    repo.git(
      "checkout",
      "-b",
      "rebase/upstream-2026-05",
      plan.metadata.forkHead,
    );
    writeRollingState(repo.path, validStateFromPlan(plan), outputDir);
    repo.git("checkout", "upstream");
    repo.write("upstream-new.txt", "new upstream");
    repo.commit("upstream moved");
    repo.git("checkout", "rebase/upstream-2026-05");

    const exitCode = runRollingStatusCommand({
      repoPath: repo.path,
      outputDir,
      write: (message) => output.push(message),
    });

    const status = output.join("\n");
    expect(exitCode).toBe(0);
    expect(status).toContain("Warning: Persisted batch plan is stale");
    expect(status).toContain(
      `Upstream target: ${plan.metadata.upstreamRef} (${plan.metadata.upstreamHead.slice(0, 9)})`,
    );
    expect(status).toContain("Completed upstream batches: 00 / 01");
  });

  it("warns and reports unknown pending fork commits when the fork ref diverged", () => {
    const { repo, outputDir, plan } = createRepoWithPlan();
    repo.git(
      "checkout",
      "-b",
      "rebase/upstream-2026-05",
      plan.metadata.forkHead,
    );
    writeRollingState(repo.path, validStateFromPlan(plan), outputDir);
    repo.git("checkout", "main");
    repo.git("reset", "--hard", plan.metadata.mergeBase);
    repo.write("fork-rewritten.txt", "rewritten fork");
    const rewrittenForkHead = repo.commit("rewrite fork main");
    repo.git("checkout", "rebase/upstream-2026-05");

    const output = renderRollingStatus({ repoPath: repo.path, outputDir });

    expect(output).toContain(
      `Warning: integrated fork head ${plan.metadata.forkHead} is not an ancestor of main (${rewrittenForkHead})`,
    );
    expect(output).toContain("Fork commits pending: unknown");
    expect(output).toContain(
      `Integrated fork head: main @ ${plan.metadata.forkHead.slice(0, 9)}`,
    );
    expect(output).toContain(`Current main: ${rewrittenForkHead.slice(0, 9)}`);
    expect(output).toContain(
      "Next action: inspect fork ref divergence before continuing",
    );
    expect(output).not.toContain("Next action: run make upstream-next-batch");
  });

  it("prioritizes active fork sync continuation over pending fork commits", () => {
    const { repo, outputDir, plan } = createRepoWithPlan({
      forkCommitsAfterStart: 1,
    });
    repo.git(
      "checkout",
      "-b",
      "rebase/upstream-2026-05",
      plan.metadata.forkHead,
    );
    writeRollingState(
      repo.path,
      validStateFromPlan(plan, undefined, {
        activeForkSync: {
          status: "checks-failed",
          from: plan.metadata.forkHead,
          to: repo.git("rev-parse", "main"),
          commits: [repo.git("rev-parse", "main")],
          preSyncHead: plan.metadata.forkHead,
        },
      }),
      outputDir,
    );

    const output = renderRollingStatus({ repoPath: repo.path, outputDir });

    expect(output).toContain("Fork commits pending: 1");
    expect(output).toContain(
      "Next action: run make upstream-sync-fork-main ROLLING_CONTINUE=1",
    );
  });

  it("returns failure and writes an error when rolling state is missing", () => {
    const { repo, outputDir } = createRepoWithPlan();
    const errors: string[] = [];

    const exitCode = runRollingStatusCommand({
      repoPath: repo.path,
      outputDir,
      writeError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain("Missing rolling state");
    expect(errors.join("\n")).toContain(
      "run make upstream-rolling-start first",
    );
  });

  it("exposes rolling status through the package CLI", () => {
    const { repo, outputDir, plan } = createRepoWithPlan();
    repo.git(
      "checkout",
      "-b",
      "rebase/upstream-2026-05",
      plan.metadata.forkHead,
    );
    writeRollingState(repo.path, validStateFromPlan(plan), outputDir);
    const packageDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );

    const output = execFileSync(
      path.join(packageDir, "node_modules", ".bin", "tsx"),
      [
        path.join(packageDir, "src", "index.ts"),
        "rolling-status",
        "--output-dir",
        outputDir,
      ],
      {
        cwd: repo.path,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    expect(output).toContain("Rolling upstream rebase status");
    expect(output).toContain("Completed upstream batches: 00 / 01");
    expect(output).toContain("Next action: run make upstream-next-batch");
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
