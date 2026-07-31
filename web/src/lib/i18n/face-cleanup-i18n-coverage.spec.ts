import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Three things the existing i18n guards cannot see, all of which this feature can get wrong:
//
// I6  fork-string-parity derives its key set from "at least one of the nine has it", so a key translated into
//     NONE of the nine is simply not a fork string and passes silently. This asserts presence directly.
// I3b parity only detects a key MISSING from a locale that others still have — never a LEFTOVER. A stale
//     `face_cleanup_manual_review_bulk_move` in one locale is invisible to every existing test.
// I7  no guard can see that a reworded English value left its nine translations describing the old wording.
//     A test cannot diff against a value the file no longer holds, so this checks the old shape instead.

const I18N_DIR = path.resolve(process.cwd(), '../i18n');
const TRANSLATED = ['de', 'es', 'fr', 'it', 'nl', 'pl', 'ru', 'zh_Hans', 'zh_Hant'];

const admin = (code: string): Record<string, string> =>
  (JSON.parse(fs.readFileSync(path.join(I18N_DIR, `${code}.json`), 'utf8')) as { admin: Record<string, string> }).admin;

const NEW_KEYS = [
  'face_cleanup_action_detach_tip',
  'face_cleanup_action_keep_tip',
  'face_cleanup_action_lock_tip',
  'face_cleanup_action_other_tip',
  'face_cleanup_action_owner_tip',
  'face_cleanup_action_stay_tip',
  'face_cleanup_action_unknown_tip',
  'face_cleanup_action_unmark_tip',
  'face_cleanup_intro_actions_body',
  'face_cleanup_intro_actions_title',
  'face_cleanup_intro_lead',
  'face_cleanup_intro_manual_body',
  'face_cleanup_intro_manual_title',
  'face_cleanup_intro_scan_body',
  'face_cleanup_intro_scan_title',
  'face_cleanup_review_bulk_hint_default',
  'face_cleanup_review_bulk_hint_effect',
];

const REMOVED_KEYS = [
  'face_cleanup_mode_first_visit_intro',
  'face_cleanup_manual_review_bulk_move',
  'face_cleanup_manual_review_bulk_lock',
  'face_cleanup_manual_review_bulk_unknown',
];

describe('face cleanup i18n coverage', () => {
  // I6
  it.each(['en', ...TRANSLATED])('%s carries every new face-cleanup string', (code) => {
    const messages = admin(code);
    const missing = NEW_KEYS.filter((key) => !Object.hasOwn(messages, key));

    expect(missing, `${code}.json is missing: ${missing.join(', ')}`).toEqual([]);
  });

  // I3b
  it.each(['en', ...TRANSLATED])('%s has dropped every retired face-cleanup string', (code) => {
    const messages = admin(code);
    const leftover = REMOVED_KEYS.filter((key) => Object.hasOwn(messages, key));

    expect(leftover, `${code}.json still carries: ${leftover.join(', ')}`).toEqual([]);
  });

  // I7 — the reworded labels dropped their arrow/slash shape in every locale, not just English.
  it.each(['en', ...TRANSLATED])('%s rewords the harmonised bulk labels rather than keeping the old shape', (code) => {
    const messages = admin(code);

    expect(messages.face_cleanup_review_bulk_owner).not.toContain('→');
    expect(messages.face_cleanup_review_bulk_other).not.toContain('→');
    expect(messages.face_cleanup_review_bulk_lock).not.toContain('/');
  });

  // The ICU argument names must survive translation verbatim, or svelte-i18n prints literal braces.
  it.each(['en', ...TRANSLATED])('%s keeps the hint row’s ICU argument names untranslated', (code) => {
    const hint = admin(code).face_cleanup_review_bulk_hint_effect;

    expect(hint).toContain('{action}');
    expect(hint).toContain('{effect}');
  });
});
