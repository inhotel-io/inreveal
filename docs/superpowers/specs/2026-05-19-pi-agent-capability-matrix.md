# Pi Agent Capability Matrix

Status: planning artifact
Date: 2026-05-19
Branch: `explore/pi-agent-brainstorm`

## Purpose

This matrix defines what a Gallery assistant should be able to do for users,
whether the current MCP/runtime surface supports it, and what needs to be tested
before we can call the capability solid.

It is intentionally user-task focused. The assistant should be measured by
whether a normal prompt can produce a readable answer, permission request,
reviewable plan, applied-plan card, and continued chat flow. Raw MCP tool
availability is necessary, but not enough.

## Current Capability Surface

Current read tools:

- `searchAssets`: Smart, OCR, description, filename, and metadata search by
  date, created/updated ranges, location labels, camera fields, favorite state,
  album membership, tags, people, shared-space people, shared-space scope,
  visibility, rating including unrated, media type, bounded limit, order, and
  page continuation.
- `resolveAssetSearchFilters`: resolves user-facing people, tag, album, shared
  space, location, camera make/model, and lens names into `searchAssets` filters
  or structured ambiguity/denied/no-match results.
- `readAssetMetadata`: timestamps, location labels, camera fields, rating,
  favorite state, visibility, and tags for selected assets.
- `readAssetPreviews`: preview media references for selected assets.
- `readAssetOriginals`: original media references for selected assets, gated by
  permission preset.
- `listAlbums`: visible album summaries.
- `readAlbum`: visible album details and asset ids.
- `listSpaces`: visible shared-space summaries.
- `readSpace`: visible shared-space details, member summaries, and bounded asset
  ids.
- `searchUsers`: visible Gallery users for shared-space member planning.

Current planning tools:

- `proposeAlbumOperations`: creates a reviewable plan.
- `reviseProposedOperations`: replaces an existing plan after user feedback.
- `summarizePlan`: summarizes an existing plan.
- `proposeAssetBatchFromSearch`: proposes reviewable favorite, archive, tag,
  metadata, or rotate operations from a declarative or previous search source.

Current reviewable operation types:

- Albums: `album.create`, `album.addAssets`, `album.removeAssets`,
  `album.updateDetails`, `album.setCover`.
- Spaces: `space.create`, `space.addAssets`, `space.removeAssets`,
  `space.updateDetails`, `space.addMembers`, `space.removeMembers`,
  `space.updateMemberRole`.
- Assets: `asset.rotate`, `asset.setFavorite`, `asset.setArchive`,
  `asset.addTag`, `asset.removeTag`, `asset.updateMetadata`.

Safety invariant: MCP tools do not directly mutate the gallery. Writes must be
represented as operation plans and applied by Gallery after user review.

## Capability Tiers

- **Solid now**: supported by current MCP tools and operation plans. Needs
  regression coverage and prompt examples, not new backend capability.
- **Constrained now**: possible only when the user provides enough metadata or
  the assistant can inspect a bounded candidate set. Needs UX/prompt guardrails.
- **Needs new tool**: cannot be reliable with the current MCP surface.
- **Out of scope**: intentionally unsupported until product policy changes.

## Flow Ownership Matrix

Flow ownership defines whether Pi may freely choose MCP tool sequencing or
whether Gallery owns the workflow for a productized capability.

- **Strict**: Gallery code owns the procedure. Pi may fill user-facing slots
  such as names, place hints, counts, or final copy, but it cannot choose a
  different tool sequence once the supported intent matches.
- **Hybrid**: Pi may use open exploration to resolve a source, target, or
  subjective choice, then Gallery owns the write-plan procedure.
- **Open read flow**: Pi may choose read/search tools flexibly because the task
  is exploratory and non-mutating.
- **Open discovery, strict plan**: Pi may inspect and suggest candidates, but
  any write action still goes through deterministic plan creation.

Hard invariants apply to every flow: no claimed plan unless a persisted plan id
exists, no direct write tools, no large raw asset ID lists in model-facing
responses, selection handles for asset sets, and recoverable tool mistakes
retried only when the correction is mechanical.

