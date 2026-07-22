import type { RiskLevel } from './types';

// Shared shape validators for the JSON/YAML documents this tool reads back
// (persisted batch plans, rolling state). Callers supply the document `prefix`
// ("persisted batch plan", "rolling state") and a `label` naming the field, so
// both suites keep producing `Invalid <prefix> <label> ...` messages.

const fullShaPattern = /^[0-9a-f]{40}$/i;

export function assertRecord(
  value: unknown,
  prefix: string,
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${prefix} ${label}: object is required`);
  }
}

export function assertString(
  value: unknown,
  prefix: string,
  label: string,
): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid ${prefix} ${label} is required`);
  }
}

export function assertNumber(
  value: unknown,
  prefix: string,
  label: string,
): asserts value is number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Invalid ${prefix} ${label} is required`);
  }
}

export function assertBoolean(
  value: unknown,
  prefix: string,
  label: string,
): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid ${prefix} ${label} is required`);
  }
}

export function assertFullSha(
  value: unknown,
  prefix: string,
  label: string,
): void {
  if (typeof value !== 'string' || !fullShaPattern.test(value)) {
    throw new Error(
      `Invalid ${prefix} ${label} must be a full 40-character SHA`,
    );
  }
}

export function assertStringArray(
  value: unknown,
  prefix: string,
  label: string,
): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid ${prefix} ${label} must be an array of strings`);
  }
}

export function assertShaArray(
  value: unknown,
  prefix: string,
  label: string,
): void {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${prefix} ${label} must be an array of SHAs`);
  }
  for (const item of value) assertFullSha(item, prefix, `${label}[]`);
}

export function assertIsoTimestamp(
  value: unknown,
  prefix: string,
  label: string,
): void {
  assertString(value, prefix, label);
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`Invalid ${prefix} ${label} must be an ISO timestamp`);
  }
}

export function assertRisk(
  value: unknown,
  prefix: string,
  label: string,
): asserts value is RiskLevel {
  if (value !== 'low' && value !== 'medium' && value !== 'high') {
    throw new Error(`Invalid ${prefix} ${label} must be low, medium, or high`);
  }
}
