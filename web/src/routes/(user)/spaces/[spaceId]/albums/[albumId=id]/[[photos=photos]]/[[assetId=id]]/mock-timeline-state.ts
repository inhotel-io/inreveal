// Mutable timeline-manager stub shared between the Timeline mock and the spec. Tests set the shape
// (empty vs non-empty) BEFORE rendering; the Timeline mock snapshots it on mount. Default is
// non-empty so the timeline renders and the FilterPanel is visible unless a test opts into empty.
export interface MockTimelineState {
  isInitialized: boolean;
  scrollTop: number;
  grouping: string;
  months: unknown[];
  assetCount: number;
}

export const mockTimelineState: MockTimelineState = {
  isInitialized: true,
  scrollTop: 0,
  grouping: 'day',
  months: [{}],
  assetCount: 12,
};

export function resetMockTimelineState(): void {
  mockTimelineState.isInitialized = true;
  mockTimelineState.scrollTop = 0;
  mockTimelineState.grouping = 'day';
  mockTimelineState.months = [{}];
  mockTimelineState.assetCount = 12;
}

export function setMockTimelineEmpty(): void {
  mockTimelineState.months = [];
  mockTimelineState.assetCount = 0;
}
