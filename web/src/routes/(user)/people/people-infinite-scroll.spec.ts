import { getIntersectionObserverMock } from '$lib/__mocks__/intersection-observer.mock';
import { personFactory } from '@test-data/factories/person-factory';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/svelte';
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

  it('provides person and index through the snippet API', () => {
    const people = [
      personFactory.build({ id: 'p1', name: 'Alice' }),
      personFactory.build({ id: 'p2', name: 'Bob' }),
    ];

    render(PeopleInfiniteScrollWrapper, {
      props: {
        people,
        loadNextPage: vi.fn(),
      },
    });

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByTestId('person-index-p1')).toHaveTextContent('0');
    expect(screen.getByTestId('person-index-p2')).toHaveTextContent('1');
  });

  it('passes hasNextPage and loadNextPage through to the shared grid intersection behavior', async () => {
    let intersectionCallback: IntersectionObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    const intersectionObserverMock = vi.fn(function (callback: IntersectionObserverCallback) {
      intersectionCallback = callback;
      return {
        disconnect,
        observe,
        takeRecords: vi.fn(),
        unobserve: vi.fn(),
      };
    });
    vi.stubGlobal('IntersectionObserver', intersectionObserverMock);
    const loadNextPage = vi.fn();

    render(PeopleInfiniteScrollWrapper, {
      props: {
        people: [personFactory.build({ id: 'p1', name: 'Alice' })],
        hasNextPage: true,
        loadNextPage,
      },
    });

    await waitFor(() => expect(observe).toHaveBeenCalledTimes(1));
    const observedSentinel = observe.mock.calls[0][0];

    intersectionCallback?.([{ target: observedSentinel, isIntersecting: true } as IntersectionObserverEntry], {
      disconnect,
      observe,
      takeRecords: vi.fn(),
      unobserve: vi.fn(),
    } as unknown as IntersectionObserver);

    expect(loadNextPage).toHaveBeenCalledTimes(1);
  });
});