| Capability                       | Flow ownership              | Workflow or boundary                                                                                                                                                                                                  |
| -------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create recent trip album         | Strict                      | `create_recent_trip_album` handles recent-trip detection, candidate choice, and album plan creation from the handle. See [strict recent trip album design](./2026-05-28-pi-agent-strict-recent-trip-album-design.md). |
| Add photos to existing album     | Hybrid                      | Pi may resolve the source; Gallery owns album lookup, duplicate-safe add semantics, and plan creation.                                                                                                                |
| Remove wrong photos from album   | Hybrid                      | Strict when metadata-identifiable; open discovery when visual or subjective matching is required.                                                                                                                     |
| Rename or describe album         | Strict                      | Direct album-detail update plan; preserve unspecified fields.                                                                                                                                                         |
| Set album cover                  | Hybrid                      | Pi or Gallery may inspect bounded candidates; Gallery owns cover plan creation and validation.                                                                                                                        |
| Create shared space              | Strict                      | Space create and optional add-assets plan with temporary target validation.                                                                                                                                           |
| Add/remove photos in space       | Hybrid                      | Pi may resolve source assets; Gallery owns space membership plan creation.                                                                                                                                            |
| Update space details             | Strict                      | Direct space-detail update plan; preserve assets and members.                                                                                                                                                         |
| Add or remove space members      | Strict                      | Gallery owns user lookup, role defaults, membership validation, and plan creation.                                                                                                                                    |
| Change space member roles        | Strict                      | Gallery owns role transition validation and plan creation.                                                                                                                                                            |
| People-based organization        | Hybrid                      | Pi may resolve names and filters; Gallery owns the destination action plan.                                                                                                                                           |
| Natural-language filtered search | Open read flow              | Pi may explore filters and summarize results, while handles remain the asset-set boundary.                                                                                                                            |
| Mark favorites                   | Hybrid                      | Open curation for subjective "best"; strict favorite plan once a bounded source exists.                                                                                                                               |
| Archive assets                   | Strict when metadata-bound  | Metadata-identifiable archive requests use deterministic search-to-plan creation.                                                                                                                                     |
| Add or remove tags               | Strict                      | Tag action plan from resolved source and tag payload.                                                                                                                                                                 |
| Batch asset metadata edits       | Strict                      | Explicit supported fields use deterministic field validation, before/after review metadata, and plan creation.                                                                                                        |
| Rotate images                    | Hybrid                      | Strict for explicit targets and angle; open discovery for "sideways" detection.                                                                                                                                       |
| Answer album/library questions   | Open read flow              | Pi may use read/search tools and answer without write planning.                                                                                                                                                       |
| Summarize a proposed plan        | Strict                      | Summary must be generated from a persisted plan.                                                                                                                                                                      |
| Revise a plan                    | Strict                      | Revision must replace a persisted plan and never apply it.                                                                                                                                                            |
| “Best photos” curation           | Hybrid                      | Open bounded curation; strict resulting album, favorite, archive, tag, or metadata plan.                                                                                                                              |
| Visual cleanup                   | Open discovery, strict plan | Candidate inspection remains suggestive; any mutation requires a reviewable plan.                                                                                                                                     |
| Recent upload organization       | Strict when bounded         | Upload/date bounded requests use deterministic handle-to-plan creation.                                                                                                                                               |
| Screenshot/document cleanup      | Hybrid                      | Metadata/OCR-identifiable cleanup can be strict; visual-only cleanup remains open discovery before plan creation.                                                                                                     |
| Story/memory albums              | Hybrid                      | Open source resolution until a date/person/place source is concrete, then strict album plan creation.                                                                                                                 |

<!-- generated:workflows:start -->

### Implemented strict/hybrid workflows

Generated from `agent-runner/src/strict-workflows/manifest.generated.json`. Do not edit by hand; run `pnpm --dir server sync:agent-capabilities`.

