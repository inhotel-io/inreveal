import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import PeopleGridWrapper from './people-grid.test-wrapper.svelte';

type ObserverEntry = Pick<IntersectionObserverEntry, 'target' | 'isIntersecting'>;

const observerInstances: ControllableIntersectionObserver[] = [];

class ControllableIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];
  readonly disconnect = vi.fn();
  readonly observe = vi.fn((target: Element) => {
    this.observedTarget = target;
  });
  readonly takeRecords = vi.fn(() => []);
  readonly unobserve = vi.fn();
  observedTarget?: Element;

  constructor(private readonly callback: IntersectionObserverCallback) {
    observerInstances.push(this);
  }

  trigger(entry: ObserverEntry) {
    this.callback([entry as IntersectionObserverEntry], this);
  }
}

describe('PeopleGrid', () => {
  beforeEach(() => {
    observerInstances.length = 0;
    vi.stubGlobal('IntersectionObserver', ControllableIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    expect(screen.getByText('loading')).toHaveAttribute('aria-live', 'polite');
  });

  it('calls loadNextPage when the sentinel intersects while more pages are available', () => {
    const loadNextPage = vi.fn();
    render(PeopleGridWrapper, {
      props: {
        items: [{ id: 'p1', label: 'Alice' }],
        hasNextPage: true,
        loadNextPage,
      },
    });

    observerInstances[0].trigger({
      target: observerInstances[0].observedTarget!,
      isIntersecting: true,
    });

    expect(loadNextPage).toHaveBeenCalledTimes(1);
  });

  it('does not call loadNextPage when the sentinel is not intersecting', () => {
    const loadNextPage = vi.fn();
    render(PeopleGridWrapper, {
      props: {
        items: [{ id: 'p1', label: 'Alice' }],
        hasNextPage: true,
        loadNextPage,
      },
    });

    observerInstances[0].trigger({
      target: observerInstances[0].observedTarget!,
      isIntersecting: false,
    });

    expect(loadNextPage).not.toHaveBeenCalled();
  });

  it('does not call loadNextPage while loading', () => {
    const loadNextPage = vi.fn();
    render(PeopleGridWrapper, {
      props: {
        items: [{ id: 'p1', label: 'Alice' }],
        hasNextPage: true,
        loading: true,
        loadNextPage,
      },
    });

    observerInstances[0].trigger({
      target: observerInstances[0].observedTarget!,
      isIntersecting: true,
    });

    expect(loadNextPage).not.toHaveBeenCalled();
  });

  it('does not observe or call loadNextPage when there are no more pages', () => {
    const loadNextPage = vi.fn();
    render(PeopleGridWrapper, {
      props: {
        items: [{ id: 'p1', label: 'Alice' }],
        hasNextPage: false,
        loadNextPage,
      },
    });

    expect(observerInstances).toHaveLength(0);
    expect(loadNextPage).not.toHaveBeenCalled();
  });

  it('disconnects the observer when pagination is no longer available', async () => {
    const { rerender } = render(PeopleGridWrapper, {
      props: {
        items: [{ id: 'p1', label: 'Alice' }],
        hasNextPage: true,
        loadNextPage: vi.fn(),
      },
    });
    const observer = observerInstances[0];

    await rerender({
      items: [{ id: 'p1', label: 'Alice' }],
      hasNextPage: false,
      loadNextPage: vi.fn(),
    });

    expect(observer.disconnect).toHaveBeenCalled();
  });

  it('renders without IntersectionObserver support', () => {
    vi.stubGlobal('IntersectionObserver', undefined);

    render(PeopleGridWrapper, {
      props: {
        items: [{ id: 'p1', label: 'Alice' }],
        hasNextPage: true,
        loadNextPage: vi.fn(),
      },
    });

    expect(screen.getByText('Alice')).toBeInTheDocument();
  });
});
