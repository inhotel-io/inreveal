import TestWrapper from '$lib/components/TestWrapper.svelte';
import { personFactory } from '@test-data/factories/person-factory';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import PeopleCard from './people-card.svelte';

describe('PeopleCard adapter', () => {
  it('keeps global person actions available through the shared tile', async () => {
    const person = personFactory.build({ id: 'p1', name: 'Alice', isFavorite: false, type: 'person' });
    const onHidePerson = vi.fn();
    const onMergePeople = vi.fn();
    const onToggleFavorite = vi.fn();
    const componentProps = { person, onHidePerson, onMergePeople, onToggleFavorite };
    const { baseElement } = render(
      TestWrapper as Component<{ component: typeof PeopleCard; componentProps: typeof componentProps }>,
      {
        props: {
          component: PeopleCard,
          componentProps,
        },
      },
    );

    await fireEvent.mouseEnter(baseElement.querySelector('[role="group"]')!);

    expect(screen.getByText('hide_person')).toBeInTheDocument();
    expect(screen.getByText('set_date_of_birth')).toBeInTheDocument();
    expect(screen.getByText('merge_people')).toBeInTheDocument();
    expect(screen.getByText('to_favorite')).toBeInTheDocument();
  });
});
