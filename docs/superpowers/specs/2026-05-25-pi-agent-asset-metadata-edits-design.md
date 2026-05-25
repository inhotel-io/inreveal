# Pi Agent Asset Metadata Edits Design

Status: draft design
Date: 2026-05-25
Branch: `explore/pi-agent-brainstorm`

## Purpose

Pi can already search assets, inspect metadata, and create reviewable plans for
album, space, tag, favorite, archive, and rotation workflows. The next useful
capability gap is batch asset metadata cleanup: scanned-photo dates, timezone
fixes, descriptions, ratings, and explicit GPS coordinate corrections.

Users should be able to ask:

> Set the date on these scanned photos to June 1998.

or:

> Add "Berlin trip" as the description for these photos.

and receive a reviewable plan that shows what metadata will change before
anything is applied. The assistant must not mutate assets directly through MCP;
metadata writes remain behind Gallery plan review and user approval.

## Current State

Gallery already supports bulk asset updates through `AssetService.updateAll`.
The existing path can update:

- `description`
- `rating`
- `dateTimeOriginal`
- `dateTimeRelative`
- `timeZone`
- `latitude` and `longitude`

When coordinates are updated, Gallery reverse-geocodes those coordinates and
stores city, state, and country labels. Gallery does not currently expose a
forward geocoder that resolves place names such as "Paris" into coordinates.

The agent operation surface already supports:

- `asset.setFavorite`
- `asset.setArchive`
- `asset.addTag`
- `asset.removeTag`
- `asset.rotate`

Those operations should not be folded into metadata edits. This design covers
descriptive EXIF/user metadata only.

## Goals

- Add a reviewable `asset.updateMetadata` operation type.
- Let Pi propose metadata updates for explicit assets, selection handles,
  previous searches, and declarative search sources.
- Reuse the existing asset update behavior rather than creating a parallel write
  implementation.
- Show user-facing before/after metadata in plan review before apply.
- Keep location edits explicit: v1 accepts coordinates only, not place names.
- Keep favorite, archive, tag, and rotate operations on their existing operation
  types.
- Add a dedicated `updateAssetMetadata` write-scope flag so metadata writes can
  be controlled independently from image edits.
- Keep provider exposure safe: before-values shown to the user in Gallery must
  not be leaked to the model unless the session allows metadata exposure.
- Cover the new operation with unit, DTO, UI, and assistant-flow regressions.

## Non-Goals

- No forward geocoding in v1. Pi must not guess coordinates for a place name.
- No raw EXIF editing beyond the fields listed in this design.
- No title, filename, device path, checksum, stack, live-photo, or duplicate
  metadata edits.
- No direct mutation MCP tool.
- No delete/trash operation.
- No replacement for existing favorite, archive, tag, or rotate operations.
- No unbounded library-wide metadata rewrite without a materialized, reviewable
  asset set.

## User-Facing Behavior

### Supported Prompts

- "Set the description on these photos to Berlin weekend."
- "Rate these 12 photos five stars."
- "Clear the rating from photos in this album."
- "Move these scanned photos to June 1998."
- "Shift this album's timestamps forward by 2 hours."
- "Set the timezone on these photos to Europe/Berlin."
- "Set these photos to latitude 48.8566 and longitude 2.3522."

### Location Prompts Without Coordinates

If the user asks for a place name without coordinates, Pi should not invent a
location. It should ask for explicit latitude and longitude:

> I can update location metadata when you provide coordinates. Gallery will use
> those coordinates to fill city, state, and country labels.

The MCP contract should make this easy by rejecting `placeName` or any unknown
location field with a correction hint.

## Operation Contract

Add `AgentOperationType.AssetUpdateMetadata`:

```ts
export enum AgentOperationType {
  AssetUpdateMetadata = 'asset.updateMetadata',
}
```

The operation uses the existing `asset_batch` target kind:

```ts
type AgentAssetUpdateMetadataOperation = {
  type: 'asset.updateMetadata';
  summary: string;
  targetKind: 'asset_batch';
  assetIds?: string[];
  assetSelectionHandleId?: string;
  assetSource?: AgentAssetSourceInput;
  riskLevel?: 'low' | 'medium' | 'high';
  enabled?: boolean;
  payload: AgentAssetMetadataUpdatePayload;
};
```

### Payload

```ts
type AgentAssetMetadataUpdatePayload = {
  description?: string;
  rating?: 1 | 2 | 3 | 4 | 5 | null;
  dateTimeOriginal?: string;
  dateTimeRelative?: number; // integer minutes
  timeZone?: string;
  latitude?: number;
  longitude?: number;
};
```

Validation rules:

- At least one payload field is required.
- `dateTimeOriginal` must be an ISO datetime string.
- `dateTimeRelative` is an integer minute offset, matching the existing bulk
  date-shift UI and service behavior.
- `dateTimeOriginal` and `dateTimeRelative` are mutually exclusive, matching
  `AssetBulkUpdateDto`.
- `timeZone` may be supplied alone or with either time mode.
- `latitude` and `longitude` must be supplied together.
- `latitude` must be within `[-90, 90]`.
- `longitude` must be within `[-180, 180]`.
- `description` may be an empty string to clear the description.
- `rating: null` clears the rating.
- `rating: 0` and `rating: -1` should be rejected in the agent operation even
  though legacy asset DTOs still tolerate older rating shapes.
