/**
 * Token-size measurement helpers for the MCP tool catalog.
 *
 * Imported by agent-mcp-tool-registry.service.spec.ts (Slice 1) and by later
 * slices (2–4) that assert the catalog shrinks below CATALOG_TOKENS_BASELINE.
 *
 * NOTE: do NOT import this from production code — test-helpers only.
 */

import { AgentMcpToolContractService } from 'src/services/agent-mcp-tool-contract.service';
import { AgentMcpToolRegistryService } from 'src/services/agent-mcp-tool-registry.service';

/**
 * Chars/4 token estimate of the full tools/list payload as the model receives it.
 * Returns both the rounded token count and the raw byte length for diagnostics.
 */
export const estimateCatalogTokens = (tools: unknown[]): { tokens: number; bytes: number } => {
  const json = JSON.stringify(tools);
  return { tokens: Math.ceil(json.length / 4), bytes: json.length };
};

/**
 * Frozen baseline measured on 2026-06-06 (token-opt Slice 3 — after capping examples to ≤2).
 * CATALOG_TOKENS_ORIGINAL = 52_350 (pre-prune Slice 1 measurement, 2026-06-05).
 * Later slices must assert their catalog token count is strictly < CATALOG_TOKENS_BASELINE.
 * Update this const only when intentionally re-baselining (e.g. after a content addition).
 */
export const CATALOG_TOKENS_BASELINE = 47_065;

/**
 * Build a real (not mocked) registry for token and order tests.
 */
export const buildTestRegistry = (): AgentMcpToolRegistryService =>
  new AgentMcpToolRegistryService(new AgentMcpToolContractService());
