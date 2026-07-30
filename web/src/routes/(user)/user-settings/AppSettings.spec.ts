import '@testing-library/jest-dom';
import { screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { get } from 'svelte/store';
import { cropFacesFromAsset } from '$lib/stores/preferences.store';
import { renderWithTooltips } from '$tests/helpers';
import AppSettings from './AppSettings.svelte';

describe('AppSettings — crop faces switch', () => {
  beforeEach(() => {
    cropFacesFromAsset.set(true);
    // happy-dom does not implement window.visualViewport; SettingsLanguageSelector renders a
    // Combobox that reads the bare global identifier unconditionally, which throws a
    // ReferenceError (not just `undefined`) before optional chaining ever runs, and also wires up
    // resize/scroll listeners on it.
    vi.stubGlobal('visualViewport', {
      height: 800,
      width: 800,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  // The test harness's svelte-i18n instance (see src/test-data/setup.ts) is initialised with
  // fallbackLocale: 'dev' and no registered dictionaries, so $t() resolves to the raw key rather
  // than translated English text — the same convention FeatureSettings.spec.ts relies on when it
  // matches `name: 'memory_type_on_this_day'` verbatim.
  it('reflects the store when cropping is on', () => {
    renderWithTooltips(AppSettings, {});
    expect(screen.getByRole('switch', { name: 'crop_faces_from_photo' })).toBeChecked();
  });

  it('writes false to the store when switched off', async () => {
    renderWithTooltips(AppSettings, {});

    await userEvent.click(screen.getByRole('switch', { name: 'crop_faces_from_photo' }));

    expect(get(cropFacesFromAsset)).toBe(false);
  });

  it('reflects an already-off store on mount', () => {
    cropFacesFromAsset.set(false);
    renderWithTooltips(AppSettings, {});
    expect(screen.getByRole('switch', { name: 'crop_faces_from_photo' })).not.toBeChecked();
  });
});
