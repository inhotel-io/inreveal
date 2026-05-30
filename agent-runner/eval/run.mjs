// Eval harness CLI.
//
//   node eval/run.mjs                 run all L1 scenarios, print scorecard
//   node eval/run.mjs --filter trip   only scenarios whose id/category contains "trip"
//   node eval/run.mjs --runs 5        override repeats per LLM scenario
//   node eval/run.mjs --mode regex    force router mode (regex|llm|hybrid)
//   node eval/run.mjs --diff          compare against eval/baseline.json
//   node eval/run.mjs --accept        write the current scorecard as the baseline
//   node eval/run.mjs --json          also write eval/results/<iso>.json
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import config from './config.mjs';
import scenarios from './scenarios/index.mjs';
import { createL1Driver } from './drivers/l1-component.mjs';
import { evalScenario, aggregate, renderScorecard, diffBaseline, toBaseline } from './score.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const filter = opt('filter');
const runs = Number(opt('runs', config.runs));
const routerMode = opt('mode', config.routerMode);
const selected = filter ? scenarios.filter((s) => s.id.includes(filter) || s.category === filter) : scenarios;

const log = (...m) => process.stderr.write(`${m.join(' ')}\n`);

const checkConnectivity = async () => {
  try {
    const res = await fetch(`${config.llama.baseUrl}/models`, { headers: { Authorization: `Bearer ${config.llama.secret}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (error) {
    log(`\n✖ Cannot reach the model server at ${config.llama.baseUrl}`);
    log(`  ${error?.message ?? error}`);
    log(`  Start your local server or set EVAL_LLAMA_URL / EVAL_LLAMA_MODEL.\n`);
    process.exit(2);
  }
};

const main = async () => {
  await checkConnectivity();
  const driver = createL1Driver({ llama: config.llama, routerMode });
  const meta = { model: driver.model, baseUrl: driver.baseUrl, routerMode, runs };

  log(`Running ${selected.length} scenarios (runs<=${runs}, router=${routerMode}) against ${driver.model}...`);
  const results = [];
  let done = 0;
  for (const sc of selected) {
    results.push(await evalScenario(driver, sc, runs));
    done++;
    if (done % 10 === 0 || done === selected.length) log(`  ${done}/${selected.length}`);
  }

  const agg = aggregate(results);
  const scorecard = renderScorecard(agg, results, meta);
  process.stdout.write(`${scorecard}\n`);

  const baselinePath = join(here, 'baseline.json');
  if (flag('diff')) {
    if (existsSync(baselinePath)) {
      const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
      process.stdout.write(`${diffBaseline(agg, baseline)}\n`);
    } else {
      log('No baseline.json yet; run with --accept to create one.');
    }
  }
  if (flag('accept')) {
    writeFileSync(baselinePath, `${JSON.stringify(toBaseline(agg, meta), null, 2)}\n`);
    log(`Wrote baseline: ${baselinePath}`);
  }
  if (flag('json')) {
    const dir = join(here, 'results');
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const out = join(dir, `${stamp}.json`);
    writeFileSync(out, `${JSON.stringify({ meta, agg, results }, null, 2)}\n`);
    log(`Wrote results: ${out}`);
  }

  // Non-zero exit if any scenario failed, so the harness is CI/script friendly.
  process.exit(agg.passedCount === agg.total ? 0 : 1);
};

main().catch((error) => {
  log(`eval failed: ${error?.stack ?? error}`);
  process.exit(2);
});
