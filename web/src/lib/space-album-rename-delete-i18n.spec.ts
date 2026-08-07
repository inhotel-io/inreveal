import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)); // web/src/lib
const i18nDir = path.resolve(here, '../../../i18n'); // repo-root/i18n

const LOCALES = ['en', 'de', 'es', 'fr', 'it', 'nl', 'pl', 'ru', 'zh_Hans', 'zh_Hant'];
const REQUIRED_KEYS = [
  'space_album_rename',
  'space_album_name_label',
  'space_album_delete',
  'space_album_delete_confirm',
  'space_album_bulk_delete_title',
  'space_album_bulk_delete_confirm',
  'space_album_error_rename',
  'space_album_error_delete',
  'spaces_activity_renamed_album',
  'spaces_activity_deleted_album',
  'spaces_activity_bulk_deleted_albums',
];

const load = (locale: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(i18nDir, `${locale}.json`), 'utf8'));

describe('i18n coverage for space album rename/delete', () => {
  for (const locale of LOCALES) {
    it(`${locale}.json contains all required keys`, () => {
      const messages = load(locale);
      for (const key of REQUIRED_KEYS) {
        expect(messages[key], `${key} missing in ${locale}.json`).toBeTypeOf('string');
      }
    });
  }
});
