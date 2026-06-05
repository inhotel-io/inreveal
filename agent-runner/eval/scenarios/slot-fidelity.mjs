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
  {
    id: 'slots.archive.unarchive-polarity',
    category: 'slots',
    prompt: 'unarchive my newest 5 photos',
    expect: { kind: 'archive_assets', slots: { archived: false, sourceDescription: 'my newest 5 photos' } },
  },
  {
    id: 'slots.favorite.polarity',
    category: 'slots',
    prompt: 'unfavorite my newest 5 photos',
    expect: { kind: 'favorite_assets', slots: { favorite: false, sourceDescription: 'my newest 5 photos' } },
  },
  {
    id: 'slots.tag.quoted-name',
    category: 'slots',
    prompt: 'tag my newest 20 as "Spring Break"',
    expect: { kind: 'tag_assets', slots: { tagName: 'Spring Break', sourceDescription: 'my newest 20' } },
  },
  {
    id: 'slots.trash.canonical',
    category: 'slots',
    prompt: 'trash my newest 20 photos',
    expect: { kind: 'trash_assets', slots: { sourceDescription: 'my newest 20 photos' } },
  },
  {
    id: 'slots.untag.canonical',
    category: 'slots',
    prompt: 'remove the Travel tag from my newest 20',
    expect: { kind: 'untag_assets', slots: { tagName: 'Travel', sourceDescription: 'my newest 20' } },
  },
  {
    id: 'slots.members.role-default',
    category: 'slots',
    prompt: 'add Alex to the Family space',
    expect: { kind: 'manage_space_members', slots: { action: 'add', role: 'viewer', spaceRef: 'Family' } },
  },
  {
    id: 'slots.role.synonym',
    category: 'slots',
    prompt: 'make Alex a contributor in Family',
    expect: { kind: 'change_member_role', slots: { role: 'editor', spaceRef: 'Family' } },
  },
  {
    id: 'slots.createalbum.default-name',
    category: 'slots',
    prompt: 'make an album of my newest 50 photos',
    expect: { kind: 'create_album_from_source', slots: { sourceDescription: 'my newest 50 photos', albumName: 'New Album' } },
  },
  {
    id: 'slots.archive.entity',
    category: 'slots',
    prompt: 'archive my Berlin photos',
    expect: { kind: 'archive_assets', slots: { archived: true, sourceDescription: 'my Berlin photos' } },
  },
  {
    id: 'slots.metadata.describe',
    category: 'slots',
    prompt: 'set the description on my newest 20 photos to Berlin weekend',
    expect: { kind: 'update_asset_metadata', slots: { sourceDescription: 'my newest 20 photos' } },
  },
  {
    id: 'slots.move.from-to',
    category: 'slots',
    prompt: 'move my newest 20 photos from Drafts to Keepers',
    expect: { kind: 'move_photos_between_albums', slots: { sourceDescription: 'my newest 20 photos', fromAlbumRef: 'Drafts', toAlbumRef: 'Keepers' } },
  },
  {
    id: 'slots.remove.canonical',
    category: 'slots',
    prompt: 'remove my newest 5 photos from Family',
    expect: { kind: 'remove_photos_from_album', slots: { albumRef: 'Family', sourceDescription: 'my newest 5 photos' } },
  },
  {
    id: 'slots.spaceassets.remove',
    category: 'slots',
    prompt: 'remove my newest 20 photos from the Family space',
    expect: { kind: 'manage_space_assets', slots: { action: 'remove', spaceRef: 'Family', sourceDescription: 'my newest 20 photos' } },
  },
  {
    id: 'slots.createspace.default-name',
    category: 'slots',
    prompt: 'create a space from my 2024 photos',
    expect: { kind: 'create_space_from_source', slots: { sourceDescription: 'my 2024 photos' } },
  },
  {
    id: 'slots.rotate.ccw-polarity',
    category: 'slots',
    prompt: 'rotate my newest 5 photos 90 counterclockwise',
    expect: { kind: 'rotate_assets', slots: { angle: 270, sourceDescription: 'my newest 5 photos' } },
  },
  {
    id: 'slots.cover.index',
    category: 'slots',
    prompt: 'set the cover of the Family album to the 3rd photo',
    expect: { kind: 'set_album_cover', slots: { albumRef: 'Family', coverRef: /3rd|third/i } },
  },
];
