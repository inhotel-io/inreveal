import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { Command } from 'bits-ui';
import { init, register, waitLocale } from 'svelte-i18n';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import LiveTypedFilterSection from '../live-typed-filter-section.svelte';

beforeAll(async () => {
  register('en-US', () => import('$i18n/en.json'));
  await init({ fallbackLocale: 'en-US' });
  await waitLocale('en-US');
});

function LiveTypedFilterSectionHost($$anchor: unknown, $$props: Record<string, unknown>) {
  Command.Root($$anchor, {
    children: ($$anchor: unknown) => {
      Command.List($$anchor, {
        children: ($$anchor: unknown) => {
          LiveTypedFilterSection($$anchor, {
            get status() {
              return $$props.status;
            },
            get onSelect() {
              return $$props.onSelect;
            },
          });
        },
        $$slots: { default: true },
      });
    },
    $$slots: { default: true },
  });
}

describe('LiveTypedFilterSection', () => {
  it('renders live choices as filter application rows', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(LiveTypedFilterSectionHost, {
      props: {
        status: {
          status: 'ok',
          key: 'person',
          total: 1,
          items: [
            {
              id: 'person:0:10:p1',
              key: 'person',
              label: 'Anna Maria',
              value: 'Anna Maria',
              tokenStart: 6,
              tokenEnd: 16,
            },
          ],
        },
        onSelect,
      },
    });

    expect(screen.getByText(/person filter matches/i)).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /Anna Maria/i }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ label: 'Anna Maria' }));
  });

  it('applies selected-state styling to live choice rows', () => {
    render(LiveTypedFilterSectionHost, {
      props: {
        status: {
          status: 'ok',
          key: 'person',
          total: 1,
          items: [
            {
              id: 'person:0:10:p1',
              key: 'person',
              label: 'Anna Maria',
              value: 'Anna Maria',
              tokenStart: 6,
              tokenEnd: 16,
            },
          ],
        },
        onSelect: vi.fn(),
      },
    });

    const option = screen.getByRole('option', { name: /Anna Maria/i });
    const row = option.firstElementChild as HTMLElement;
    expect(`${option.className} ${row.className}`).toContain('group-data-[selected]:bg-primary/10');
  });

  it('renders loading empty and error states', async () => {
    const { rerender } = render(LiveTypedFilterSectionHost, {
      props: { status: { status: 'loading', key: 'tag' }, onSelect: vi.fn() },
    });
    expect(screen.getByText(/loading tag matches/i)).toBeInTheDocument();

    await rerender({ status: { status: 'empty', key: 'tag' }, onSelect: vi.fn() });
    expect(screen.getByText(/no matching tags/i)).toBeInTheDocument();

    await rerender({ status: { status: 'error', key: 'tag', message: 'network down' }, onSelect: vi.fn() });
    expect(screen.getByText(/couldn't load tag matches/i)).toBeInTheDocument();
  });

  it('renders secondary labels and timeout state copy', async () => {
    const { rerender } = render(LiveTypedFilterSectionHost, {
      props: {
        status: {
          status: 'ok',
          key: 'city',
          total: 1,
          items: [
            {
              id: 'city:0:8:Berlin',
              key: 'city',
              label: 'Berlin',
              value: 'Berlin',
              secondaryLabel: 'Germany',
              tokenStart: 0,
              tokenEnd: 8,
            },
          ],
        },
        onSelect: vi.fn(),
      },
    });
    expect(screen.getByText('Germany')).toBeInTheDocument();

    await rerender({ status: { status: 'timeout', key: 'city' }, onSelect: vi.fn() });

    expect(screen.getByText(/city matches timed out/i)).toBeInTheDocument();
  });
});
