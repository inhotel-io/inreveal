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

  // archive_assets ----------------------------------------------------------
  {
    id: 'recall.archive.canonical',
    category: 'recall',
    prompt: 'archive my newest 50 photos',
    expect: {
      kind: 'archive_assets',
      slotsSurvive: true,
      slots: { archived: true, sourceDescription: /newest 50 photos/i },
    },
  },
  {
    id: 'recall.archive.unarchive',
    category: 'recall',
    prompt: 'move my last 10 photos out of the archive',
    expect: {
      kind: 'archive_assets',
      slotsSurvive: true,
      slots: { archived: false, sourceDescription: /last 10 photos/i },
    },
  },
  {
    id: 'recall.archive.uncommon-verb',
    category: 'recall',
    prompt: 'put my newest 20 photos in the archive',
    expect: { kind: 'archive_assets', slotsSurvive: true },
  },
  {
    // Routes at classify-time even though the resolver hands off "screenshots" at
    // run-time — routing is the only thing L1 observes (relocated from negatives).
    id: 'recall.archive.screenshots',
    category: 'recall',
    prompt: 'archive old screenshots from 2024',
    expect: { kind: 'archive_assets', slotsSurvive: true },
  },

  // favorite_assets ---------------------------------------------------------
  {
    id: 'recall.favorite.canonical',
    category: 'recall',
    prompt: 'favorite my newest 10 photos',
    expect: {
      kind: 'favorite_assets',
      slotsSurvive: true,
      slots: { favorite: true, sourceDescription: /newest 10 photos/i },
    },
  },
  {
    id: 'recall.favorite.unfavorite',
    category: 'recall',
    prompt: 'unfavorite my last 5 photos',
    expect: { kind: 'favorite_assets', slotsSurvive: true, slots: { favorite: false } },
  },
  {
    // "add … to my favorites" is a favorite intent, owned by favorite_assets
    // (not an album add) — see ADD_TO_FAVS_PATTERN.
    id: 'recall.favorite.add-to-favorites',
    category: 'recall',
    prompt: 'add my newest 20 photos to my favorites',
    expect: {
      kind: 'favorite_assets',
      slotsSurvive: true,
      slots: { favorite: true, sourceDescription: /newest 20 photos/i },
    },
  },

  // tag_assets --------------------------------------------------------------
  {
    id: 'recall.tag.canonical',
    category: 'recall',
    prompt: 'tag my newest 20 photos as Travel',
    expect: {
      kind: 'tag_assets',
      slotsSurvive: true,
      slots: { sourceDescription: /newest 20 photos/i, tagName: 'Travel' },
    },
  },
  {
    // Must NOT be stolen by add_photos_to_album's "add <source> to <album>".
    id: 'recall.tag.add-the-tag',
    category: 'recall',
    prompt: 'add the tag Spring Break to my newest 50 photos',
    expect: { kind: 'tag_assets', slotsSurvive: true, slots: { tagName: 'Spring Break' } },
  },
  {
    id: 'recall.tag.uncommon-verb',
    category: 'recall',
    prompt: 'label my newest 20 photos Travel',
    expect: { kind: 'tag_assets', slotsSurvive: true },
  },

  // untag_assets ------------------------------------------------------------
  {
    id: 'recall.untag.canonical',
    category: 'recall',
    prompt: 'remove the Travel tag from my newest 20',
    expect: {
      kind: 'untag_assets',
      slotsSurvive: true,
      slots: { sourceDescription: /newest 20/i, tagName: 'Travel' },
    },
  },
  {
    id: 'recall.untag.tag-named-from',
    category: 'recall',
    prompt: 'remove tag Spring Break from my last 50 photos',
    expect: { kind: 'untag_assets', slotsSurvive: true, slots: { tagName: 'Spring Break' } },
  },
  {
    id: 'recall.untag.verb',
    category: 'recall',
    prompt: 'untag my newest 20 as Travel',
    expect: { kind: 'untag_assets', slotsSurvive: true, slots: { tagName: 'Travel' } },
  },

  // trash_assets ------------------------------------------------------------
  {
    id: 'recall.trash.canonical',
    category: 'recall',
    prompt: 'trash my newest 20 photos',
    expect: { kind: 'trash_assets', slotsSurvive: true, slots: { sourceDescription: /newest 20/i } },
  },
  {
    id: 'recall.trash.delete-verb',
    category: 'recall',
    prompt: 'delete my newest 50 photos',
    expect: { kind: 'trash_assets', slotsSurvive: true },
  },
  {
    id: 'recall.trash.move-to-trash',
    category: 'recall',
    prompt: 'move my newest 20 photos to the trash',
    expect: { kind: 'trash_assets', slotsSurvive: true },
  },

  // rename_or_describe_space ------------------------------------------------
  {
    id: 'recall.space.rename',
    category: 'recall',
    prompt: 'rename the Family space to Family 2026',
    expect: {
      kind: 'rename_or_describe_space',
      slotsSurvive: true,
      slots: { spaceRef: 'Family', newName: 'Family 2026' },
    },
  },
  {
    id: 'recall.space.describe',
    category: 'recall',
    prompt: 'set the description on the Trips space to Our adventures',
    expect: { kind: 'rename_or_describe_space', slotsSurvive: true, slots: { spaceRef: 'Trips', description: /adventures/i } },
  },

  // manage_space_members ----------------------------------------------------
  {
    id: 'recall.members.add',
    category: 'recall',
    prompt: 'add Alex to the Family space as editor',
    expect: { kind: 'manage_space_members', slotsSurvive: true, slots: { action: 'add', spaceRef: 'Family', role: 'editor' } },
  },
  {
    id: 'recall.members.remove',
    category: 'recall',
    prompt: 'remove Bob from the Trips space',
    expect: { kind: 'manage_space_members', slotsSurvive: true, slots: { action: 'remove', spaceRef: 'Trips' } },
  },
  {
    // Routing-only: an uncommon verb the regex misses. The local model reliably
    // routes "invite" → manage_space_members but does not always extract the member
    // name into memberQueries (slot fidelity is covered by the regex-path tests).
    id: 'recall.members.add.llm',
    category: 'recall',
    prompt: 'invite Alex to the Family space',
    expect: { kind: 'manage_space_members' },
  },

  // change_member_role ------------------------------------------------------
  {
    id: 'recall.role.make',
    category: 'recall',
    prompt: 'make Alex an editor in the Family space',
    expect: { kind: 'change_member_role', slotsSurvive: true, slots: { memberQuery: /alex/i, role: 'editor', spaceRef: 'Family' } },
  },
  {
    id: 'recall.role.possessive',
    category: 'recall',
    prompt: "change Bob's role to viewer in Trips",
    expect: { kind: 'change_member_role', slotsSurvive: true, slots: { role: 'viewer', spaceRef: 'Trips' } },
  },

  // create_album_from_source ------------------------------------------------
  {
    id: 'recall.createalbum.canonical',
    category: 'recall',
    prompt: 'make an album of my newest 50 photos',
    expect: { kind: 'create_album_from_source', slotsSurvive: true, slots: { sourceDescription: /newest 50 photos/i } },
  },
  {
    id: 'recall.createalbum.named',
    category: 'recall',
    prompt: 'create an album from my 2024 photos called Best of 2024',
    expect: { kind: 'create_album_from_source', slotsSurvive: true, slots: { albumName: /best of 2024/i } },
  },
  {
    id: 'recall.createalbum.llm',
    category: 'recall',
    prompt: 'put my newest 50 photos into a brand new album',
    expect: { kind: 'create_album_from_source', slotsSurvive: true },
  },
  {
    // Disambiguation: a recent-trip album stays with the trip workflow.
    id: 'recall.createalbum.trip-disambig',
    category: 'recall',
    prompt: 'create an album for my recent trip to USA',
    expect: { kind: 'create_recent_trip_album', slotsSurvive: true },
  },
  {
    // Disambiguation: adding to an EXISTING album stays with add_photos.
    id: 'recall.createalbum.add-disambig',
    category: 'recall',
    prompt: 'add my newest 20 photos to Family',
    expect: { kind: 'add_photos_to_album', slotsSurvive: true },
  },

  // update_asset_metadata ------------------------------------------------------
  {
    id: 'recall.metadata.describe',
    category: 'recall',
    prompt: 'set the description on my newest 20 photos to Berlin weekend',
    expect: { kind: 'update_asset_metadata', slotsSurvive: true, slots: { sourceDescription: /newest 20 photos/i } },
  },
  {
    id: 'recall.metadata.rating',
    category: 'recall',
    prompt: 'rate my newest 12 photos five stars',
    expect: { kind: 'update_asset_metadata', slotsSurvive: true, slots: { sourceDescription: /newest 12 photos/i } },
  },
  {
    id: 'recall.metadata.caption',
    category: 'recall',
    prompt: 'set the caption on my newest 20 photos to Beach day',
    expect: { kind: 'update_asset_metadata', slotsSurvive: true, slots: { sourceDescription: /newest 20 photos/i } },
  },

  // remove_photos_from_album -------------------------------------------------
  {
    id: 'recall.remove.canonical',
    category: 'recall',
    prompt: 'remove my newest 20 photos from Family',
    expect: { kind: 'remove_photos_from_album', slotsSurvive: true, slots: { albumRef: 'Family' } },
  },
  {
    id: 'recall.remove.takeout',
    category: 'recall',
    prompt: 'take my newest 20 photos out of the Family album',
    expect: { kind: 'remove_photos_from_album', slotsSurvive: true, slots: { albumRef: 'Family' } },
  },
  {
    // Forces the LLM path — 'pull' is not a regex verb.
    id: 'recall.remove.llm',
    category: 'recall',
    prompt: 'pull my 2024 photos out of the Trips album',
    expect: { kind: 'remove_photos_from_album' },
  },

  // manage_space_assets --------------------------------------------------------
  {
    id: 'recall.spaceassets.add',
    category: 'recall',
    prompt: 'add my newest 20 photos to the Family space',
    expect: { kind: 'manage_space_assets', slotsSurvive: true, slots: { action: 'add', spaceRef: 'Family' } },
  },
  {
    id: 'recall.spaceassets.put',
    category: 'recall',
    prompt: 'put my newest 20 photos into the Family space',
    expect: { kind: 'manage_space_assets', slotsSurvive: true },
  },
  {
    id: 'recall.spaceassets.takeout',
    category: 'recall',
    prompt: 'take my newest 20 photos out of the Family space',
    expect: { kind: 'manage_space_assets', slotsSurvive: true },
  },

  // entity-source variants (resolveAssetSearchFilters path) -------------------
  {
    id: 'recall.archive.entity',
    category: 'recall',
    prompt: 'archive my Berlin photos',
    expect: { kind: 'archive_assets', slotsSurvive: true, slots: { archived: true, sourceDescription: /berlin photos/i } },
  },
  {
    id: 'recall.tag.entity',
    category: 'recall',
    prompt: 'tag photos of Alex as Family',
    expect: { kind: 'tag_assets', slotsSurvive: true, slots: { tagName: 'Family', sourceDescription: /of Alex/i } },
  },
  {
    id: 'recall.favorite.entity',
    category: 'recall',
    prompt: 'favorite my 5-star photos',
    expect: { kind: 'favorite_assets', slotsSurvive: true, slots: { favorite: true, sourceDescription: /5-star/i } },
  },
  {
    id: 'recall.createalbum.entity',
    category: 'recall',
    prompt: 'make an album of my Sony photos from May',
    expect: { kind: 'create_album_from_source', slotsSurvive: true, slots: { sourceDescription: /sony photos/i } },
  },

  // create_space_from_source ------------------------------------------------
  {
    id: 'recall.createspace.canonical',
    category: 'recall',
    prompt: 'make a Family space of my newest 50 photos',
    expect: { kind: 'create_space_from_source', slotsSurvive: true, slots: { spaceName: 'Family' } },
  },
  {
    id: 'recall.createspace.named',
    category: 'recall',
    prompt: 'create a space from my newest 50 photos called Trips',
    expect: { kind: 'create_space_from_source', slotsSurvive: true, slots: { spaceName: 'Trips' } },
  },
  {
    // Disambiguation: an album source stays with create_album_from_source.
    id: 'recall.createspace.album-disambig',
    category: 'recall',
    prompt: 'make an album of my newest 50 photos',
    expect: { kind: 'create_album_from_source' },
  },
  {
    // Disambiguation: a member add stays with manage_space_members.
    id: 'recall.createspace.member-disambig',
    category: 'recall',
    prompt: 'add Alex to the Family space',
    expect: { kind: 'manage_space_members' },
  },
  // rotate_assets -------------------------------------------------------------
  {
    id: 'recall.rotate.canonical',
    category: 'recall',
    prompt: 'rotate my newest 20 photos 90 clockwise',
    expect: { kind: 'rotate_assets', slotsSurvive: true },
  },
  {
    id: 'recall.rotate.ccw',
    category: 'recall',
    prompt: 'rotate my last 10 photos 90 counterclockwise',
    expect: { kind: 'rotate_assets', slotsSurvive: true },
  },
  {
    id: 'recall.rotate.flip',
    category: 'recall',
    prompt: 'flip my newest 5 photos upside down',
    expect: { kind: 'rotate_assets', slotsSurvive: true },
  },

  // cleanup_duplicates ---------------------------------------------------------
  {
    id: 'recall.cleanup_duplicates.canonical',
    category: 'recall',
    prompt: 'clean up my duplicate photos',
    expect: { kind: 'cleanup_duplicates', slotsSurvive: true },
  },

  // set_album_cover -----------------------------------------------------------
  {
    id: 'recall.cover.index',
    category: 'recall',
    prompt: 'set the cover of the Family album to the 3rd photo',
    expect: { kind: 'set_album_cover', slotsSurvive: true, slots: { albumRef: 'Family' } },
  },
  {
    id: 'recall.cover.first',
    category: 'recall',
    prompt: 'make the Family album cover the first photo',
    expect: { kind: 'set_album_cover', slotsSurvive: true, slots: { albumRef: 'Family' } },
  },
];
