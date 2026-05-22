import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import AgentActivityBlock from './agent-activity-block.svelte';
import type { AgentActivityItem, AgentActivityModel } from './agent-activity-ui';

vi.mock('svelte-i18n', () => {
  const messages: Record<string, string> = {
    assistant_activity_count: '{count} items',
    assistant_activity_hide: 'Hide activity',
    assistant_activity_show: 'Show activity',
    assistant_activity_status_blocked: 'Needs attention',
    assistant_activity_status_completed: 'Done',
    assistant_activity_status_failed: 'Failed',
    assistant_activity_status_pending: 'Pending',
    assistant_activity_status_running: 'Running',
    assistant_activity_status_skipped: 'Skipped',
    assistant_activity_summary_title: 'Activity summary',
    assistant_activity_technical_albums: 'Albums',
    assistant_activity_technical_assets: 'Assets',
    assistant_activity_technical_completed: 'Completed at',
    assistant_activity_technical_error: 'Error',
    assistant_activity_technical_hide: 'Hide technical details',
    assistant_activity_technical_request: 'Request summary',
    assistant_activity_technical_response: 'Response summary',
    assistant_activity_technical_result_items: 'Returned items',
    assistant_activity_technical_result_size: 'Response size',
    assistant_activity_technical_truncated: 'Truncated',
    assistant_activity_technical_omitted_fields: 'Omitted fields',
    assistant_activity_technical_next_page: 'Next page',
    assistant_activity_technical_show: 'Technical details',
    assistant_activity_technical_started: 'Started at',
    assistant_activity_technical_tool: 'Tool name',
    assistant_activity_technical_tool_call: 'Tool call ID',
    assistant_activity_technical_tool_calls: 'Tool call IDs',
    assistant_activity_title: 'Pi is working',
  };

  return {
    t: readable((key: string, options?: { values?: Record<string, string | number> }) =>
      (messages[key] ?? key).replace('{count}', String(options?.values?.count ?? '')),
    ),
  };
});

const activityItem = (overrides: Partial<AgentActivityItem> = {}): AgentActivityItem => ({
  id: overrides.id ?? 'activity-search',
  sessionId: overrides.sessionId ?? 'session-1',
  kind: overrides.kind ?? 'search',
  status: overrides.status ?? 'completed',
  title: overrides.title ?? 'Searching photos',
  summary: overrides.summary ?? 'Found matching photos',
  count: overrides.count ?? 42,
  startedAt: overrides.startedAt ?? '2026-05-18T10:00:00.000Z',
  completedAt: overrides.completedAt ?? '2026-05-18T10:00:02.000Z',
  technical: overrides.technical,
});

const activityModel = (items: AgentActivityItem[], verboseItems = items): AgentActivityModel => ({
  items,
  verboseItems,
  activeItem: items.find((item) => ['blocked', 'running', 'pending'].includes(item.status)) ?? null,
  verboseActiveItem: verboseItems.find((item) => ['blocked', 'running', 'pending'].includes(item.status)) ?? null,
  summary: items
    .map((item) => item.summary ?? item.title)
    .slice(0, 3)
    .join(', '),
});

