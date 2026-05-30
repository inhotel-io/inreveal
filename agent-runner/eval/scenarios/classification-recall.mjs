// Recall: does the agent route real paraphrases to the right workflow, with
// slots that survive parseSlots? `slotsSurvive: true` is the key assertion — a
// correctly-classified prompt whose slots get rejected is still a recall miss.
export default [
  // create_recent_trip_album ------------------------------------------------
  {
    id: 'recall.trip.usa.canonical',
    category: 'recall',
    prompt: 'Create an album for my recent trip to USA',
    expect: { kind: 'create_recent_trip_album', slotsSurvive: true, slots: { placeHint: 'USA' } },
  },
  {
    id: 'recall.trip.noplace',
    category: 'recall',
    prompt: 'Make an album for my recent trip',
    expect: { kind: 'create_recent_trip_album', slotsSurvive: true },
  },
  {
    id: 'recall.trip.japan.paraphrase',
    category: 'recall',
    prompt: 'put my Japan trip from last week into an album',
    expect: { kind: 'create_recent_trip_album', slotsSurvive: true, slots: { placeHint: 'Japan' } },
  },
  {
    id: 'recall.trip.italy.uncommon-verb',
    category: 'recall',
    prompt: 'throw the pics from our Italy getaway into a new album',
    expect: { kind: 'create_recent_trip_album', slotsSurvive: true, slots: { placeHint: /italy/i } },
  },
  {
    id: 'recall.trip.lisbon.weekend',
    category: 'recall',
    prompt: 'build an album out of my weekend in Lisbon',
    expect: { kind: 'create_recent_trip_album', slotsSurvive: true, slots: { placeHint: /lisbon/i } },
  },
  {
    id: 'recall.trip.portugal.question',
    category: 'recall',
    prompt: 'can you make an album from my trip to Portugal?',
    expect: { kind: 'create_recent_trip_album', slotsSurvive: true, slots: { placeHint: /portugal/i } },
  },
  {
    id: 'recall.trip.roadtrip.noplace',
    category: 'recall',
    prompt: 'assemble an album for our recent road trip',
    expect: { kind: 'create_recent_trip_album', slotsSurvive: true },
  },
  {
    id: 'recall.trip.spain.vacation-word',
    category: 'recall',
    prompt: 'gather my vacation photos from Spain into an album',
    expect: { kind: 'create_recent_trip_album', slotsSurvive: true, slots: { placeHint: /spain/i } },
  },

  // rename_or_describe_album ------------------------------------------------
  {
    id: 'recall.rename.family.canonical',
    category: 'recall',
    prompt: 'rename the Family album to Family 2026',
    expect: { kind: 'rename_or_describe_album', slotsSurvive: true, slots: { albumRef: 'Family', newName: 'Family 2026' } },
  },
  {
    id: 'recall.rename.this-album',
    category: 'recall',
    prompt: 'rename this album to Berlin Weekend',
    expect: { kind: 'rename_or_describe_album', slotsSurvive: true, slots: { newName: 'Berlin Weekend' } },
  },
  {
    id: 'recall.describe.italy.valued',
    category: 'recall',
    prompt: 'set the description on my Italy album to Summer 2026 memories',
    expect: { kind: 'rename_or_describe_album', slotsSurvive: true, slots: { albumRef: /italy/i } },
  },
  {
    id: 'recall.rename.wedding.valued',
    category: 'recall',
    prompt: 'rename my Wedding album to Wedding Day',
    expect: { kind: 'rename_or_describe_album', slotsSurvive: true, slots: { albumRef: /wedding/i, newName: /wedding day/i } },
  },

  // add_photos_to_album -----------------------------------------------------
  {
    id: 'recall.add.newest20.canonical',
    category: 'recall',
    prompt: 'add my newest 20 photos to Family',
    expect: { kind: 'add_photos_to_album', slotsSurvive: true, slots: { albumRef: 'Family' } },
  },
  {
    id: 'recall.add.stick.uncommon-verb',
    category: 'recall',
    prompt: 'stick my newest 20 photos into the Family album',
    expect: { kind: 'add_photos_to_album', slotsSurvive: true, slots: { albumRef: 'Family' } },
  },
  {
    id: 'recall.add.berlin.weekend',
    category: 'recall',
    prompt: 'put my Berlin photos from last weekend into the Trips album',
    expect: { kind: 'add_photos_to_album', slotsSurvive: true, slots: { albumRef: /trips/i } },
  },
  {
    id: 'recall.add.yesterday',
    category: 'recall',
    prompt: 'add the photos I took yesterday to my Family album',
    expect: { kind: 'add_photos_to_album', slotsSurvive: true, slots: { albumRef: /family/i } },
  },
  {
    id: 'recall.add.beach.drop',
    category: 'recall',
    prompt: 'drop my beach pics into the Summer album',
    expect: { kind: 'add_photos_to_album', slotsSurvive: true, slots: { albumRef: /summer/i } },
  },
];
