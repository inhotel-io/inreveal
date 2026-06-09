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
    assistant_activity_visibility_off: 'Off',
    assistant_details: 'Details',
    assistant_session_menu: 'Chat options',
  };

  return { t: readable((key: string) => messages[key] ?? key) };
});

const renderMenu = (props: Partial<ComponentProps<typeof AgentActivityVisibilityMenu>> = {}) => {
  const onModeChange = vi.fn();
  const onOpenDetails = vi.fn();

  render(AgentActivityVisibilityMenu, {
    props: {
      mode: 'compact',
      onModeChange,
      onOpenDetails,
      ...props,
    },
  });

  return { onModeChange, onOpenDetails };
};

describe(AgentActivityVisibilityMenu.name, () => {
  it('renders an accessible icon-only collapsed trigger', () => {
    renderMenu();

    const trigger = screen.getByRole('button', { name: 'Chat options' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger.className).toContain('rounded-full');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitemradio', { name: 'Off' })).not.toBeInTheDocument();
  });

  it('opens Details from the menu, closes, and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const { onModeChange, onOpenDetails } = renderMenu();

    const trigger = screen.getByRole('button', { name: 'Chat options' });
    await user.click(trigger);

    const menu = screen.getByRole('menu', { name: 'Chat options' });
    await user.click(within(menu).getByRole('menuitem', { name: 'Details' }));

    expect(onOpenDetails).toHaveBeenCalledTimes(1);
    expect(onModeChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it.each([
    ['Off', 'off'],
    ['Compact', 'compact'],
    ['Expanded', 'expanded'],
  ] as const)('selects %s, closes, and returns focus to the trigger', async (label, mode) => {
    const user = userEvent.setup();
    const { onModeChange } = renderMenu({ mode: 'compact' });

    const trigger = screen.getByRole('button', { name: 'Chat options' });
    await user.click(trigger);

    const menu = screen.getByRole('menu', { name: 'Chat options' });
    expect(within(menu).getByText('Activity preview')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitemradio', { name: 'Compact' })).toHaveAttribute('aria-checked', 'true');

    await user.click(within(menu).getByRole('menuitemradio', { name: label }));

    expect(onModeChange).toHaveBeenCalledWith(mode);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('renders only the Details item when no activity visibility mode is wired', async () => {
    const user = userEvent.setup();
    const { onOpenDetails } = renderMenu({ mode: undefined, onModeChange: undefined });

    await user.click(screen.getByRole('button', { name: 'Chat options' }));

    const menu = screen.getByRole('menu', { name: 'Chat options' });
    expect(within(menu).getByRole('menuitem', { name: 'Details' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitemradio')).not.toBeInTheDocument();
    expect(within(menu).queryByText('Activity preview')).not.toBeInTheDocument();

    await user.click(within(menu).getByRole('menuitem', { name: 'Details' }));
    expect(onOpenDetails).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape without changing mode', async () => {
    const user = userEvent.setup();
    const { onModeChange, onOpenDetails } = renderMenu();

    const trigger = screen.getByRole('button', { name: 'Chat options' });
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(onModeChange).not.toHaveBeenCalled();
    expect(onOpenDetails).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('opens from Enter and moves focus with arrow keys', async () => {
    const user = userEvent.setup();
    renderMenu({ mode: 'compact' });

    const trigger = screen.getByRole('button', { name: 'Chat options' });
    trigger.focus();
    await user.keyboard('{Enter}');

    const menu = screen.getByRole('menu', { name: 'Chat options' });
    const details = within(menu).getByRole('menuitem', { name: 'Details' });
    const off = within(menu).getByRole('menuitemradio', { name: 'Off' });
    const compact = within(menu).getByRole('menuitemradio', { name: 'Compact' });
    const expanded = within(menu).getByRole('menuitemradio', { name: 'Expanded' });

    expect(details).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(off).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(compact).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(expanded).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(details).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(expanded).toHaveFocus();
  });
});
