import { contrastRatio } from '$lib/styles/contrast';
import { readThemeTokens } from '$lib/styles/theme-tokens';

describe('gallery-theme.css', () => {
  const t = readThemeTokens();

  it('defines a light and a dark token block', () => {
    expect(Object.keys(t.light).length).toBeGreaterThan(0);
    expect(Object.keys(t.dark).length).toBeGreaterThan(0);
  });
});

describe('L1 accent', () => {
  const t = readThemeTokens();
  const PRIMARY = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => `--immich-ui-primary-${s}`);

  it('defines the full primary ramp in both modes', () => {
    for (const name of PRIMARY) {
      expect(t.light[name], `light ${name}`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.dark[name], `dark ${name}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it('defines legacy primary aliases (mode-agnostic, in light block)', () => {
    expect(t.light['--immich-primary']).toBeDefined();
    expect(t.light['--immich-dark-primary']).toBeDefined();
  });
  it('tonal text pair meets AA (on-container navy on container, light)', () => {
    expect(
      contrastRatio(t.light['--immich-ui-primary-950'], t.light['--immich-ui-primary-200']),
    ).toBeGreaterThanOrEqual(4.5);
  });
  it('solid accent reads on light surface (UI >= 3:1)', () => {
    expect(contrastRatio(t.light['--immich-ui-primary-600'], '#ffffff')).toBeGreaterThanOrEqual(3);
  });
  // NOTE: the dark-mode tonal active state uses `bg-primary/10` (opacity over
  // surface), which solid-token contrast math can't model — it is covered by the
  // axe scan in Task 8, intentionally not by a fast unit test here.
});
