import { DateTime } from 'luxon';

export interface MemoryRuleCandidate {
  ruleId: string;
  dedupeKey: string;
  title?: string;
  subtitle?: string;
  score: number;
  assetIds: string[];
  memoryAt: DateTime;
  context?: Record<string, unknown>;
  /**
   * How many days the memory stays visible, starting from its trigger day. Defaults to 1
   * (visible only on the trigger day) so existing rules are unaffected. Recap-style rules
   * set a larger window so they linger past the day they were generated.
   */
  visibleForDays?: number;
  /**
   * Set when this card stands in for the plain `on_this_day` ("N years ago") memory of the
   * given year, on the same trigger day: the two would hold substantially the same photos,
   * so only one should reach the memory lane. Once the candidate is persisted, the service
   * removes that year's `on_this_day` memory for the day (never a saved one).
   *
   * A rule must only set this when its card genuinely stands in for the whole day — it
   * silently drops whatever the card left behind.
   */
  supersedesOnThisDayYear?: number;
}

export interface MemoryRuleContext {
  ownerId: string;
  target: DateTime;
}

export interface MemoryRule {
  readonly id: string;
  evaluate(context: MemoryRuleContext): Promise<MemoryRuleCandidate[]>;
}
