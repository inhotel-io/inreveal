import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import { beforeAll, describe, expect, it } from 'vitest';
import ScanChecklist from './ScanChecklist.svelte';

// The post-scan console throws five stat cards, four filters, a search box, a pre-selected bulk bar and a
// grouped table at the admin without ever saying what to do — and never mentions that the confident clusters
// are ALREADY selected, so the biggest button on the page re-attributes them all in one click. This checklist
// is that missing guidance, and it doubles as progress (see the design doc). Rendered against the REAL en.json
// so a missing or renamed key fails the test instead of silently rendering the key.
beforeAll(async () => {
  register('en', () => import('$i18n/en.json'));
  await init({ fallbackLocale: 'en', initialLocale: 'en' });
  await waitLocale('en');
});

const props = (over: Partial<Record<string, unknown>> = {}) => ({
  reviewFirstTotal: 16,
  reviewFirstOpened: 3,
  confidentTotal: 90,
  selectedCount: 90,
  ...over,
});

describe('ScanChecklist', () => {
  it('leads with what to do now, not with what the feature is', () => {
    render(ScanChecklist, { props: props() });

    expect(screen.getByText('What to do now')).toBeInTheDocument();
  });

  it('step 1: shows how many need a decision and how far through them you are', () => {
    render(ScanChecklist, { props: props() });

    const step = screen.getByTestId('step-review');
    expect(step).toHaveTextContent('16');
    expect(step).toHaveTextContent('3 of 16 opened');
    expect(step).not.toHaveAttribute('data-done', 'true');
  });

  it('step 1: completes once every review-first cluster has been opened', () => {
    render(ScanChecklist, { props: props({ reviewFirstOpened: 16 }) });

    expect(screen.getByTestId('step-review')).toHaveAttribute('data-done', 'true');
  });

  it('step 1: completes when the scan flagged none for review at all', () => {
    render(ScanChecklist, { props: props({ reviewFirstTotal: 0, reviewFirstOpened: 0 }) });

    expect(screen.getByTestId('step-review')).toHaveAttribute('data-done', 'true');
  });

  // The whole point of step 2: the page pre-selects the confident clusters and never says so.
  it('step 2: states that the confident clusters are already selected', () => {
    render(ScanChecklist, { props: props() });

    const step = screen.getByTestId('step-confident');
    expect(step).toHaveTextContent('90');
    expect(step).not.toHaveAttribute('data-inactive', 'true');
  });

  it('step 2: goes inactive when the scan produced no confident clusters', () => {
    render(ScanChecklist, { props: props({ confidentTotal: 0, selectedCount: 0 }) });

    expect(screen.getByTestId('step-confident')).toHaveAttribute('data-inactive', 'true');
  });

  it('step 3: counts what the commit will actually re-attribute', () => {
    render(ScanChecklist, { props: props({ selectedCount: 42 }) });

    const step = screen.getByTestId('step-apply');
    expect(step).toHaveTextContent('42');
    expect(step).not.toHaveAttribute('data-inactive', 'true');
  });

  it('step 3: goes inactive when nothing is selected — there is nothing to commit', () => {
    render(ScanChecklist, { props: props({ selectedCount: 0 }) });

    expect(screen.getByTestId('step-apply')).toHaveAttribute('data-inactive', 'true');
  });

  // The checklist tells you what to do; the filter toolbar is what you act with. A button here that merely
  // flipped the "Review first" chip read as navigation, and its effect landed far below the fold — so it looked
  // broken. The checklist stays purely informational.
  it('is guidance, not a control surface — it offers no buttons of its own', () => {
    render(ScanChecklist, { props: props() });

    expect(screen.getByTestId('scan-checklist').querySelector('button')).toBeNull();
  });
});
