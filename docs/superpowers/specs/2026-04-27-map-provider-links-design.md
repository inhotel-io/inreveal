# Map Provider Links In Image Info Panel

## Context

Discussion #432 asks for quick access to Google Maps and Apple Maps from an asset's location information. The web asset detail panel already renders a map preview when an asset has GPS coordinates, and the map popup currently contains an OpenStreetMap link. Mobile already prefers native map handling through Android `geo:` links and Apple Maps before falling back to OpenStreetMap.

## Goal

Add Google Maps and Apple Maps links to the web image info panel without changing the global map page or mobile behavior.

## UX

When an asset has GPS coordinates and the map feature flag is enabled, the image info panel continues to show the embedded map preview. Opening the marker popup shows the coordinate text followed by three external map links:

- Open in Google Maps
- Open in Apple Maps
- Open in OpenStreetMap

All links open in a new browser tab. The existing OpenStreetMap behavior remains available.

## Architecture

Add small web URL helpers for external map providers. The helpers accept latitude and longitude as numbers and return stable URLs for:

- Google Maps search by coordinates
- Apple Maps by coordinates
- OpenStreetMap by marker and map fragment

Use those helpers from `web/src/lib/components/asset-viewer/detail-panel.svelte` instead of hardcoding provider URLs in markup. This keeps URL syntax testable and avoids growing the Svelte component with provider-specific string construction.

## Data Flow

The existing `latlng` derived value in the detail panel remains the source of coordinates. The map marker popup receives `lat` and `lon` from the marker and passes them to the map URL helpers. No API or DTO changes are required.

## Error Handling

No runtime error path is needed. The links only render when the existing map preview renders, which already requires usable coordinates and the map feature flag.

## Testing

Add unit coverage for the map URL helper functions, including positive and negative coordinates. Run the focused unit test plus the existing web Svelte and TypeScript checks.

## Out Of Scope

- No mobile changes.
- No global map page changes.
- No provider preference setting.
- No geocoding or reverse-geocoding changes.
