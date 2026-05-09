import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempRepo } from "../test/fixtures";
import {
  readRollingState,
  rollingStatePath,
  validateRollingState,
  writeRollingState,
} from "./rolling";
import type { RollingState } from "./rolling";

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

function sha(prefix: string): string {
  return `${prefix}${"0".repeat(40 - prefix.length)}`;
}
