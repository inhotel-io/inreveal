import { render, screen } from '@testing-library/svelte';

import DemoInstallBanner from './demo-install-banner.svelte';

describe('DemoInstallBanner', () => {
  it('renders a persistent install CTA when visible', () => {
    render(DemoInstallBanner, { visible: true });

    const banner = screen.getByRole('region', { name: 'Demo install prompt' });
    expect(banner).toBeInTheDocument();

    const link = screen.getByRole('link', { name: 'Install your own \u2192' });
    expect(link).toHaveAttribute(
      'href',
      'https://opennoodle.de/install?utm_source=demo.opennoodle.de&utm_medium=banner&utm_campaign=demo_install_banner',
    );
  });

  it('does not render when hidden', () => {
    render(DemoInstallBanner, { visible: false });

    expect(screen.queryByRole('region', { name: 'Demo install prompt' })).not.toBeInTheDocument();
  });
});