describe(AgentActivityBlock.name, () => {
  it('uses compact coalesced rows until the user expands activity', () => {
    const compactItems = [
      activityItem({ id: 'search-compact', title: 'Searching photos', status: 'completed' }),
      activityItem({ id: 'metadata-compact', title: 'Reading photo details', status: 'running' }),
      activityItem({ id: 'album-compact', title: 'Searching albums', status: 'completed' }),
    ];
    const verboseItems = Array.from({ length: 60 }, (_, index) =>
      activityItem({
        id: `verbose-${index}`,
        title: index % 2 === 0 ? 'Searching photos' : 'Reading photo details',
        summary: `Verbose row ${index}`,
        status: index === 59 ? 'running' : 'completed',
        technical: { toolName: index % 2 === 0 ? 'searchAssets' : 'readAssetMetadata' },
      }),
    );

    render(AgentActivityBlock, {
      props: {
        visibilityMode: 'compact',
        model: activityModel(compactItems, verboseItems),
      },
    });

    const block = screen.getByRole('article', { name: 'Pi is working' });
    expect(block).toHaveTextContent('Searching photos');
    expect(block).toHaveTextContent('Reading photo details');
    expect(block).toHaveTextContent('Searching albums');
    expect(block).not.toHaveTextContent('Verbose row 59');
    expect(screen.queryByRole('button', { name: 'Technical details' })).not.toBeInTheDocument();
  });

  it('renders verbose rows only in expanded mode', async () => {
    render(AgentActivityBlock, {
      props: {
        visibilityMode: 'expanded',
        model: activityModel(
          [activityItem({ id: 'compact-search', title: 'Searching photos', summary: 'Found matching photos' })],
          [
            activityItem({
              id: 'verbose-search-1',
              title: 'Searching photos',
              summary: 'Found matching photos',
              technical: {
                toolName: 'searchAssets',
                toolCallIds: ['tool-call-1'],
                requestSummary: 'Search with token=[redacted]',
              },
            }),
            activityItem({
              id: 'verbose-metadata-1',
              title: 'Reading photo details',
              status: 'running',
              summary: 'Reading photo details',
              count: 12,
              technical: { toolName: 'readAssetMetadata', toolCallIds: ['tool-call-2'] },
            }),
          ],
        ),
      },
    });

    const block = screen.getByRole('article', { name: 'Pi is working' });
    expect(block).toHaveTextContent('Reading photo details');
    expect(block).toHaveTextContent('Running');
    expect(block).toHaveTextContent('12 items');
    expect(block).not.toHaveTextContent('searchAssets');
    expect(block).not.toHaveTextContent('tool-call-1');

    const buttons = screen.getAllByRole('button', { name: 'Technical details' });
    await fireEvent.click(buttons[0]);

    expect(screen.getByText('searchAssets')).toBeInTheDocument();
    expect(screen.getByText('tool-call-1')).toBeInTheDocument();
    expect(screen.queryByText('readAssetMetadata')).not.toBeInTheDocument();
  });

  it('caps expanded verbose rows to a bounded DOM count', () => {
    const verboseItems = Array.from({ length: 250 }, (_, index) =>
      activityItem({
        id: `verbose-${index}`,
        title: `Verbose activity ${index}`,
        status: index === 120 ? 'running' : 'completed',
        startedAt: `2026-05-18T10:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`,
      }),
    );
    const { container } = render(AgentActivityBlock, {
      props: {
        visibilityMode: 'expanded',
        model: activityModel([activityItem({ id: 'compact', title: 'Searching photos' })], verboseItems),
      },
    });

    expect(container.querySelectorAll('[data-activity-row]')).toHaveLength(100);
    expect(screen.getByText('Verbose activity 120')).toBeInTheDocument();
    expect(screen.queryByText('Verbose activity 0')).not.toBeInTheDocument();
  });

  it('renders a compact active activity block with safe row labels', () => {
    render(AgentActivityBlock, {
      props: {
        model: activityModel([
          activityItem({ id: 'search', title: 'Searching photos', status: 'completed' }),
          activityItem({ id: 'albums', title: 'Searching albums', status: 'completed' }),
          activityItem({
            id: 'metadata',
            title: 'Reading photo details',
            status: 'running',
            technical: {
              toolName: 'readAssetMetadata',
              requestSummary: 'Raw request text',
              responseSummary: 'Raw result text',
              error: 'Raw error text',
            },
          }),
          activityItem({ id: 'preview', title: 'Loading photo previews', status: 'pending' }),
        ]),
      },
    });

    const block = screen.getByRole('article', { name: 'Pi is working' });
    expect(block).toHaveTextContent('Searching albums');
    expect(block).toHaveTextContent('Reading photo details');
    expect(block).toHaveTextContent('Loading photo previews');
    expect(block).not.toHaveTextContent('Searching photos');
    expect(block).not.toHaveTextContent('readAssetMetadata');
    expect(block).not.toHaveTextContent('Raw request text');
    expect(block).not.toHaveTextContent('Raw result text');
    expect(block).not.toHaveTextContent('Raw error text');
    expect(screen.getByRole('button', { name: 'Show activity' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands to show all rows and hides technical details', async () => {
    render(AgentActivityBlock, {
      props: {
        model: activityModel([
          activityItem({ id: 'search', title: 'Searching photos', status: 'completed' }),
          activityItem({ id: 'metadata', title: 'Reading photo details', status: 'running' }),
          activityItem({ id: 'preview', title: 'Loading photo previews', status: 'pending', count: 12 }),
          activityItem({
            id: 'plan',
            kind: 'plan',
            title: 'Preparing a plan',
            status: 'completed',
            technical: { toolName: 'proposeAlbumOperations' },
          }),
        ]),
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Show activity' }));

    const block = screen.getByRole('article', { name: 'Pi is working' });
    expect(screen.getByRole('button', { name: 'Hide activity' })).toHaveAttribute('aria-expanded', 'true');
    expect(block).toHaveTextContent('Searching photos');
    expect(block).toHaveTextContent('Reading photo details');
    expect(block).toHaveTextContent('Loading photo previews');
    expect(block).toHaveTextContent('Preparing a plan');
    expect(block).toHaveTextContent('Running');
    expect(block).toHaveTextContent('12 items');
    expect(block).not.toHaveTextContent('proposeAlbumOperations');
    expect(screen.getByRole('button', { name: 'Technical details' })).toBeInTheDocument();
  });

  it('keeps technical details hidden in compact mode even when rows have metadata', () => {
    render(AgentActivityBlock, {
      props: {
        visibilityMode: 'compact',
        model: activityModel([
          activityItem({
            id: 'metadata',
            title: 'Reading photo details',
            status: 'running',
            technical: {
              toolName: 'readAssetMetadata',
              toolCallIds: ['tool-call-1'],
              requestSummary: 'Read selected photo details',
              responseSummary: 'Loaded selected photo details',
              error: 'Failed with [redacted]',
              assetCount: 3,
              startedAt: '2026-05-18T10:00:00.000Z',
              completedAt: '2026-05-18T10:00:02.000Z',
            },
          }),
        ]),
      },
    });

    const block = screen.getByRole('article', { name: 'Pi is working' });
    expect(block).not.toHaveTextContent('readAssetMetadata');
    expect(block).not.toHaveTextContent('tool-call-1');
    expect(block).not.toHaveTextContent('Read selected photo details');
    expect(block).not.toHaveTextContent('Loaded selected photo details');
    expect(block).not.toHaveTextContent('Failed with [redacted]');
    expect(screen.queryByRole('button', { name: 'Technical details' })).not.toBeInTheDocument();
  });

  it('reveals safe technical detail rows behind an expanded row disclosure', async () => {
    render(AgentActivityBlock, {
      props: {
        visibilityMode: 'expanded',
        model: activityModel([
          activityItem({
            id: 'metadata',
            title: 'Reading photo details',
            technical: {
              toolName: 'readAssetMetadata',
              toolCallIds: ['tool-call-1'],
              requestSummary: 'Read selected photo details',
              responseSummary: 'Loaded selected photo details',
              assetCount: 3,
              startedAt: '2026-05-18T10:00:00.000Z',
              completedAt: '2026-05-18T10:00:02.000Z',
            },
          }),
        ]),
      },
    });

    const button = screen.getByRole('button', { name: 'Technical details' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('readAssetMetadata')).not.toBeInTheDocument();

    await fireEvent.click(button);

    expect(screen.getByRole('button', { name: 'Hide technical details' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Tool name')).toBeInTheDocument();
    expect(screen.getByText('readAssetMetadata')).toBeInTheDocument();
    expect(screen.getByText('Tool call ID')).toBeInTheDocument();
    expect(screen.getByText('tool-call-1')).toBeInTheDocument();
    expect(screen.getByText('Request summary')).toBeInTheDocument();
    expect(screen.getByText('Read selected photo details')).toBeInTheDocument();
    expect(screen.getByText('Response summary')).toBeInTheDocument();
    expect(screen.getByText('Loaded selected photo details')).toBeInTheDocument();
    expect(screen.getByText('Assets')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Started at')).toBeInTheDocument();
    expect(screen.getByText('2026-05-18T10:00:00.000Z')).toBeInTheDocument();
    expect(screen.getByText('Completed at')).toBeInTheDocument();
    expect(screen.getByText('2026-05-18T10:00:02.000Z')).toBeInTheDocument();
  });

  it('renders result-size technical rows when expanded', async () => {
    render(AgentActivityBlock, {
      props: {
        visibilityMode: 'expanded',
        model: activityModel([
          activityItem({
            id: 'search-1',
            title: 'Searching photos',
            technical: {
              resultSize: {
                returnedItems: 4,
                hasMore: false,
                nextPage: null,
                estimatedBytes: 2048,
                truncated: true,
                omittedFields: ['assets'],
              },
            },
          }),
        ]),
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Technical details' }));

    expect(screen.getByText('Response size')).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();
    expect(screen.getByText('Omitted fields')).toBeInTheDocument();
    expect(screen.getByText('assets')).toBeInTheDocument();
  });

  it('does not render an empty technical details disclosure for rows without safe details', () => {
    render(AgentActivityBlock, {
      props: {
        visibilityMode: 'expanded',
        model: activityModel([activityItem({ id: 'message', title: 'Writing response', technical: undefined })]),
      },
    });

    expect(screen.getByText('Writing response')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Technical details' })).not.toBeInTheDocument();
  });

  it('keeps multiple row technical disclosures independent', async () => {
    render(AgentActivityBlock, {
      props: {
        visibilityMode: 'expanded',
        model: activityModel([
          activityItem({
            id: 'search',
            title: 'Searching photos',
            technical: { toolName: 'searchAssets', toolCallIds: ['search-call'] },
          }),
          activityItem({
            id: 'metadata',
            title: 'Reading photo details',
            technical: { toolName: 'readAssetMetadata', toolCallIds: ['metadata-call'] },
          }),
        ]),
      },
    });

    const buttons = screen.getAllByRole('button', { name: 'Technical details' });
    await fireEvent.click(buttons[0]);

    expect(screen.getByText('searchAssets')).toBeInTheDocument();
    expect(screen.queryByText('readAssetMetadata')).not.toBeInTheDocument();
    expect(buttons[0]).toHaveAttribute('aria-expanded', 'true');
    expect(buttons[1]).toHaveAttribute('aria-expanded', 'false');

    await fireEvent.click(buttons[1]);

    expect(screen.getByText('searchAssets')).toBeInTheDocument();
    expect(screen.getByText('readAssetMetadata')).toBeInTheDocument();
    expect(buttons[0]).toHaveAttribute('aria-expanded', 'true');
    expect(buttons[1]).toHaveAttribute('aria-expanded', 'true');
  });

  it('can be controlled directly in expanded mode', () => {
    render(AgentActivityBlock, {
      props: {
        visibilityMode: 'expanded',
        model: activityModel([
          activityItem({ id: 'search', title: 'Searching photos', status: 'completed' }),
          activityItem({ id: 'metadata', title: 'Reading photo details', status: 'running' }),
          activityItem({ id: 'preview', title: 'Loading photo previews', status: 'pending' }),
          activityItem({ id: 'plan', title: 'Preparing a plan', status: 'completed' }),
        ]),
      },
    });

    const block = screen.getByRole('article', { name: 'Pi is working' });
    expect(screen.getByRole('button', { name: 'Hide activity' })).toHaveAttribute('aria-expanded', 'true');
    expect(block).toHaveTextContent('Searching photos');
    expect(block).toHaveTextContent('Preparing a plan');
  });

  it('follows controlled visibility mode rerenders', async () => {
    const view = render(AgentActivityBlock, {
      props: {
        visibilityMode: 'compact',
        model: activityModel([
          activityItem({ id: 'search', title: 'Searching photos', status: 'completed' }),
          activityItem({ id: 'metadata', title: 'Reading photo details', status: 'running' }),
          activityItem({ id: 'preview', title: 'Loading photo previews', status: 'pending' }),
          activityItem({ id: 'plan', title: 'Preparing a plan', status: 'completed' }),
        ]),
      },
    });

    expect(screen.queryByText('Searching photos')).not.toBeInTheDocument();

    await view.rerender({
      visibilityMode: 'expanded',
      model: activityModel([
        activityItem({ id: 'search', title: 'Searching photos', status: 'completed' }),
        activityItem({ id: 'metadata', title: 'Reading photo details', status: 'running' }),
        activityItem({ id: 'preview', title: 'Loading photo previews', status: 'pending' }),
        activityItem({ id: 'plan', title: 'Preparing a plan', status: 'completed' }),
      ]),
    });

    expect(screen.getByText('Searching photos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide activity' })).toBeInTheDocument();
  });

  it('requests visibility mode changes instead of owning expansion state when controlled', async () => {
    const onVisibilityModeChange = vi.fn();
    const view = render(AgentActivityBlock, {
      props: {
        visibilityMode: 'compact',
        onVisibilityModeChange,
        model: activityModel([
          activityItem({ id: 'search', title: 'Searching photos', status: 'completed' }),
          activityItem({ id: 'metadata', title: 'Reading photo details', status: 'running' }),
          activityItem({ id: 'preview', title: 'Loading photo previews', status: 'pending' }),
          activityItem({ id: 'plan', title: 'Preparing a plan', status: 'completed' }),
        ]),
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Show activity' }));

    expect(onVisibilityModeChange).toHaveBeenCalledWith('expanded');
    expect(screen.queryByText('Searching photos')).not.toBeInTheDocument();

    await view.rerender({
      visibilityMode: 'expanded',
      onVisibilityModeChange,
      model: activityModel([
        activityItem({ id: 'search', title: 'Searching photos', status: 'completed' }),
        activityItem({ id: 'metadata', title: 'Reading photo details', status: 'running' }),
        activityItem({ id: 'preview', title: 'Loading photo previews', status: 'pending' }),
        activityItem({ id: 'plan', title: 'Preparing a plan', status: 'completed' }),
      ]),
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Hide activity' }));

    expect(onVisibilityModeChange).toHaveBeenCalledWith('compact');
  });

  it('collapses again while keeping the active row visible', async () => {
    render(AgentActivityBlock, {
      props: {
        compactLimit: 2,
        model: activityModel([
          activityItem({ id: 'search', title: 'Searching photos', status: 'completed' }),
          activityItem({ id: 'albums', title: 'Searching albums', status: 'completed' }),
          activityItem({ id: 'metadata', title: 'Reading photo details', status: 'running' }),
        ]),
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Show activity' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Hide activity' }));

    const block = screen.getByRole('article', { name: 'Pi is working' });
    expect(block).toHaveTextContent('Reading photo details');
    expect(block).not.toHaveTextContent('Searching photos');
    expect(screen.getByRole('button', { name: 'Show activity' })).toHaveFocus();
  });

  it('renders nothing for an empty model', () => {
    const { container } = render(AgentActivityBlock, {
      props: {
        model: { items: [], verboseItems: [], activeItem: null, verboseActiveItem: null, summary: null },
      },
    });

    expect(container.querySelector('[data-chat-item]')).not.toBeInTheDocument();
  });

  it('renders terminal activity as a summary without active status', () => {
    render(AgentActivityBlock, {
      props: {
        model: activityModel([
          activityItem({ id: 'search', status: 'completed', summary: 'Found matching photos' }),
          activityItem({ id: 'album', status: 'completed', summary: 'Found matching albums' }),
        ]),
      },
    });

    const block = screen.getByRole('article', { name: 'Activity summary' });
    expect(block).toHaveTextContent('Activity summary');
    expect(block).toHaveTextContent('Found matching photos, Found matching albums');
    expect(within(block).queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show activity' })).toBeInTheDocument();
  });

  it('renders long row labels without exposing technical text', () => {
    const longText = 'Reading photo details for a very long generated album workflow that should wrap cleanly';

    render(AgentActivityBlock, {
      props: {
        model: activityModel([
          activityItem({
            id: 'long',
            title: longText,
            summary: `${longText} summary`,
            count: 1234,
            technical: { error: 'secret raw technical detail' },
          }),
        ]),
      },
    });

    const block = screen.getByRole('article', { name: 'Activity summary' });
    expect(block).toHaveTextContent(longText);
    expect(block).toHaveTextContent('1234 items');
    expect(block).not.toHaveTextContent('secret raw technical detail');
    expect(screen.getByRole('button', { name: 'Show activity' })).toBeInTheDocument();
  });
});
