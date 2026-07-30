import { describe, expect, it, vi } from 'vitest';
import { matchesShortcut } from '$lib/actions/shortcut';
import { isEditableTarget, searchShortcuts } from './search-shortcut';

const keydown = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

const countMatches = (event: KeyboardEvent) =>
  searchShortcuts(() => {}).filter((option) => matchesShortcut(event, option.shortcut)).length;

const fire = (open: () => void, event: KeyboardEvent) => {
  for (const option of searchShortcuts(open)) {
    if (matchesShortcut(event, option.shortcut)) {
      option.onShortcut(event as KeyboardEvent & { currentTarget: HTMLElement });
    }
  }
};

const focusHtml = (html: string) => {
  document.body.innerHTML = html;
  const element = document.body.firstElementChild as HTMLElement;
  element.focus();
  return element;
};

describe('isEditableTarget', () => {
  it.each([
    ['a text input', '<input type="text" />'],
    ['a search input', '<input type="search" />'],
    ['a number input', '<input type="number" />'],
    ['a textarea', '<textarea></textarea>'],
    ['a select', '<select></select>'],
    ['a contenteditable element', '<div contenteditable="true"></div>'],
  ])('treats %s as editable', (_name, html) => {
    document.body.innerHTML = html;

    expect(isEditableTarget(document.body.firstElementChild)).toBe(true);
  });

  it('treats an element nested inside a contenteditable region as editable', () => {
    document.body.innerHTML = '<div contenteditable="true"><span id="inner">hi</span></div>';

    expect(isEditableTarget(document.querySelector('#inner'))).toBe(true);
  });

  it('does not treat an explicitly non-editable region as editable', () => {
    document.body.innerHTML = '<div contenteditable="false"></div>';

    expect(isEditableTarget(document.body.firstElementChild)).toBe(false);
  });

  it('does not treat an ordinary element as editable', () => {
    document.body.innerHTML = '<div></div>';

    expect(isEditableTarget(document.body.firstElementChild)).toBe(false);
  });

  it('returns false for null rather than throwing', () => {
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('searchShortcuts', () => {
  it('registers a bare slash and a shifted slash, in that order', () => {
    expect(searchShortcuts(() => {}).map((option) => option.shortcut)).toEqual([
      { key: '/' },
      { key: '/', shift: true },
    ]);
  });

  it('matches a bare slash exactly once', () => {
    expect(countMatches(keydown({ key: '/' }))).toBe(1);
  });

  it('matches a shifted slash exactly once, for layouts where slash needs shift', () => {
    expect(countMatches(keydown({ key: '/', shiftKey: true }))).toBe(1);
  });

  it('leaves question mark to the keyboard shortcuts modal', () => {
    expect(countMatches(keydown({ key: '?', shiftKey: true }))).toBe(0);
  });

  it('leaves ctrl+slash to the search mode cycle', () => {
    expect(countMatches(keydown({ key: '/', ctrlKey: true }))).toBe(0);
  });

  it('ignores slash with alt or meta held', () => {
    expect(countMatches(keydown({ key: '/', altKey: true }))).toBe(0);
    expect(countMatches(keydown({ key: '/', metaKey: true }))).toBe(0);
  });

  it('opens search when nothing is being edited', () => {
    document.body.innerHTML = '';
    const open = vi.fn();

    fire(open, keydown({ key: '/' }));

    expect(open).toHaveBeenCalledTimes(1);
  });

  it('opens search from a shifted slash when nothing is being edited', () => {
    document.body.innerHTML = '';
    const open = vi.fn();

    fire(open, keydown({ key: '/', shiftKey: true }));

    expect(open).toHaveBeenCalledTimes(1);
  });

  it('does not open search while typing in a search input', () => {
    const field = focusHtml('<input type="search" />');
    expect(document.activeElement).toBe(field);
    const open = vi.fn();

    fire(open, keydown({ key: '/' }));

    expect(open).not.toHaveBeenCalled();
  });

  it('does not open search while typing in a textarea', () => {
    const field = focusHtml('<textarea></textarea>');
    expect(document.activeElement).toBe(field);
    const open = vi.fn();

    fire(open, keydown({ key: '/' }));

    expect(open).not.toHaveBeenCalled();
  });
});
