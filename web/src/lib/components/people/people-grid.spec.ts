import { getIntersectionObserverMock } from '$lib/__mocks__/intersection-observer.mock';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import PeopleGridWrapper from './people-grid.test-wrapper.svelte';

describe('PeopleGrid', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', getIntersectionObserverMock());
  });

  it('renders items through the child snippet', () => {
    render(PeopleGridWrapper, {
      props: {
        items: [
          { id: 'p1', label: 'Alice' },
          { id: 'p2', label: 'Bob' },
        ],
        loadNextPage: vi.fn(),
      },
    });

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows loading text when loading the next page', () => {
    render(PeopleGridWrapper, {
      props: {
        items: [{ id: 'p1', label: 'Alice' }],
        hasNextPage: true,
        loading: true,
        loadNextPage: vi.fn(),
      },
    });

    expect(screen.getByText('loading')).toBeInTheDocument();
  });
});
