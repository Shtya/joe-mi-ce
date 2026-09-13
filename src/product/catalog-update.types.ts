export type CatalogSkuComponentSource = "sacoSku" | "extraSku";

export interface CatalogIgnoredSkuComponent {
  source: CatalogSkuComponentSource;
  value: string;
  reason: "inactive_placeholder";
}

export interface CatalogSkuResult {
  value: string | null;
  ignoredComponents: CatalogIgnoredSkuComponent[];
}

export interface CatalogUpdateRow {
  excelRowNumber: number;
  matchName: string;
  normalizedMatchName: string;
  name: string;
  model: string;
  sacoSku: string | null;
  extraSku: string | null;
  sku: string | null;
  ignoredSkuComponents: CatalogIgnoredSkuComponent[];
  price: number | null;
  errors: string[];
}

export interface CatalogParseResult {
  headerRowNumber: number | null;
  rows: CatalogUpdateRow[];
  blankRowCount: number;
  errors: string[];
}

export interface CatalogWorkbookParseResult extends CatalogParseResult {
  worksheetName: string;
  ignoredWorksheetNames: string[];
}

export type CatalogUpdateField = "name" | "model" | "sku" | "price";

export type CatalogUpdateStatus =
  | "matched"
  | "multiple_matches"
  | "unchanged"
  | "not_found"
  | "invalid"
  | "conflict";

export interface CatalogProductInput {
  id: string;
  project_id: string;
  name: string;
  model: string | null;
  sku: string | null;
  price: number | string | null;
}

export interface CatalogProductValues {
  name: string;
  model: string | null;
  sku: string | null;
  price: number | null;
}

export interface CatalogFieldChange {
  field: CatalogUpdateField;
  before: string | number | null;
  after: string | number | null;
}

export interface CatalogMatchedProduct {
  id: string;
  current: CatalogProductValues;
  proposed: CatalogProductValues;
  changes: CatalogFieldChange[];
  wouldUpdate: boolean;
}

export interface CatalogUpdatePlanRow extends CatalogUpdateRow {
  status: CatalogUpdateStatus;
  matchCount: number;
  products: CatalogMatchedProduct[];
  warnings: string[];
  duplicateExcelRows: number[];
}

export interface CatalogPlannedProductUpdate {
  id: string;
  changedValues: Partial<CatalogProductValues>;
  sourceExcelRows: number[];
}

export interface CatalogUpdateSummary {
  inputRows: number;
  matched: number;
  multipleMatches: number;
  unchanged: number;
  notFound: number;
  invalid: number;
  conflict: number;
  duplicateSpreadsheetRows: number;
  matchedProducts: number;
  productsToUpdate: number;
  fieldChanges: Record<CatalogUpdateField, number>;
}

export interface CatalogUpdatePlan {
  dryRun: true;
  databaseChanges: 0;
  canApply: boolean;
  rows: CatalogUpdatePlanRow[];
  productUpdates: CatalogPlannedProductUpdate[];
  summary: CatalogUpdateSummary;
}

export interface CatalogUpdateExecutionResult
  extends Omit<CatalogUpdatePlan, "dryRun" | "databaseChanges"> {
  dryRun: false;
  databaseChanges: number;
  committedProducts: number;
  committedFieldChanges: number;
}

export interface CatalogUpdateImportMetadata {
  projectId: string;
  worksheetName: string;
  headerRowNumber: number | null;
  blankRowCount: number;
  ignoredWorksheetNames: string[];
  workbookErrors: string[];
}

export interface CatalogUpdatePreviewResult extends CatalogUpdatePlan {
  metadata: CatalogUpdateImportMetadata;
}

export interface CatalogUpdateApplyResult extends CatalogUpdateExecutionResult {
  metadata: CatalogUpdateImportMetadata;
}