| Kind                       | Flow   | Required read tools                                       | Plan tool                        |
| -------------------------- | ------ | --------------------------------------------------------- | -------------------------------- |
| `create_recent_trip_album` | Strict | `findTripCandidates`                                      | `proposeAlbumFromSelection`      |
| `rename_or_describe_album` | Strict | `listAlbums`                                              | `proposeAlbumOperations`         |
| `add_photos_to_album`      | Hybrid | `listAlbums`, `resolveAssetSearchFilters`, `searchAssets` | `proposeAlbumOperations`         |
| `archive_assets`           | Hybrid | `searchAssets`                                            | `proposeAssetBatchFromSelection` |
| `favorite_assets`          | Hybrid | `searchAssets`                                            | `proposeAssetBatchFromSelection` |
| `tag_assets`               | Hybrid | `searchAssets`                                            | `proposeAssetBatchFromSelection` |
| `rename_or_describe_space` | Strict | `listSpaces`                                              | `proposeAlbumOperations`         |
| `manage_space_members`     | Strict | `listSpaces`, `readSpace`, `searchUsers`                  | `proposeAlbumOperations`         |
| `change_member_role`       | Strict | `listSpaces`, `readSpace`, `searchUsers`                  | `proposeAlbumOperations`         |
| `create_album_from_source` | Hybrid | `searchAssets`                                            | `proposeAlbumFromSelection`      |

<!-- generated:workflows:end -->

## Core Capability Matrix

