export const WORKFLOW_MANIFEST = Object.freeze([
  Object.freeze({
    kind: 'create_recent_trip_album',
    flow: 'strict',
    title: 'Create recent trip album',
    classifierDescription:
      'User wants a new album built from a recent trip detected from photo date/location metadata.',
    positiveExamples: Object.freeze([
      'Create an album for my recent trip to USA',
      'Make an album for my recent trip',
      'Put my Japan trip from last week into an album',
    ]),
    negativeExamples: Object.freeze([
      'Add my recent trip photos to Family',
      'How many photos are in my recent trip album?',
      'Pick the best photos from my recent trip',
    ]),
    slots: Object.freeze({
      albumName: Object.freeze({
        type: 'string',
        required: false,
        description: 'Explicit album name if the user gave one.',
      }),
      placeHint: Object.freeze({
        type: 'string',
        required: false,
        description: 'Place text to bias trip detection.',
      }),
    }),
    requiredReadTools: Object.freeze(['findTripCandidates']),
    planTool: 'proposeAlbumFromSelection',
    supportsContinuation: true,
    matrixRow: Object.freeze({
      capability: 'Create recent trip album',
      tier: 'Solid now',
      workflowOrBoundary:
        '`create_recent_trip_album` handles recent-trip detection, candidate choice, and album plan creation from the handle.',
    }),
  }),
  Object.freeze({
    kind: 'rename_or_describe_album',
    flow: 'strict',
    title: 'Rename or describe album',
    classifierDescription:
      'User wants to rename an existing album and/or change its description, leaving its assets unchanged.',
    positiveExamples: Object.freeze([
      'Rename this album to Berlin Weekend',
      'Rename the Family album to Family 2026 and add a description',
      'Change the description on my Italy album',
    ]),
    negativeExamples: Object.freeze([
      'Add my newest photos to the Family album',
      'Delete the Family album',
      'Create an album for my recent trip',
    ]),
    slots: Object.freeze({
      albumRef: Object.freeze({ type: 'string', required: true, description: 'How the user referred to the album.' }),
      newName: Object.freeze({ type: 'string', required: false, description: 'New album title, if renaming.' }),
      description: Object.freeze({ type: 'string', required: false, description: 'New description, if setting one.' }),
    }),
    requiredReadTools: Object.freeze(['listAlbums']),
    planTool: 'proposeAlbumOperations',
    supportsContinuation: false,
    matrixRow: Object.freeze({
      capability: 'Rename or describe album',
      tier: 'Solid now',
      workflowOrBoundary: 'Direct album-detail update plan; preserve unspecified fields.',
    }),
  }),
  Object.freeze({
    kind: 'add_photos_to_album',
    flow: 'hybrid',
    title: 'Add photos to existing album',
    classifierDescription: 'User wants to add a metadata-describable set of photos to an existing album.',
    positiveExamples: Object.freeze([
      'Add my newest 20 photos to Family',
      'Add my Berlin photos from last weekend to the Trips album',
    ]),
    negativeExamples: Object.freeze([
      'Add the good ones to Family',
      'Create a new album from my Berlin photos',
    ]),
    slots: Object.freeze({
      albumRef: Object.freeze({ type: 'string', required: true, description: 'Target album the user named.' }),
      sourceDescription: Object.freeze({
        type: 'string',
        required: true,
        description: 'Metadata description of the photos to add.',
      }),
    }),
    requiredReadTools: Object.freeze(['listAlbums', 'resolveAssetSearchFilters', 'searchAssets']),
    planTool: 'proposeAlbumOperations',
    supportsContinuation: false,
    matrixRow: Object.freeze({
      capability: 'Add photos to existing album',
      tier: 'Solid now',
      workflowOrBoundary:
        'Pi resolves the source; Gallery owns album lookup, duplicate-safe add, and plan creation.',
    }),
  }),
  Object.freeze({
    kind: 'archive_assets',
    flow: 'hybrid',
    title: 'Archive or unarchive photos',
    classifierDescription:
      'User wants to archive or unarchive a metadata-describable set of photos (recency/date/type bound).',
    positiveExamples: Object.freeze([
      'Archive my newest 50 photos',
      'Unarchive my last 10 photos',
      'Move my 2024 videos out of the archive',
    ]),
    negativeExamples: Object.freeze([
      'Archive the best photos from last weekend',
      'Archive the Family album',
      'Add my newest 20 photos to Family',
    ]),
    slots: Object.freeze({
      archived: Object.freeze({
        type: 'boolean',
        required: false,
        description: 'true to archive, false to unarchive (default archive).',
      }),
      sourceDescription: Object.freeze({
        type: 'string',
        required: true,
        description: 'Metadata description of the photos to (un)archive.',
      }),
    }),
    requiredReadTools: Object.freeze(['searchAssets']),
    planTool: 'proposeAssetBatchFromSelection',
    supportsContinuation: false,
    matrixRow: Object.freeze({
      capability: 'Archive or unarchive photos',
      tier: 'Solid now',
      workflowOrBoundary:
        'Pi resolves a recency/date/type source; Gallery owns the batch archive plan from the handle.',
    }),
  }),
  Object.freeze({
    kind: 'favorite_assets',
    flow: 'hybrid',
    title: 'Favorite or unfavorite photos',
    classifierDescription: 'User wants to favorite or unfavorite a metadata-describable set of photos.',
    positiveExamples: Object.freeze([
      'Favorite my newest 10 photos',
      'Unfavorite my last 5 photos',
      'Like my newest 20 photos',
    ]),
    negativeExamples: Object.freeze([
      'Favorite the best 3 photos from last weekend',
      'Favorite the Family album',
      'Add the good ones to Family',
    ]),
    slots: Object.freeze({
      favorite: Object.freeze({
        type: 'boolean',
        required: false,
        description: 'true to favorite, false to unfavorite (default favorite).',
      }),
      sourceDescription: Object.freeze({
        type: 'string',
        required: true,
        description: 'Metadata description of the photos to (un)favorite.',
      }),
    }),
    requiredReadTools: Object.freeze(['searchAssets']),
    planTool: 'proposeAssetBatchFromSelection',
    supportsContinuation: false,
    matrixRow: Object.freeze({
      capability: 'Favorite or unfavorite photos',
      tier: 'Solid now',
      workflowOrBoundary:
        'Pi resolves a recency/date/type source; Gallery owns the batch favorite plan from the handle.',
    }),
  }),
  Object.freeze({
    kind: 'tag_assets',
    flow: 'hybrid',
    title: 'Tag photos (add)',
    classifierDescription:
      'User wants to add a tag to a metadata-describable set of photos (add-only; no tag removal).',
    positiveExamples: Object.freeze([
      'Tag my newest 20 photos as Travel',
      'Add the tag Spring Break to my newest 50 photos',
      'Add the Travel tag to my last 10 photos',
    ]),
    negativeExamples: Object.freeze([
      'Remove the Travel tag from my newest 20',
      'Tag the best ones as Travel',
      'Add my newest 20 photos to the Travel album',
    ]),
    slots: Object.freeze({
      sourceDescription: Object.freeze({
        type: 'string',
        required: true,
        description: 'Metadata description of the photos to tag.',
      }),
      tagName: Object.freeze({ type: 'string', required: true, description: 'Tag name to add.' }),
    }),
    requiredReadTools: Object.freeze(['searchAssets']),
    planTool: 'proposeAssetBatchFromSelection',
    supportsContinuation: false,
    matrixRow: Object.freeze({
      capability: 'Tag photos (add)',
      tier: 'Solid now',
      workflowOrBoundary: 'Add-only; Pi resolves the source; Gallery owns the batch tag-add plan from the handle.',
    }),
  }),
  Object.freeze({
    kind: 'rename_or_describe_space',
    flow: 'strict',
    title: 'Rename or describe space',
    classifierDescription:
      'User wants to rename a shared space and/or change its description, leaving members and assets unchanged.',
    positiveExamples: Object.freeze([
      'Rename the Family space to Family 2026',
      'Set the description on the Trips space to Our adventures',
      'Change the description on my Family space',
    ]),
    negativeExamples: Object.freeze([
      'Rename the Family album to Family 2026',
      'Add Alex to the Family space',
      'Make Alex an editor in Family',
    ]),
    slots: Object.freeze({
      spaceRef: Object.freeze({ type: 'string', required: true, description: 'How the user referred to the space.' }),
      newName: Object.freeze({ type: 'string', required: false, description: 'New space name, if renaming.' }),
      description: Object.freeze({ type: 'string', required: false, description: 'New description, if setting one.' }),
    }),
    requiredReadTools: Object.freeze(['listSpaces']),
    planTool: 'proposeAlbumOperations',
    supportsContinuation: false,
    matrixRow: Object.freeze({
      capability: 'Rename or describe space',
      tier: 'Solid now',
      workflowOrBoundary: 'Direct space-detail update plan; preserve unspecified fields.',
    }),
  }),
  Object.freeze({
    kind: 'manage_space_members',
    flow: 'strict',
    title: 'Add or remove space members',
    classifierDescription: 'User wants to add or remove members of a shared space, optionally with a role.',
    positiveExamples: Object.freeze([
      'Add Alex to the Family space as editor',
      'Add Sam and Jo to the Trips space',
      'Remove Bob from the Family space',
    ]),
    negativeExamples: Object.freeze([
      'Add my newest 20 photos to the Family space',
      'Make Alex an editor in Family',
      'Rename the Family space to Family 2026',
    ]),
    slots: Object.freeze({
      action: Object.freeze({ type: 'string', required: true, description: 'add or remove.' }),
      memberQueries: Object.freeze({
        type: 'array',
        required: true,
        description: 'Member names or emails to add or remove.',
      }),
      spaceRef: Object.freeze({ type: 'string', required: true, description: 'How the user referred to the space.' }),
      role: Object.freeze({
        type: 'string',
        required: false,
        description: 'editor or viewer (default viewer on add).',
      }),
    }),
    requiredReadTools: Object.freeze(['listSpaces', 'readSpace', 'searchUsers']),
    planTool: 'proposeAlbumOperations',
    supportsContinuation: false,
    matrixRow: Object.freeze({
      capability: 'Add or remove space members',
      tier: 'Solid now',
      workflowOrBoundary: 'Resolve members; guard owner/self/last-owner removal; propose the membership plan.',
    }),
  }),
  Object.freeze({
    kind: 'change_member_role',
    flow: 'strict',
    title: "Change a space member's role",
    classifierDescription: "User wants to change a shared-space member's role to editor or viewer.",
    positiveExamples: Object.freeze([
      'Make Alex an editor in the Family space',
      "Change Bob's role to viewer in Trips",
      'Make Sam a viewer in Family',
    ]),
    negativeExamples: Object.freeze([
      'Add Alex to the Family space',
      'Remove Bob from the Family space',
      'Rename the Family space to Family 2026',
    ]),
    slots: Object.freeze({
      memberQuery: Object.freeze({ type: 'string', required: true, description: 'The member name or email.' }),
      role: Object.freeze({ type: 'string', required: true, description: 'editor or viewer.' }),
      spaceRef: Object.freeze({ type: 'string', required: true, description: 'How the user referred to the space.' }),
    }),
    requiredReadTools: Object.freeze(['listSpaces', 'readSpace', 'searchUsers']),
    planTool: 'proposeAlbumOperations',
    supportsContinuation: false,
    matrixRow: Object.freeze({
      capability: "Change a space member's role",
      tier: 'Solid now',
      workflowOrBoundary: 'Resolve the member; guard owner/self/no-op; propose the role-change plan.',
    }),
  }),
  Object.freeze({
    kind: 'create_album_from_source',
    flow: 'hybrid',
    title: 'Create album from a source',
    classifierDescription:
      'User wants a NEW album built from a metadata-describable set of photos (recency/date/type), not a recent trip.',
    positiveExamples: Object.freeze([
      'Make an album of my newest 50 photos',
      'Create an album from my 2024 photos called Best of 2024',
      'Build an album of my newest 100 photos',
    ]),
    negativeExamples: Object.freeze([
      'Create an album for my recent trip to USA',
      'Add my newest 20 photos to Family',
      'Make an album of the best photos',
    ]),
    slots: Object.freeze({
      sourceDescription: Object.freeze({
        type: 'string',
        required: true,
        description: 'Metadata description of the photos for the new album.',
      }),
      albumName: Object.freeze({
        type: 'string',
        required: false,
        description: 'Album name (defaults to New Album).',
      }),
    }),
    requiredReadTools: Object.freeze(['searchAssets']),
    planTool: 'proposeAlbumFromSelection',
    supportsContinuation: false,
    matrixRow: Object.freeze({
      capability: 'Create album from a source',
      tier: 'Solid now',
      workflowOrBoundary: 'Pi resolves a recency/date/type source; Gallery owns album creation from the handle.',
    }),
  }),
]);

const byKind = new Map(WORKFLOW_MANIFEST.map((entry) => [entry.kind, entry]));

export const getWorkflowManifestEntry = (kind) => byKind.get(kind);
export const listWorkflowKinds = () => WORKFLOW_MANIFEST.map((entry) => entry.kind);
