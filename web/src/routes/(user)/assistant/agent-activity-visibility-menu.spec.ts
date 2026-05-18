import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'svelte';
import { readable } from 'svelte/store';
import AgentActivityVisibilityMenu from './agent-activity-visibility-menu.svelte';

vi.mock('svelte-i18n', () => {
  const messages: Record<string, string> = {
    assistant_activity_visibility: 'Activity preview',
    assistant_activity_visibility_compact: 'Compact',
    assistant_activity_visibility_expanded: 'Expanded',
    assistant_activity_visibility_menu: 'Activity preview options',
    assistant_activity_visibility_off: 'Off',
  };

  return { t: readable((key: string) => messages[key] ?? key) };
});

const renderMenu = (props: Partial<ComponentProps<typeof AgentActivityVisibilityMenu>> = {}) => {
  const onModeChange = vi.fn();

  render(AgentActivityVisibilityMenu, {
    props: {
      mode: 'compact',
      onModeChange,
      ...props,
    },
  });

  return { onModeChange };
};

describe(AgentActivityVisibilityMenu.name, () => {
  it('renders an accessible collapsed trigger with the current mode', () => {
    renderMenu();

    const trigger = screen.getByRole('button', { name: /Activity preview/i });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('Compact');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitemradio', { name: 'Off' })).not.toBeInTheDocument();
  });

  it.each([
    ['Off', 'off'],
    ['Compact', 'compact'],
    ['Expanded', 'expanded'],
  ] as const)('selects %s, closes, and returns focus to the trigger', async (label, mode) => {
    const user = userEvent.setup();
    const { onModeChange } = renderMenu({ mode: 'compact' });

    const trigger = screen.getByRole('button', { name: /Activity preview/i });
    await user.click(trigger);

    const menu = screen.getByRole('menu', { name: 'Activity preview options' });
    expect(within(menu).getByRole('menuitemradio', { name: 'Compact' })).toHaveAttribute('aria-checked', 'true');

    await user.click(within(menu).getByRole('menuitemradio', { name: label }));

    expect(onModeChange).toHaveBeenCalledWith(mode);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes on Escape without changing mode', async () => {
    const user = userEvent.setup();
    const { onModeChange } = renderMenu();

    const trigger = screen.getByRole('button', { name: /Activity preview/i });
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(onModeChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('opens from Enter and moves focus with arrow keys', async () => {
    const user = userEvent.setup();
    renderMenu({ mode: 'compact' });

    const trigger = screen.getByRole('button', { name: /Activity preview/i });
    trigger.focus();
    await user.keyboard('{Enter}');

    const menu = screen.getByRole('menu', { name: 'Activity preview options' });
    const off = within(menu).getByRole('menuitemradio', { name: 'Off' });
    const compact = within(menu).getByRole('menuitemradio', { name: 'Compact' });
    const expanded = within(menu).getByRole('menuitemradio', { name: 'Expanded' });

    expect(compact).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(expanded).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(off).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(expanded).toHaveFocus();
  });
});
