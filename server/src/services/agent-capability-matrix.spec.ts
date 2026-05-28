import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readMatrix = () =>
  readFileSync(resolve(process.cwd(), '../docs/superpowers/specs/2026-05-19-pi-agent-capability-matrix.md'), 'utf8');

const sectionBetween = (markdown: string, startHeading: string, endHeading: string) => {
  const start = markdown.indexOf(startHeading);
  expect(start).not.toBe(-1);
  const end = markdown.indexOf(endHeading, start + startHeading.length);
  expect(end).not.toBe(-1);
  return markdown.slice(start, end);
};

describe('Pi agent capability matrix', () => {
  it('documents completed search filter parity and acceptance prompts', () => {
    const markdown = readMatrix();
    const coreMatrix = sectionBetween(markdown, '## Core Capability Matrix', '## High-Value Constrained Capabilities');

    expect(markdown).toContain('Smart, OCR, description, filename, and metadata search');
    expect(markdown).toContain('resolveAssetSearchFilters');

    const naturalLanguageFilteredSearchRow = coreMatrix
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
    const coreMatrix = sectionBetween(markdown, '## Core Capability Matrix', '## High-Value Constrained Capabilities');

    const metadataEditRow = coreMatrix.split('\n').find((line) => line.includes('Batch asset metadata edits'));
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

  it('documents bounded highlight curation as solid while quality scoring remains a new-tool gap', () => {
    const markdown = readMatrix();
    const constrainedMatrix = sectionBetween(
      markdown,
      '## High-Value Constrained Capabilities',
      '## Needs New MCP Tool',
    );

    const bestPhotosRow = constrainedMatrix.split('\n').find((line) => line.includes('“Best photos” curation'));

    expect(bestPhotosRow).toBeDefined();
    expect(bestPhotosRow).toContain('Solid now for bounded sources');
    expect(bestPhotosRow).toMatch(/bounded candidates/i);
    expect(bestPhotosRow).toMatch(/ratings|favorites|metadata|previews/i);
    expect(bestPhotosRow).toMatch(/not quality scoring|not objective/i);
    expect(bestPhotosRow).not.toContain('planned implementation');

    const visualCleanupRow = constrainedMatrix.split('\n').find((line) => line.includes('Visual cleanup'));
    expect(visualCleanupRow).toBeDefined();
    expect(visualCleanupRow).toContain('Constrained now');

    for (const prompt of [
      'Suggest 5 highlights from this album and make an album called Highlights.',
      'Favorite the best 3 photos from last weekend.',
      'Pick a cover from this album.',
      'Pick the best photos from my library.',
      'Suggest 20 highlights from this album.',
      'Suggest highlights from last weekend.',
    ]) {
      expect(markdown).toContain(prompt);
    }

    const needsNewToolHeadingIndex = markdown.indexOf('## Needs New MCP Tool');
    expect(needsNewToolHeadingIndex).not.toBe(-1);

    const needsNewToolSection = markdown.slice(needsNewToolHeadingIndex);
    expect(needsNewToolSection).toContain('Image quality scoring');
    expect(needsNewToolSection).toContain('analyzeAssetQuality');
    expect(needsNewToolSection).toMatch(/quality scoring/i);
  });

  it('documents strict, hybrid, and open flow ownership for Pi capabilities', () => {
    const markdown = readMatrix();

    expect(markdown).toContain('## Flow Ownership Matrix');
    const flowSection = markdown.slice(markdown.indexOf('## Flow Ownership Matrix'));

    const recentTripRow = flowSection.split('\n').find((line) => line.includes('Create recent trip album'));
    expect(recentTripRow).toBeDefined();
    expect(recentTripRow).toContain('Strict');
    expect(recentTripRow).toContain('create_recent_trip_album');

    const searchRow = flowSection.split('\n').find((line) => line.includes('Natural-language filtered search'));
    expect(searchRow).toBeDefined();
    expect(searchRow).toContain('Open read flow');

    const highlightsRow = flowSection.split('\n').find((line) => line.includes('“Best photos” curation'));
    expect(highlightsRow).toBeDefined();
    expect(highlightsRow).toContain('Hybrid');

    expect(flowSection).toMatch(/no claimed plan unless a persisted plan id\s+exists/);
    expect(flowSection).toContain('selection handles for asset sets');
  });
});
