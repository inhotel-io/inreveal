// Precision / negatives: the classifier must NOT fabricate a workflow for
// questions, chatter, or actionable-but-unsupported requests. All expect `none`
// (which then falls through to open orchestration). These run via the LLM, so
// they're repeated to measure precision, not a single lucky pass.
export default [
  // Questions ---------------------------------------------------------------
  { id: 'neg.q.count', category: 'negatives', prompt: 'how many photos are in my Family album?', expect: { kind: 'none' } },
  { id: 'neg.q.biggest', category: 'negatives', prompt: "what's my biggest album?", expect: { kind: 'none' } },
  { id: 'neg.q.where', category: 'negatives', prompt: 'which photos did I take in Paris?', expect: { kind: 'none' } },
  { id: 'neg.q.when', category: 'negatives', prompt: 'when did I last visit Italy?', expect: { kind: 'none' } },

  // Chatter / acknowledgements ----------------------------------------------
  { id: 'neg.chat.thanks', category: 'negatives', prompt: 'thanks, that looks great', expect: { kind: 'none' } },
  { id: 'neg.chat.okcool', category: 'negatives', prompt: 'ok cool', expect: { kind: 'none' } },
  { id: 'neg.chat.perfect', category: 'negatives', prompt: "that's perfect, thank you", expect: { kind: 'none' } },
  { id: 'neg.chat.weather', category: 'negatives', prompt: 'the weather is lovely today', expect: { kind: 'none' } },

  // Actionable but unsupported by any strict workflow (-> open orchestration) -
  { id: 'neg.unsup.favorite', category: 'negatives', prompt: 'favorite the best 3 photos from last weekend', expect: { kind: 'none' } },
  { id: 'neg.unsup.search', category: 'negatives', prompt: 'find my Sony photos from May', expect: { kind: 'none' } },
  { id: 'neg.unsup.rotate', category: 'negatives', prompt: 'rotate the sideways photos clockwise', expect: { kind: 'none' } },
  { id: 'neg.unsup.delete', category: 'negatives', prompt: 'delete the Family album', expect: { kind: 'none' } },

  // Subjective / out-of-scope arms of the new batch workflows -> none (decline) -
  { id: 'neg.archive.subjective', category: 'negatives', prompt: 'archive the best ones', expect: { kind: 'none' } },
  { id: 'neg.tag.removal', category: 'negatives', prompt: 'remove the Travel tag from my newest 20', expect: { kind: 'none' } },

  // Space workflows: questions and the photo-vs-member disambiguation ---------
  { id: 'neg.space.question', category: 'negatives', prompt: 'who has access to the Family space?', expect: { kind: 'none' } },
  {
    // A subjective album source declines (resolver would hand off anyway).
    id: 'neg.createalbum.subjective',
    category: 'negatives',
    prompt: 'make an album of the best photos',
    expect: { kind: 'none' },
  },

  // update_asset_metadata routing boundaries ---------------------------------
  {
    // Album describe stays with rename_or_describe_album (NOT update_asset_metadata).
    id: 'neg.metadata.album',
    category: 'negatives',
    prompt: 'set the description on the Family album to Summer',
    expect: { kind: 'rename_or_describe_album' },
  },
  {
    // Place-name-only location edit is unsupported (no lat+lng) → none.
    id: 'neg.metadata.placename',
    category: 'negatives',
    prompt: 'set the location on these photos to Paris',
    expect: { kind: 'none' },
  },
  {
    // Filename change is unsupported → none.
    id: 'neg.metadata.filename',
    category: 'negatives',
    prompt: 'change the filename on these photos to beach.jpg',
    expect: { kind: 'none' },
  },

  // manage_space_assets boundaries -------------------------------------------
  {
    // Adding a member (Alex) to a space must NOT route to manage_space_assets (photo op).
    id: 'neg.spaceassets.member',
    category: 'negatives',
    prompt: 'add Alex to the Family space',
    expect: { kind: 'manage_space_members' },
  },

  // remove_photos_from_album boundaries --------------------------------------
  {
    // Tag removal is out of scope (add-only) — must not route to remove_photos_from_album.
    id: 'neg.remove.tag',
    category: 'negatives',
    prompt: 'remove the Travel tag from my newest 20',
    expect: { kind: 'none' },
  },
  {
    // Subjective source declines — the resolver would hand off anyway.
    id: 'neg.remove.subjective',
    category: 'negatives',
    prompt: 'remove the best ones from Family',
    expect: { kind: 'none' },
  },

  // create_space_from_source boundaries -------------------------------------
  {
    // Subjective space source declines — must not route to create_space_from_source.
    id: 'neg.createspace.subjective',
    category: 'negatives',
    prompt: 'create a space of the best photos from last weekend',
    expect: { kind: 'none' },
  },
];
