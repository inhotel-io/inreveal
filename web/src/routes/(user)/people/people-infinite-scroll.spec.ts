import { getIntersectionObserverMock } from '$lib/__mocks__/intersection-observer.mock';
import { personFactory } from '@test-data/factories/person-factory';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import PeopleInfiniteScrollWrapper from './people-infinite-scroll.test-wrapper.svelte';

describe('PeopleInfiniteScroll adapter', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', getIntersectionObserverMock());
  });

  it('renders global people through the shared grid', () => {
    const people = [personFactory.build({ id: 'p1', name: 'Alice' })];

    render(PeopleInfiniteScrollWrapper, {
      props: {
        people,
        loadNextPage: vi.fn(),
      },
    });

    expect(screen.getByText('Alice')).toBeInTheDocument();
  });
});
