import { createFilterState } from '$lib/components/filter-panel/filter-panel';
import { OpenQueryParam } from '$lib/constants';
import { Route } from '$lib/route';

describe('Route', () => {
  describe(Route.login.name, () => {
    it('should encode continue', () => {
      expect(Route.login({ continue: '/some/path?with=query', autoLaunch: 1 })).toBe(
        '/auth/login?continue=%2Fsome%2Fpath%3Fwith%3Dquery&autoLaunch=1',
      );
    });
  });

  describe(Route.search.name, () => {
    it('should work', () => {
      expect(Route.search({})).toBe('/search');
    });

    it('should work', () => {
      expect(Route.search({ make: undefined, model: 'Immich' })).toBe('/search?query=%7B%22model%22%3A%22Immich%22%7D');
    });

    it('should support query parameters', () => {
      expect(Route.systemSettings({ isOpen: OpenQueryParam.OAUTH })).toBe('/admin/system-settings?isOpen=oauth');
    });
  });

  describe(Route.memories.name, () => {
    it('should link to the memories index', () => {
      expect(Route.memories()).toBe('/memories');
    });
  });

  describe('memoryViewer', () => {
    it('should link to the memory viewer', () => {
      expect(Route.memoryViewer()).toBe('/memory');
    });

    it('should support an asset id', () => {
      expect(Route.memoryViewer({ id: 'asset-id' })).toBe('/memory?id=asset-id');
    });

    it('should support the history source', () => {
      expect(Route.memoryViewer({ id: 'asset-id', source: 'history' })).toBe('/memory?id=asset-id&source=history');
    });
  });

  describe(Route.tags.name, () => {
    it('should work', () => {
      expect(Route.tags()).toBe('/tags');
    });

    it('should support query parameters', () => {
      expect(Route.tags({ path: '/some/path' })).toBe('/tags?path=%2Fsome%2Fpath');
    });

    it('should ignore an empty path', () => {
      expect(Route.tags({ path: '' })).toBe('/tags');
    });
  });

  describe(Route.systemSettings.name, () => {
    it('should work', () => {
      expect(Route.systemSettings()).toBe('/admin/system-settings');
    });

    it('should support query parameters', () => {
      expect(Route.systemSettings({ isOpen: OpenQueryParam.OAUTH })).toBe('/admin/system-settings?isOpen=oauth');
    });
  });

  describe(Route.continue.name, () => {
    beforeEach(() => {
      // @ts-expect-error - override location for testing
      globalThis.location = new URL('https://my.immich.server');
      vi.spyOn(document, 'baseURI', 'get').mockReturnValue('https://my.immich.server/');
    });

    it('should resolve relative URLs', () => {
      expect(Route.continue('/some/path', '/fallback')).property('href', 'https://my.immich.server/some/path');
    });

    it('should resolve absolute URLs on the same origin', () => {
      expect(Route.continue('https://my.immich.server/some/path', '/fallback')).property(
        'href',
        'https://my.immich.server/some/path',
      );
    });

    it('should return fallback for absolute URLs on a different origin', () => {
      expect(Route.continue('https://malicious.site/evil', '/fallback')).toBe('/fallback');
    });

    it('should return fallback for null URLs', () => {
      expect(Route.continue(null, '/fallback')).property('href', 'https://my.immich.server/fallback');
    });

    it('should block javascript: URLs', () => {
      expect(Route.continue('javascript:alert(1)', '/fallback')).toBe('/fallback');
    });

    it(String.raw`should block \/ URLs`, () => {
      expect(Route.continue(String.raw`\/malicious.com`, '/fallback')).toBe('/fallback');
    });
  });

  describe('viewSpaceAlbum', () => {
    it('links to an album inside a space', () => {
      expect(Route.viewSpaceAlbum({ spaceId: 'space-1', albumId: 'album-2' })).toBe('/spaces/space-1/albums/album-2');
    });

    it('links to a space albums tab', () => {
      expect(Route.viewSpaceAlbums({ id: 'space-1' })).toBe('/spaces/space-1/albums');
    });
  });

  describe(Route.map.name, () => {
    it('emits a bare /map with no arguments', () => {
      expect(Route.map()).toBe('/map');
    });

    it('emits only the viewport hash when given a point', () => {
      expect(Route.map({ zoom: 12, lat: 52.52, lng: 13.4 })).toBe('/map#12/52.52/13.4');
    });

    // E11 — query AND hash together. The map keeps its viewport in the hash and its scope/filters in
    // the query; before this, Route.map could only emit the hash.
    it('E11: emits query params and the viewport hash together', () => {
      const url = Route.map({
        zoom: 12,
        lat: 52.52,
        lng: 13.4,
        spaceId: 'space-1',
        query: 'ski',
        filters: { ...createFilterState(), make: 'Apple', rating: 4 },
      });

      expect(url).toBe('/map?spaceId=space-1&q=ski&make=Apple&rating=4#12/52.52/13.4');
    });

    // E10 — a pin dropped from inside a Space carries the space AND the active filters.
    it('E10: carries spaceId and filters without a point', () => {
      const url = Route.map({
        spaceId: 'space-1',
        filters: { ...createFilterState(), personIds: ['space-person:p1'] },
      });

      expect(url).toBe('/map?spaceId=space-1&people=space-person%3Ap1');
    });

    it('omits an empty query and an empty filter state', () => {
      expect(Route.map({ spaceId: 'space-1', query: '   ', filters: createFilterState() })).toBe(
        '/map?spaceId=space-1',
      );
    });
  });
});
