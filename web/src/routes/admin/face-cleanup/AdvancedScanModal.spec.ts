import { getFaceRepairScanDefaults } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import AdvancedScanModal from './AdvancedScanModal.svelte';

vi.mock('@immich/sdk', () => ({ getFaceRepairScanDefaults: vi.fn() }));

const mockDefaults = (v: { maxDistance: number; minFaces: number; maxFlaggedFraction: number }) =>
  vi.mocked(getFaceRepairScanDefaults).mockResolvedValue(v);

beforeAll(async () => {
  register('en', () => import('$i18n/en.json'));
  await init({ fallbackLocale: 'en', initialLocale: 'en' });
  await waitLocale('en');
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
});

describe('AdvancedScanModal', () => {
  beforeEach(() => vi.mocked(getFaceRepairScanDefaults).mockReset());

  it('pre-fills the controls from the defaults endpoint', async () => {
    mockDefaults({ maxDistance: 0.5, minFaces: 3, maxFlaggedFraction: 0.5 });
    render(AdvancedScanModal, { props: { onClose: vi.fn(), onRun: vi.fn() } });
    expect(await screen.findByDisplayValue('3')).toBeInTheDocument();
  });

  it('submits numeric params (not strings) and closes', async () => {
    mockDefaults({ maxDistance: 0.5, minFaces: 3, maxFlaggedFraction: 0.5 });
    const onRun = vi.fn();
    const onClose = vi.fn();
    render(AdvancedScanModal, { props: { onClose, onRun } });
    await screen.findByDisplayValue('3');

    // Submit the form directly: bits-ui Dialog.Portal mounts content via a secondary
    // Svelte.mount() into document.body.  In happy-dom the button's `form` attribute
    // association is not resolved for portal-mounted elements (isConnected check), so
    // clicking the submit button does not trigger requestSubmit.  Firing submit on the
    // form element is the correct testing-library pattern for dialogs.
    await fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => {
      expect(onRun).toHaveBeenCalledTimes(1);
      const arg = onRun.mock.calls[0][0];
      expect(typeof arg.maxDistance).toBe('number');
      expect(typeof arg.minFaces).toBe('number');
      expect(typeof arg.maxFlaggedFraction).toBe('number');
      expect(arg).toEqual({ maxDistance: 0.5, minFaces: 3, maxFlaggedFraction: 0.5 });
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('falls back to safe defaults when the defaults endpoint fails', async () => {
    // The component swallows the rejection internally (then(onFulfilled, onRejected)).
    // However, Svelte's flushSync processes onMount synchronously and Node.js emits
    // 'unhandledRejection' before the microtask checkpoint at which our handler would
    // be recognised.  Vitest's catchError skips the failure when there is more than
    // one 'unhandledRejection' listener — adding a no-op is the documented escape hatch.
    const suppressUnhandled = () => {};
    process.on('unhandledRejection', suppressUnhandled);

    vi.mocked(getFaceRepairScanDefaults).mockRejectedValue(new Error('boom'));
    render(AdvancedScanModal, { props: { onClose: vi.fn(), onRun: vi.fn() } });
    await waitFor(() => expect(screen.getByDisplayValue('3')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Run scan' })).toBeInTheDocument();

    process.off('unhandledRejection', suppressUnhandled);
  });
});