- Unknown fields such as `placeName`, `city`, `country`, or `title` are rejected
  with a correction hint.

## Permissions

Add a write-scope flag:

```ts
writeScope: {
  updateAssetMetadata: boolean;
}
```

Preset behavior:

- `Careful`: `false`
- `VisualOrganizer`: `true`
- `LocalPowerUser`: `true`

Legacy session snapshots should backfill `updateAssetMetadata: false`. This is
consistent with the current conservative legacy defaults for new write scopes.

Plan creation and apply must both check:

- session `writeScope.updateAssetMetadata`
- normal asset update access for all selected assets
- asset-scope restrictions from the session permission plan

Metadata read permissions are separate from metadata write permissions. Gallery
may fetch before-values server-side to render the user's plan review, but MCP
responses must only include those before-values when provider metadata exposure
allows it.

## Data Flow

1. Pi resolves the target assets through explicit IDs, a selection handle,
   `previousSearch`, or a declarative search source.
2. Gallery materializes the asset set at plan creation time, using the same
   durable plan review snapshot rules as other asset-bearing operations.
3. Gallery validates the payload and write scope.
4. Gallery stores a reviewable `asset.updateMetadata` operation.
5. Plan review displays the affected count, representative thumbnails, changed
   fields, and before/after values for a bounded sample.
6. User can disable the operation, revise through chat, or apply the plan.
7. Apply calls `assetService.updateAll(auth, dto)` with the materialized asset
   IDs and payload fields.
8. Existing asset update behavior queues sidecar writes and reverse-geocodes
   coordinates.

## Plan Review UI

The existing asset operation review can be reused, but metadata edits need a
field-focused summary in addition to thumbnails.

For each `asset.updateMetadata` operation, show:

- operation summary
- selected asset count
- changed fields
- previous value and proposed value for a representative sample
- any fields that apply uniformly to all selected assets
- a warning when coordinates will be applied to multiple assets

The large item review modal should continue to support thumbnail inspection and
selection changes. If the user removes items from the operation, the metadata
update applies only to the remaining selected assets.

## Activity And Approval Copy

Tool and activity copy should be specific:

- Pending planning approval: "Pi wants to draft metadata changes."
- Completed planning: "Pi drafted metadata changes."
- Activity item: "Preparing metadata update plan"
- Applied card: "Updated metadata for N photos"

The UI should not label this as image editing, because no pixels are changed.

## Error Handling

Recoverable errors should include model-facing correction hints:

- Missing coordinates: "Provide both latitude and longitude."
- Place name supplied: "Gallery does not resolve place names here. Ask the user
  for latitude and longitude."
- Absolute and relative time supplied together: "Choose dateTimeOriginal or
  dateTimeRelative, not both."
- No payload fields: "Provide at least one metadata field to update."
- Inaccessible assets: "Search again within the allowed asset scope or ask the
  user to narrow the target."
- Write scope disabled: "This session is not allowed to update asset metadata."

Apply-time partial failure should use the existing applied-plan card behavior:
successful operations remain visible, failed operations show a concise error,
and the chat remains usable.

## Testing Plan

### DTO And Contract Tests

- Accept each supported field.
- Accept `description: ""`.
- Accept `rating: null`.
- Reject `rating: 0`, `rating: -1`, and values outside 1-5.
- Reject `dateTimeOriginal` with `dateTimeRelative`.
- Reject latitude without longitude and longitude without latitude.
- Reject unknown fields such as `placeName`, `city`, and `title`.
- Verify the generated MCP tool schema exposes `asset.updateMetadata`.

### Service Tests

- Plan creation validates `writeScope.updateAssetMetadata`.
- Legacy permission snapshots backfill `updateAssetMetadata: false`.
- Search-backed metadata plans materialize asset sources at creation time.
- Apply delegates to `assetService.updateAll` with the selected asset IDs and
  expected DTO fields.
- Coordinate updates call the existing bulk update path so reverse geocoding
  remains centralized.
- Provider-facing responses omit before-values unless metadata exposure allows
  them.
- Revised plans preserve metadata payload validation.

### UI Tests

- Operation rows render `asset.updateMetadata` with changed field names.
- Plan review shows before/after metadata for representative sample assets.
- Empty descriptions and cleared ratings are displayed clearly.
- Coordinate updates display latitude and longitude together.
- Photo review item selection changes update the operation asset set.
- Unknown future metadata operation fields do not break the panel.

### Assistant Flow Tests

Acceptance prompts:

1. "Set the description on the 5 newest photos to Test batch."
2. "Rate my Berlin photos five stars."
3. "Clear the rating from this album."
4. "Shift these scanned photos forward by 2 hours."
5. "Set these photos to latitude 48.8566 and longitude 2.3522."
6. "Set these photos to Paris."

Expected behavior for prompt 6: Pi asks for coordinates instead of creating a
plan.

## Capability Matrix Update

After implementation, add a "Batch asset metadata edits" row to the capability
matrix as `Solid now` for explicit supported fields and `Needs new tool` or
`Out of scope` for place-name-to-coordinate resolution.

## Future Work

- Forward geocoding for place-name edits, with ambiguity handling and a privacy
  decision about data sources.
- Metadata templates for scanned imports.
- Per-asset metadata payloads when different assets need different dates or
  coordinates in one plan.
- Filename/title editing if Gallery adds first-class product support.
- Richer timezone disambiguation for imported camera rolls.
