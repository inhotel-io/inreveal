import { init, register, waitLocale, _, type Translations } from 'svelte-i18n';
import { get } from 'svelte/store';
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// S12.9/F31: 17 count-bearing `admin.face_cleanup_*` keys used bare `{count}` with no ICU plural clause, so
// they rendered "1 clusters" / "1 faces" for an admin whose review queue happened to be down to one.
beforeAll(async () => {
  register('en', () => import('$i18n/en.json'));
  await init({ fallbackLocale: 'en', initialLocale: 'en' });
  await waitLocale('en');
});

const I18N_DIR = path.resolve(process.cwd(), '../i18n');
const en = JSON.parse(fs.readFileSync(path.join(I18N_DIR, 'en.json'), 'utf8')) as { admin: Record<string, string> };

const KEYS = [
  'face_cleanup_confident_count',
  'face_cleanup_footnote_repaired',
  'face_cleanup_footnote_unattributable',
  'face_cleanup_manual_review_move_entire_confirm_body',
  'face_cleanup_review_apply_label',
  'face_cleanup_review_apply_label_added',
  'face_cleanup_review_banner_title',
  'face_cleanup_review_detach_confirm_cta',
  'face_cleanup_review_detach_confirm_title',
  'face_cleanup_review_header_flagged',
  'face_cleanup_review_move_entire_confirm_body',
  'face_cleanup_review_move_entire_confirm_cta',
  'face_cleanup_review_picker_title',
  'face_cleanup_review_rest_staged',
  'face_cleanup_review_rest_title',
  'face_cleanup_review_select_all_flagged',
  'face_cleanup_stat_flagged_sub',
];

// Structural check, applied to every one of the 17: the raw `en.json` message itself must carry an ICU plural
// clause on `count`, not just a bare `{count}` interpolation. This is the check that actually covers all 17 —
// several of them (e.g. "Move all {count}", "{count} flagged") have NO English word that visibly changes
// between singular and plural, so a rendered-text assertion alone cannot tell a fixed key from a broken one
// for those; the raw-message structural check can, and does, for all of them uniformly.
describe('admin.face_cleanup_* count keys carry an ICU plural clause on count (S12.9 structural)', () => {
  it.each(KEYS)('%s', (key) => {
    const message = en.admin[key];
    expect(message, `missing en.json key admin.${key}`).toBeTypeOf('string');
    expect(message).toMatch(/\{count,\s*plural,/);
  });

  // Positive control: a bare, non-plural interpolation (any ordinary `{name}`-style key) must NOT match this
  // pattern — proving the regex itself discriminates rather than matching everything.
  it('does not flag an ordinary non-plural key as having a plural clause (control)', () => {
    expect(en.admin.face_cleanup_resolutions_by_actor ?? 'by {name}').not.toMatch(/\{count,\s*plural,/);
  });
});

// Rendering-level check, for the subset of the 17 whose message contains a noun that visibly changes form
// between singular and plural in English ("face"/"faces", "cluster"/"clusters", "person"/"people", "needs"/
// "need"). The other 5 keys ("Move all {count}", "{count} flagged", "Rest of this cluster ({count})", "Added
// to Apply: {count}", "Select all {count}") have no such word — count 1 vs 2 differ only in the numeral either
// way, so a rendered-text diff can't discriminate a fixed key from a broken one for those; the structural
// check above is what covers them. Word-boundary regexes here, not `toContain`, because "1 cluster" is a
// SUBSTRING of the unfixed "1 clusters" — a plain `toContain` check would pass vacuously on broken output.
const wb = (word: string) => new RegExp(String.raw`\b${word}\b`);

const renderedCases: {
  key: string;
  extra?: Record<string, unknown>;
  singular: RegExp;
  plural: RegExp;
}[] = [
  { key: 'admin.face_cleanup_confident_count', singular: wb('cluster'), plural: wb('clusters') },
  { key: 'admin.face_cleanup_footnote_repaired', singular: wb('face'), plural: wb('faces') },
  { key: 'admin.face_cleanup_footnote_unattributable', singular: wb('face'), plural: wb('faces') },
  {
    key: 'admin.face_cleanup_manual_review_move_entire_confirm_body',
    extra: { name: 'Alice' },
    singular: /all 1 face\b/,
    plural: /all 2 faces\b/,
  },
  { key: 'admin.face_cleanup_review_apply_label', singular: /1 face\b/, plural: /2 faces\b/ },
  {
    key: 'admin.face_cleanup_review_apply_label_added',
    extra: { added: 3 },
    singular: /1 face\b/,
    plural: /2 faces\b/,
  },
  {
    key: 'admin.face_cleanup_review_banner_title',
    singular: /1 face needs\b/,
    plural: /2 faces need\b/,
  },
  { key: 'admin.face_cleanup_review_detach_confirm_cta', singular: /1 face\b/, plural: /2 faces\b/ },
  { key: 'admin.face_cleanup_review_detach_confirm_title', singular: /1 face\b/, plural: /2 faces\b/ },
  {
    key: 'admin.face_cleanup_review_move_entire_confirm_body',
    extra: { owner: 'Berta' },
    singular: /all 1 face\b/,
    plural: /all 2 faces\b/,
  },
  { key: 'admin.face_cleanup_review_picker_title', singular: /1 face\b/, plural: /2 faces\b/ },
  { key: 'admin.face_cleanup_stat_flagged_sub', singular: /1 person\b/, plural: /2 people\b/ },
];

describe('admin.face_cleanup_* count plurals render the correct noun form (S12.9 rendered)', () => {
  it.each(renderedCases)('$key: singular at count 1, plural at count 2', ({ key, extra, singular, plural }) => {
    const $t = get(_);

    const atOne = $t(key as Translations, { values: { count: 1, ...extra } });
    const atTwo = $t(key as Translations, { values: { count: 2, ...extra } });

    // Word-boundary regex, not `toContain`: "1 cluster" is a SUBSTRING of the unfixed "1 clusters", so a
    // plain `toContain` check would pass vacuously on broken (bare-`{count}`) output.
    expect(atOne).toMatch(singular);
    expect(atTwo).toMatch(plural);
    // The bug this guards against directly: bare `{count}` renders the SAME (always-plural) noun form at
    // count 1, so the singular pattern must NOT also match the count=1 render if it were still broken —
    // i.e. this positive/negative pair only both pass once the ICU clause exists.
    expect(atOne).not.toMatch(plural);
  });

  // Positive control: a key that was ALREADY correctly pluralized before this slice (not one of the 17) must
  // keep working exactly as it did — this isn't a rewrite of every plural in the file, only the 17 broken ones.
  it('leaves an already-correct plural key (not one of the 17) working', () => {
    const $t = get(_);
    expect($t('admin.face_cleanup_apply_success', { values: { count: 1 } })).toMatch(/1 person\b/);
    expect($t('admin.face_cleanup_apply_success', { values: { count: 2 } })).toMatch(/2 people\b/);
  });
});
