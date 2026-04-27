import { getIntersectionObserverMock } from '$lib/__mocks__/intersection-observer.mock';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { personFactory } from '@test-data/factories/person-factory';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import ManagePeopleVisibilityWrapper from './manage-people-visibility.test-wrapper.svelte';

describe('ManagePeopleVisibility component', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', getIntersectionObserverMock());
    sdkMock.updatePeople.mockResolvedValue([]);
  });

  it('keeps toggled hidden state when loading more people', async () => {
    const onClose = vi.fn();
    const onUpdate = vi.fn();
    const loadNextPage = vi.fn();

    const [personA, personB, personC] = [
      personFactory.build({ id: 'a', isHidden: false }),
      personFactory.build({ id: 'b', isHidden: false }),
      personFactory.build({ id: 'c', isHidden: true }),
    ];

    const { container, rerender } = render(ManagePeopleVisibilityWrapper, {
      props: {
        people: [personA, personB],
        totalPeopleCount: 3,
        onClose,
        onUpdate,
        loadNextPage,
      },
    });
    const user = userEvent.setup();

    let personButtons = container.querySelectorAll('button[aria-pressed]');
    expect(personButtons).toHaveLength(2);

    await user.click(personButtons[0]);
    expect(personButtons[0].getAttribute('aria-pressed')).toBe('true');

    await rerender({
      people: [personA, personB, personC],
      totalPeopleCount: 3,
      onClose,
      onUpdate,
      loadNextPage,
    });

    personButtons = container.querySelectorAll('button[aria-pressed]');
    expect(personButtons).toHaveLength(3);
    expect(personButtons[0].getAttribute('aria-pressed')).toBe('true');
    expect(personButtons[2].getAttribute('aria-pressed')).toBe('true');
  });

  it('shows newly loaded hidden people as hidden', async () => {
    const onClose = vi.fn();
    const onUpdate = vi.fn();
    const loadNextPage = vi.fn();

    const [personA, personB, personC] = [
      personFactory.build({ id: 'a', isHidden: false }),
      personFactory.build({ id: 'b', isHidden: false }),
      personFactory.build({ id: 'c', isHidden: true }),
    ];

    const { container, rerender } = render(ManagePeopleVisibilityWrapper, {
      props: {
        people: [personA, personB],
        totalPeopleCount: 3,
        onClose,
        onUpdate,
        loadNextPage,
      },
    });

    await rerender({
      people: [personA, personB, personC],
      totalPeopleCount: 3,
      onClose,
      onUpdate,
      loadNextPage,
    });

    const personButtons = container.querySelectorAll('button[aria-pressed]');
    expect(personButtons).toHaveLength(3);
    expect(personButtons[2].getAttribute('aria-pressed')).toBe('true');
  });

  it('saves global visibility through updatePeople', async () => {
    const onClose = vi.fn();
    const onUpdate = vi.fn();
    const loadNextPage = vi.fn();
    const person = personFactory.build({ id: 'a', name: 'Alice', isHidden: false });
    const { container } = render(ManagePeopleVisibilityWrapper, {
      props: {
        people: [person],
        totalPeopleCount: 1,
        onClose,
        onUpdate,
        loadNextPage,
      },
    });
    const user = userEvent.setup();

    await user.click(container.querySelector('button[aria-pressed]')!);
    await user.click(screen.getByTestId('save-visibility'));

    await waitFor(() => {
      expect(sdkMock.updatePeople).toHaveBeenCalledWith({ peopleUpdateDto: { people: [{ id: 'a', isHidden: true }] } });
    });
  });
});