| Capability                       | User prompt examples                                                        | Tier                                      | Current path                                                                                                                                                                                                                 | Required user-visible behavior                                                                                                                                              | Regression scenarios                                                                                                                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create event or trip album       | “Make an album of my Berlin photos from last weekend.”                      | Solid now                                 | Search date/location, optionally read metadata/previews, propose `album.create` + `album.addAssets`.                                                                                                                         | Shows a plan with destination album, representative thumbnails, selected count, and no direct write before apply.                                                           | Date window with results; date window with no results; create-only if no matching assets; plan apply keeps chat open.                                                                                                         |
| Add photos to existing album     | “Add my newest 20 photos to Family.”                                        | Solid now                                 | `listAlbums`, `readAlbum` if needed, `searchAssets`, propose `album.addAssets`.                                                                                                                                              | Resolves album by visible album list, asks/clarifies on ambiguous album names, avoids duplicate asset adds where possible.                                                  | Unique album match; ambiguous album names; album already contains some assets; empty search result.                                                                                                                           |
| Remove wrong photos from album   | “Remove screenshots from this album.”                                       | Solid now for metadata-identifiable cases | `readAlbum`, `readAssetMetadata`, optionally `readAssetPreviews`, propose `album.removeAssets`.                                                                                                                              | Explains what will be removed, shows reversible plan before apply, never deletes assets.                                                                                    | Metadata-only screenshot match; preview-required visual match; all assets excluded; no matching assets.                                                                                                                       |
| Rename or describe album         | “Rename this album to Berlin Weekend and add a description.”                | Solid now                                 | `listAlbums`, propose `album.updateDetails`.                                                                                                                                                                                 | Shows changed fields inline and preserves unspecified fields.                                                                                                               | Rename only; description only; ambiguous album name; stale album id during apply.                                                                                                                                             |
| Set album cover                  | “Pick a better cover for this album.”                                       | Solid now when previews allowed           | `readAlbum`, `readAssetPreviews`, propose `album.setCover`.                                                                                                                                                                  | Shows chosen cover thumbnail and lets user change plan through chat or exclude operation.                                                                                   | Preview permission denied; album has no assets; album already has requested cover; set cover in a new dependent album plan.                                                                                                   |
| Create shared space              | “Create a Family space for these photos.”                                   | Solid now                                 | Search/read candidates, propose `space.create` + optional `space.addAssets`.                                                                                                                                                 | Presents the new space name, description/color, and selected assets before apply.                                                                                           | Create empty space; create and add assets; dependent temporary target validation.                                                                                                                                             |
| Add/remove photos in space       | “Add these vacation photos to the Family space.”                            | Solid now                                 | `listSpaces`, `readSpace`, search/read candidates, then propose `space.addAssets` or `space.removeAssets`.                                                                                                                   | Makes it clear this changes space membership, not the original library asset.                                                                                               | Unique space match; ambiguous space names; no assets selected; already-in-space assets; remove without deleting; stale space id.                                                                                              |
| Update space details             | “Rename Family to Family 2026.”                                             | Solid now                                 | `listSpaces`, `readSpace` if needed, propose `space.updateDetails`.                                                                                                                                                          | Shows changed fields and leaves assets/members untouched.                                                                                                                   | Rename only; color/description update; ambiguous space name; stale space id during apply.                                                                                                                                     |
| Add or remove space members      | “Invite Alex to the Family space.”                                          | Solid now                                 | `listSpaces`, `searchUsers`, `readSpace`, propose `space.addMembers` or `space.removeMembers`.                                                                                                                               | Shows who will be added or removed, their role, and the target space before apply.                                                                                          | Unique user match; ambiguous user query; user already a member; removing non-member; removing self is rejected; last-owner removal blocked.                                                                                   |
| Change space member roles        | “Make Alex an editor in Family.”                                            | Solid now                                 | `listSpaces`, `searchUsers`, `readSpace`, propose `space.updateMemberRole`.                                                                                                                                                  | Shows the current and proposed role and requires plan approval before changing permissions.                                                                                 | Viewer to editor; editor to viewer; no-op role change; ambiguous user; demoting self is rejected; last-owner demotion blocked.                                                                                                |
| People-based organization        | “Add photos of Alex to a Family album.”                                     | Solid now                                 | `resolveAssetSearchFilters` for person/space names, `searchAssets` with `personIds` or `spaceId` + `spacePersonIds`, then propose album/space/tag/favorite/archive/rotate operations.                                        | Clarifies ambiguous people, shows selected assets before apply, and keeps chat open after apply.                                                                            | Global person; shared-space person; same-name ambiguity; no matching assets; mixed people + tag + date filters.                                                                                                               |
| Natural-language filtered search | “Find photos of Alex in Berlin from last summer that are not in any album.” | Solid now                                 | `resolveAssetSearchFilters` for names, then `searchAssets` with metadata, smart, OCR, description, or filename mode plus structured filters and pagination.                                                                  | Shows approval when needed, summarizes bounded results, asks to narrow large result sets, and feeds selection handles or declarative sources into reviewable plans.         | People + place + date + unalbumed; 5-star videos by country; OCR invoice screenshots; smart search inside a Family space; Sony camera date filters.                                                                           |
| Mark favorites                   | “Favorite the best photos from Portugal.”                                   | Constrained now                           | Search by metadata and/or previews, propose `asset.setFavorite`.                                                                                                                                                             | If “best” is subjective, activity preview should show inspection and the plan should be easy to review visually.                                                            | Metadata-only favorite request; preview-based curation; permission denied for previews; large candidate set.                                                                                                                  |
| Archive assets                   | “Archive old screenshots from 2024.”                                        | Solid now for metadata-identifiable cases | Search date/media/tag metadata, propose `asset.setArchive`.                                                                                                                                                                  | States that assets move to archive, not trash/delete, and shows affected count.                                                                                             | Exact metadata filters; no matches; mixed photos/videos; user revises plan to exclude items.                                                                                                                                  |
| Add or remove tags               | “Tag these Berlin photos as Travel.”                                        | Solid now                                 | Search/read metadata, propose `asset.addTag` or `asset.removeTag`.                                                                                                                                                           | Shows tag name or existing tag id resolution and selected assets.                                                                                                           | New tag by name; existing tag removal; ambiguous tag names if exposed; invalid payload with both tag id and name rejected.                                                                                                    |
| Batch asset metadata edits       | “Set the description on the 5 newest photos to Test batch.”                 | Solid now for explicit supported fields   | Search or inspect the target set, then propose `asset.updateMetadata` through `proposeAssetBatchFromSearch` or `proposeAlbumOperations`. Supports description, rating, date/time, timezone, and explicit latitude/longitude. | Shows field-level before/after metadata, selected count, representative assets, and coordinate warnings before apply; asks for coordinates instead of guessing place names. | Description update; clear rating; absolute date/time; relative timestamp shift; timezone update; explicit coordinates; place name asks for coordinates; latitude without longitude asks for longitude; apply keeps chat open. |
| Rotate images                    | “Rotate the sideways photos clockwise.”                                     | Constrained now                           | Read previews/originals if allowed, propose `asset.rotate`.                                                                                                                                                                  | Shows thumbnails and rotation direction; only supports valid rotation angles.                                                                                               | Valid 90/180/270 angle; unsupported angle rejected; non-image assets excluded; preview permission denied.                                                                                                                     |
| Answer album/library questions   | “How many photos are in this album?”                                        | Solid now                                 | `listAlbums`, `readAlbum`, optionally `readAssetMetadata`.                                                                                                                                                                   | Gives a direct answer and cites the album or search scope in plain language.                                                                                                | Album count; album date range; no album found; ambiguous album name.                                                                                                                                                          |
| Summarize a proposed plan        | “What exactly will this plan change?”                                       | Solid now                                 | `summarizePlan`.                                                                                                                                                                                                             | Produces a concise human summary without raw operation ids unless details are requested.                                                                                    | Whole-plan summary; risk-focused summary; summary after revision; missing plan id validation.                                                                                                                                 |
| Revise a plan                    | “Actually exclude videos and keep only 30 photos.”                          | Solid now                                 | `reviseProposedOperations` with previous plan id and replacement operations.                                                                                                                                                 | Replaces the displayed plan, keeps prior chat context, and does not apply either plan until user approval.                                                                  | Remove subset; add dependent operation; invalid temporary target; apply revised plan then continue chat.                                                                                                                      |

