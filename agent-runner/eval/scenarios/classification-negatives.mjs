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
    // Adding photos to a space is unsupported; it must NOT become a member op.
    id: 'neg.space.add-photos',
    category: 'negatives',
    prompt: 'add my newest 20 photos to the Family space',
    expect: { anyKind: ['none', 'add_photos_to_album'] },
  },
  {
    // A subjective album source declines (resolver would hand off anyway).
    id: 'neg.createalbum.subjective',
    category: 'negatives',
    prompt: 'make an album of the best photos',
    expect: { kind: 'none' },
  },
];
