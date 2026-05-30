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
]);

const byKind = new Map(WORKFLOW_MANIFEST.map((entry) => [entry.kind, entry]));

export const getWorkflowManifestEntry = (kind) => byKind.get(kind);
export const listWorkflowKinds = () => WORKFLOW_MANIFEST.map((entry) => entry.kind);
