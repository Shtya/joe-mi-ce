export type RecoveryReportType = "attendance" | "branches" | "stock" | "sales" | "monthly";

export type RecoveryAction =
  | "EXISTING"
  | "CREATED"
  | "UPDATED"
  | "SKIPPED"
  | "DUPLICATE"
  | "UNRESOLVED";

export type RecoveryConfidence = "CONFIRMED" | "PROBABLE" | "UNRESOLVED";

export interface RecoveryRowResult {
  row: number; // 1-based data row number inside the source sheet
  sheet: string;
  entity: string;
  action: RecoveryAction;
  confidence: RecoveryConfidence;
  reason?: string;
  key?: string; // human-readable natural key, e.g. "user=ibrahim.y@... | branch=Extra Granada RS2 | date=2026-07-26"
  ids?: Record<string, string>; // resolved database ids (userId, branchId, journeyId, ...)
}

export interface RecoverySummary {
  existing: number;
  created: number;
  updated: number;
  skipped: number;
  duplicates: number;
  unresolved: number;
}

export interface RecoveryResult {
  dryRun: boolean;
  type: RecoveryReportType;
  project: { id: string; name: string };
  summary: RecoverySummary;
  rows: RecoveryRowResult[];
}

export function emptySummary(): RecoverySummary {
  return {
    existing: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    duplicates: 0,
    unresolved: 0,
  };
}

export function bump(summary: RecoverySummary, action: RecoveryAction) {
  switch (action) {
    case "EXISTING":
      summary.existing++;
      break;
    case "CREATED":
      summary.created++;
      break;
    case "UPDATED":
      summary.updated++;
      break;
    case "SKIPPED":
      summary.skipped++;
      break;
    case "DUPLICATE":
      summary.duplicates++;
      break;
    case "UNRESOLVED":
      summary.unresolved++;
      break;
  }
}
