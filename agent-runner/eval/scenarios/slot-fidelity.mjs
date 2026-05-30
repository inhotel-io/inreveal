// Slot fidelity: exact normalized slot values. Most of these hit the regex
// fast-path (deterministic), so they lock the extractor + alias normalization;
// a couple force the LLM path to check it produces usable, correctly-keyed slots.
export default [
  {
    id: 'slots.usa.alias.unitedstates',
    category: 'slots',
    prompt: 'Create an album for my recent trip to United States',
    expect: { kind: 'create_recent_trip_album', slots: { placeHint: 'USA', albumName: 'USA Trip' } },
  },
  {
    id: 'slots.usa.alias.us-dot',
    category: 'slots',
    prompt: 'Create an album for my recent trip to U.S.',
    expect: { kind: 'create_recent_trip_album', slots: { placeHint: 'USA' } },
  },
  {
    id: 'slots.usa.alias.the-united-states',
    category: 'slots',
    prompt: 'Create an album for my recent trip to the United States',
    expect: { kind: 'create_recent_trip_album', slots: { placeHint: 'USA' } },
  },
  {
    id: 'slots.trip.place-and-name',
    category: 'slots',
    prompt: 'Create an album for my recent trip to USA called Spring Break',
    expect: { kind: 'create_recent_trip_album', slots: { placeHint: 'USA', albumName: 'Spring Break' } },
  },
  {
    id: 'slots.trip.quoted-name',
    category: 'slots',
    prompt: 'Create an album for my recent trip called "Bob\'s Vacation"',
    expect: { kind: 'create_recent_trip_album', slots: { albumName: "Bob's Vacation" } },
  },
  {
    id: 'slots.trip.default-name',
    category: 'slots',
    prompt: 'Make an album for my recent trip',
    expect: { kind: 'create_recent_trip_album', slots: { albumName: 'Recent Trip' } },
  },
  {
    id: 'slots.rename.ref-and-name',
    category: 'slots',
    prompt: 'rename the Family album to Family 2026',
    expect: { kind: 'rename_or_describe_album', slots: { albumRef: 'Family', newName: 'Family 2026' } },
  },
];
