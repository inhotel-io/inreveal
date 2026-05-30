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
  { id: 'neg.unsup.archive', category: 'negatives', prompt: 'archive old screenshots from 2024', expect: { kind: 'none' } },
  { id: 'neg.unsup.delete', category: 'negatives', prompt: 'delete the Family album', expect: { kind: 'none' } },
];