## High-Value Constrained Capabilities

These are attractive user workflows, but they need clear guardrails because the
current tool surface does not provide a specialized classifier or unbounded
semantic search.

| Capability                  | Why users want it                                             | Current feasibility                                                                                                                                               | Guardrail                                                                                            |
| --------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| “Best photos” curation      | Users want the assistant to pick highlights.                  | Solid now for bounded sources using ratings, favorites, metadata, and previews across bounded candidates; suggested highlights are not objective quality scoring. | Ask for a scope when broad: album, shared space, date range, search/filter, selection, or max count. |
| Visual cleanup              | Remove blurry, dark, duplicate-looking, or irrelevant photos. | Constrained now with previews, but not robust for hundreds/thousands without scoring tools.                                                                       | Treat as suggestions; show thumbnails; avoid auto-apply.                                             |
| Recent upload organization  | “Organize everything I uploaded today.”                       | Works if search can bound by time and result limit.                                                                                                               | Chunk large result sets and explain any limit.                                                       |
| Screenshot/document cleanup | Archive screenshots or documents.                             | Works if media metadata or tags identify them; weak if detection requires image understanding.                                                                    | Prefer metadata filters; ask for confirmation on visual-only matches.                                |
| Story/memory albums         | “Make a birthday highlights album.”                           | Works when date/location/album context is known; weak for people/event recognition.                                                                               | Ask for date/person/album context if semantic cues are not searchable.                               |

## Needs New MCP Tool

Next expansion candidates: semantic duplicate cleanup or quality scoring.

| Capability                              | Missing capability                                                      | Candidate tool direction                                                          |
| --------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Duplicate/similar-photo cleanup         | No duplicate cluster or perceptual similarity surface.                  | `findSimilarAssets` or `listDuplicateGroups`.                                     |
| Image quality scoring                   | No blur/exposure/aesthetic score tool.                                  | `analyzeAssetQuality` or precomputed quality metadata in search/read metadata.    |
| Trash/delete                            | Operation plans support archive, not delete/trash.                      | Product decision first; then `asset.trash` operation with stricter risk UI.       |
| Place-name-to-coordinate metadata edits | No forward geocoder for turning names such as “Paris” into coordinates. | Forward-geocoding resolver with ambiguity handling before `asset.updateMetadata`. |
| Edits beyond rotation                   | No crop, enhance, or batch adjustments.                                 | Separate image-edit operation family with preview artifacts.                      |
| Sharing/export/download workflows       | No direct operation plan for sharing links, exports, or downloads.      | Sharing/export tools with explicit privacy review.                                |

