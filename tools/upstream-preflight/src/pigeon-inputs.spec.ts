import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

// Repo-invariant guard for Slice 21 (finding LOW#23).
//
// `.github/workflows/gallery-build-mobile.yml` has a "Generate platform APIs" step
// (once in the Android build job, once in the iOS build job) that regenerates the
// pigeon host APIs. It used to hardcode one `dart run pigeon --input pigeon/<file>.dart`
// line per host API, and that list drifted out of sync with `mobile/pigeon/*.dart`
// (upstream added `permission_api.dart` and `view_intent_api.dart`, which were then
// silently never regenerated in CI).
//
// The step now globs `pigeon/*.dart` instead, so the drift is structurally impossible.
// This guard keeps it that way: it fails if a step goes back to enumerating inputs
// (an enumerated list must still cover every `mobile/pigeon/*.dart` file exactly).

const REPO_ROOT = path.resolve(process.cwd(), '../..');
const PIGEON_DIR = path.join(REPO_ROOT, 'mobile/pigeon');
const WORKFLOW_PATH = path.join(
  REPO_ROOT,
  '.github/workflows/gallery-build-mobile.yml',
);

const PIGEON_INPUT_LINE = /dart run pigeon --input pigeon\/([\w-]+\.dart)/g;
const PIGEON_GLOB = /pigeon\/\*\.dart/;

interface WorkflowStep {
  name?: string;
  run?: string;
}

interface WorkflowJob {
  steps?: WorkflowStep[];
}

interface Workflow {
  jobs?: Record<string, WorkflowJob>;
}

function listPigeonFiles(): Set<string> {
  return new Set(
    fs.readdirSync(PIGEON_DIR).filter((name) => name.endsWith('.dart')),
  );
}

function parsePigeonInputs(run: string): string[] {
  return [...run.matchAll(PIGEON_INPUT_LINE)].map((match) => match[1]);
}

function findGeneratePlatformApiSteps(
  workflow: Workflow,
): { job: string; step: WorkflowStep }[] {
  const found: { job: string; step: WorkflowStep }[] = [];

  for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      if (step.name === 'Generate platform APIs') {
        found.push({ job: jobName, step });
      }
    }
  }

  return found;
}

describe('gallery-build-mobile.yml pigeon inputs', () => {
  const pigeonFiles = listPigeonFiles();
  const workflow = YAML.parse(
    fs.readFileSync(WORKFLOW_PATH, 'utf8'),
  ) as Workflow;
  const steps = findGeneratePlatformApiSteps(workflow);

  it('finds at least one "Generate platform APIs" step', () => {
    expect(steps.length).toBeGreaterThan(0);
  });

  it.each(steps.map(({ job }, index) => [index, job] as const))(
    'step #%d (job "%s") covers every mobile/pigeon/*.dart',
    (index) => {
      const { job, step } = steps[index];
      const run = step.run ?? '';
      const inputs = parsePigeonInputs(run);

      if (inputs.length === 0) {
        expect(
          PIGEON_GLOB.test(run),
          `job "${job}": neither a pigeon/*.dart glob nor "dart run pigeon --input ..." lines found`,
        ).toBe(true);
        return;
      }

      const inputSet = new Set(inputs);
      const missing = [...pigeonFiles].filter((file) => !inputSet.has(file));
      const stale = inputs.filter((file) => !pigeonFiles.has(file));
      const duplicates = inputs.filter((file, i) => inputs.indexOf(file) !== i);

      expect(
        missing,
        `job "${job}" is missing pigeon inputs: ${missing.join(', ')}`,
      ).toEqual([]);
      expect(
        stale,
        `job "${job}" lists stale/non-existent pigeon inputs: ${stale.join(', ')}`,
      ).toEqual([]);
      expect(
        duplicates,
        `job "${job}" lists duplicate pigeon inputs: ${duplicates.join(', ')}`,
      ).toEqual([]);
    },
  );
});
