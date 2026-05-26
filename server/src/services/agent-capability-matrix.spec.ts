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

  it('documents explicit batch asset metadata edits as solid while place-name geocoding remains missing', () => {
    const markdown = readMatrix();

    const metadataEditRow = markdown.split('\n').find((line) => line.includes('Batch asset metadata edits'));
    expect(metadataEditRow).toBeDefined();
    expect(metadataEditRow).toContain('Solid now');
    expect(metadataEditRow).toContain('asset.updateMetadata');
    expect(metadataEditRow).toContain('description');
    expect(metadataEditRow).toContain('rating');
    expect(metadataEditRow).toContain('date/time');
    expect(metadataEditRow).toContain('timezone');
    expect(metadataEditRow).toContain('latitude/longitude');
    expect(metadataEditRow).toMatch(/ask.*coordinates|coordinates.*ask/i);

    for (const prompt of [
      'Set the description on the 5 newest photos to Test batch.',
      'Clear the rating from this album.',
      'Shift these scanned photos forward by 2 hours.',
      'Set these photos to latitude 48.8566 and longitude 2.3522.',
      'Set these photos to Paris.',
    ]) {
      expect(markdown).toContain(prompt);
    }

    const needsNewToolHeadingIndex = markdown.indexOf('## Needs New MCP Tool');
    expect(needsNewToolHeadingIndex).not.toBe(-1);
    const needsNewToolSection = markdown.slice(needsNewToolHeadingIndex);
    expect(needsNewToolSection).not.toContain('| Metadata edits ');
    expect(needsNewToolSection).toContain('Place-name-to-coordinate metadata edits');
    expect(needsNewToolSection).toMatch(/forward geocoder|geocod/i);
  });

  it('keeps bounded highlight curation planned while quality scoring remains a new-tool gap', () => {
    const markdown = readMatrix();

    const bestPhotosRow = markdown.split('\n').find((line) => line.includes('“Best photos” curation'));

    expect(bestPhotosRow).toBeDefined();
    expect(bestPhotosRow).toContain('planned implementation');
    expect(bestPhotosRow).toMatch(/Constrained now|behind implementation|not solid/i);
    expect(bestPhotosRow).not.toContain('Solid now');

    const needsNewToolHeadingIndex = markdown.indexOf('## Needs New MCP Tool');
    expect(needsNewToolHeadingIndex).not.toBe(-1);

    const needsNewToolSection = markdown.slice(needsNewToolHeadingIndex);
    expect(needsNewToolSection).toContain('Image quality scoring');
    expect(needsNewToolSection).toContain('analyzeAssetQuality');
    expect(needsNewToolSection).toMatch(/quality scoring/i);
  });
});
