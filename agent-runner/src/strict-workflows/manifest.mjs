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
]);

const byKind = new Map(WORKFLOW_MANIFEST.map((entry) => [entry.kind, entry]));

export const getWorkflowManifestEntry = (kind) => byKind.get(kind);
export const listWorkflowKinds = () => WORKFLOW_MANIFEST.map((entry) => entry.kind);
