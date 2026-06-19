import { debounce } from 'lodash-es';

// Largest element height the browser renders before clamping the scroll container: Firefox ≈ 17.9M,
// Chrome/Safari ≈ 33.5M. The Firefox check is inlined (not imported from asset-utils's `isFirefox`)
// to avoid the circular import asset-utils → TimelineManager → VirtualScrollManager.
const MAX_SCROLL_HEIGHT =
  typeof navigator !== 'undefined' && navigator.userAgent.includes('Firefox') ? 17_000_000 : 33_000_000;

type LayoutOptions = {
  headerHeight: number;
  rowHeight: number;
  gap: number;
};
export abstract class VirtualScrollManager {
  topSectionHeight = $state(0);
  bodySectionHeight = $state(0);
  bottomSectionHeight = $state(0);
  totalViewerHeight = $derived.by(() => this.topSectionHeight + this.bodySectionHeight + this.bottomSectionHeight);

  visibleWindow = $derived.by(() => ({
    top: this.#scrollTop,
    bottom: this.#scrollTop + this.viewportHeight,
  }));

  #viewportHeight = $state(0);
  #viewportWidth = $state(0);
  #scrollTop = $state(0);
  maxScrollHeight = $state(MAX_SCROLL_HEIGHT);
  #cachedDomScrollTop = $state(0);
  #rowHeight = $state(235);
  #headerHeight = $state(48);
  #gap = $state(12);
  #scrolling = $state(false);
  #suspendTransitions = $state(false);
  #resetScrolling = debounce(() => (this.#scrolling = false), 1000);
  #resetSuspendTransitions = debounce(() => (this.suspendTransitions = false), 1000);
  #justifiedLayoutOptions = $derived({
    spacing: 2,
    heightTolerance: 0.5,
    rowHeight: this.#rowHeight,
    rowWidth: Math.floor(this.viewportWidth),
  });

  constructor() {
    this.setLayoutOptions();
  }

  get domScrollTop(): number {
    return 0;
  }

  get scrollTop(): number {
    return this.domToLogical(this.domScrollTop);
  }

  get renderOffset(): number {
    return this.#cachedDomScrollTop - this.#scrollTop;
  }

  get domHeight(): number {
    return Math.min(this.totalViewerHeight, this.maxScrollHeight);
  }

  get logicalScrollMax(): number {
    return Math.max(0, this.totalViewerHeight - this.viewportHeight);
  }

  get domScrollMax(): number {
    return Math.max(0, this.domHeight - this.viewportHeight);
  }

  get scrollScale(): number {
    return this.logicalScrollMax > 0 ? this.domScrollMax / this.logicalScrollMax : 1;
  }

  domToLogical(dom: number): number {
    return this.domScrollMax > 0 ? (dom * this.logicalScrollMax) / this.domScrollMax : 0;
  }

  logicalToDom(logical: number): number {
    return this.logicalScrollMax > 0 ? (logical * this.domScrollMax) / this.logicalScrollMax : 0;
  }

  get justifiedLayoutOptions() {
    return this.#justifiedLayoutOptions;
  }

  get maxScrollPercent() {
    const totalHeight = this.totalViewerHeight;
    return (totalHeight - this.viewportHeight) / totalHeight;
  }

  get maxScroll() {
    return this.totalViewerHeight - this.viewportHeight;
  }

  #setHeaderHeight(value: number) {
    if (this.#headerHeight == value) {
      return false;
    }
    this.#headerHeight = value;
    return true;
  }

  get headerHeight() {
    return this.#headerHeight;
  }

  #setGap(value: number) {
    if (this.#gap == value) {
      return false;
    }
    this.#gap = value;
    return true;
  }

  get gap() {
    return this.#gap;
  }

  #setRowHeight(value: number) {
    if (this.#rowHeight == value) {
      return false;
    }
    this.#rowHeight = value;
    return true;
  }

  get rowHeight() {
    return this.#rowHeight;
  }

  set scrolling(value: boolean) {
    this.#scrolling = value;
    if (value) {
      this.suspendTransitions = true;
      this.#resetScrolling();
    }
  }

  get scrolling() {
    return this.#scrolling;
  }

  set suspendTransitions(value: boolean) {
    this.#suspendTransitions = value;
    if (value) {
      this.#resetSuspendTransitions();
    }
  }

  get suspendTransitions() {
    return this.#suspendTransitions;
  }

  set viewportWidth(value: number) {
    const changed = value !== this.#viewportWidth;
    this.#viewportWidth = value;
    this.suspendTransitions = true;
    void this.updateViewportGeometry(changed);
  }

  get viewportWidth() {
    return this.#viewportWidth;
  }

  set viewportHeight(value: number) {
    this.#viewportHeight = value;
    this.#suspendTransitions = true;
    void this.updateViewportGeometry(false);
  }

  get viewportHeight() {
    return this.#viewportHeight;
  }

  get hasEmptyViewport() {
    return this.viewportWidth === 0 || this.viewportHeight === 0;
  }

  protected updateViewportProximities(): void {}

  protected updateViewportGeometry(_: boolean) {}

  setLayoutOptions({ headerHeight = 48, rowHeight = 235, gap = 12 }: Partial<LayoutOptions> = {}) {
    let changed = false;
    changed ||= this.#setHeaderHeight(headerHeight);
    changed ||= this.#setGap(gap);
    changed ||= this.#setRowHeight(rowHeight);
    if (changed) {
      this.refreshLayout();
    }
  }

  updateSlidingWindow() {
    const domScrollTop = this.domScrollTop;
    const scrollTop = this.domToLogical(domScrollTop);
    if (this.#scrollTop !== scrollTop || this.#cachedDomScrollTop !== domScrollTop) {
      this.#cachedDomScrollTop = domScrollTop;
      this.#scrollTop = scrollTop;
      this.updateViewportProximities();
    }
  }

  refreshLayout() {
    this.updateViewportProximities();
  }

  destroy(): void {}
}
