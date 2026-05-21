import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readMatrix = () =>
  readFileSync(resolve(process.cwd(), '../docs/superpowers/specs/2026-05-19-pi-agent-capability-matrix.md'), 'utf8');

describe('Pi agent capability matrix', () => {
  it('documents completed search filter parity and acceptance prompts', () => {
    const markdown = readMatrix();

    expect(markdown).toContain('Smart, OCR, description, filename, and metadata search');
    expect(markdown).toContain('resolveAssetSearchFilters');

    const naturalLanguageFilteredSearchRow = markdown
      .split('\n')
      .find((line) => line.includes('Natural-language filtered search'));
    expect(naturalLanguageFilteredSearchRow).toContain('Solid now');

    for (const prompt of [
      'Find photos of Alex in Berlin from last summer that are not in any album.',
      'Create an album from 5-star videos from Japan.',
      'Find screenshots from 2024 that mention invoices.',
      'Add beach sunset photos from the Family space to a new album.',
      'Find photos taken with my Sony camera in May.',
    ]) {
      expect(markdown).toContain(prompt);
    }

    const needsNewToolHeadingIndex = markdown.indexOf('## Needs New MCP Tool');
    expect(needsNewToolHeadingIndex).not.toBe(-1);

    const needsNewToolSection = markdown.slice(needsNewToolHeadingIndex);
    expect(needsNewToolSection).not.toContain('Natural-language semantic search');
    expect(needsNewToolSection).not.toContain('Large-library pagination');
    expect(markdown).toContain('semantic duplicate cleanup or quality scoring');
  });
});