## Out Of Scope Until Policy Changes

- Direct mutation MCP tools that bypass Gallery plan review.
- Silent deletion or irreversible destructive changes.
- Exposing provider secrets, runner tokens, prompts, or raw original files in
  chat.
- Third-party MCP server access through this first-party runner path.
- Fully autonomous background library reorganization without a user-reviewed
  plan.

## Test Matrix

Every “solid now” capability should have at least one assistant-flow regression
that proves the user-level behavior, not only DTO validation.

| Layer               | Required coverage                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| MCP contract        | Valid examples parse; common malformed calls return actionable correction hints; approval retry uses only `toolCallId`.                          |
| Runner/session flow | User message appears immediately; assistant streams; read approval blocks; approval resumes runner; plan appears; apply does not terminate chat. |
| Plan review         | Destination grouping, selected counts, representative thumbnails, operation toggles, inline field edits, technical details disclosure.           |
| Apply flow          | Applied-plan card appears in transcript; partial success/failure is visible; user can continue chatting in same session.                         |
| Permissions         | Careful blocks previews/originals; visual organizer allows previews; local power user allows broader access; approval behavior matches settings. |
| Scale               | Bounded searches, large candidate counts, thumbnail strip caps, no eager rendering of hundreds/thousands of assets.                              |
| Ambiguity           | Duplicate album names, ambiguous “best” prompts, no matches, stale targets, permission denial, provider/model failures.                          |

## Recommended Product Smoke Prompts

Use these prompts as manual and automated acceptance scenarios:

1. “Create an album called Today’s Test with the 5 newest photos.”
2. “Add the remaining photos that are not already in the Family album.”
3. “Remove screenshots from this album.”
4. “Pick a cover photo for this album.”
5. “Create a Family space and add these photos.”
6. “Add Alex as an editor to the Family space.”
7. “Remove Alex from the Family space.”
8. “Archive old screenshots from 2024.”
9. “Tag my Berlin photos as Travel.”
10. “Rotate these sideways photos clockwise.”
11. “What will this plan change?”
12. “Actually exclude videos and show me the revised plan.”
13. “Find photos of Alex in Berlin from last summer that are not in any album.”
14. “Create an album from 5-star videos from Japan.”
15. “Find screenshots from 2024 that mention invoices.”
16. “Add beach sunset photos from the Family space to a new album.”
17. “Find photos taken with my Sony camera in May.”
18. “Set the description on the 5 newest photos to Test batch.”
19. “Clear the rating from this album.”
20. “Shift these scanned photos forward by 2 hours.”
21. “Set these photos to latitude 48.8566 and longitude 2.3522.”
22. “Set these photos to Paris.”
23. “Suggest 5 highlights from this album and make an album called Highlights.”
24. “Favorite the best 3 photos from last weekend.”
25. “Pick a cover from this album.”
26. “Pick the best photos from my library.”
27. “Suggest 20 highlights from this album.”
28. “Suggest highlights from last weekend.”
29. “Create an album for my recent trip to USA.”

## Next Steps

1. Turn the “solid now” rows into an automated assistant regression suite.
2. Add prompt/docs examples for each smoke prompt so smaller models learn the
   intended tool sequence.
3. The batch-action (`archive_assets`, `favorite_assets`, `tag_assets`),
   space-detail/membership (`rename_or_describe_space`, `manage_space_members`,
   `change_member_role`), and general `create_album_from_source` workflows now ship
   on top of `create_recent_trip_album`, `rename_or_describe_album`, and
   `add_photos_to_album`, each with L1 (component) + L3 (live, read-only) eval
   coverage and a shared metadata source-resolver (recency + relative dates + media
   type, behind a clean-source precision gate).
4. Space disambiguation (“which space/user did you mean?”) currently re-prompts via
   `needs_input` rather than a durable continuation — a follow-up could add
   candidate-resume like the trip workflow. Named-entity / location / semantic
   sources still hand off (a later spec may integrate `resolveAssetSearchFilters`).
