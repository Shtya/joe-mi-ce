import {
  CatalogIgnoredSkuComponent,
  CatalogParseResult,
  CatalogSkuResult,
  CatalogUpdateRow,
} from "./catalog-update.types";

const REQUIRED_HEADERS = [
  "systemItemName",
  "productName",
  "model",
  "sacoSku",
  "extraSku",
  "rsp",
] as const;

type RequiredHeader = (typeof REQUIRED_HEADERS)[number];

const HEADER_ALIASES: Record<RequiredHeader, string[]> = {
  systemItemName: ["systemitemname"],
  productName: ["proudectname", "productname"],
  model: ["proudectmodelnumber", "productmodelnumber", "modelnumber"],
  sacoSku: ["sacosku"],
  extraSku: ["extrasku"],
  rsp: ["rsp"],
};

const INACTIVE_SKU_VALUES = new Set([
  "not in rsp's",
  "not active",
  "not actv",
  "inactive",
  "n/a",
  "na",
]);

export function normalizeCatalogMatchKey(value: unknown): string {
  return normalizeText(value).toLocaleLowerCase();
}

export function buildCatalogSku(
  sacoValue: unknown,
  extraValue: unknown,
): CatalogSkuResult {
  const ignoredComponents: CatalogIgnoredSkuComponent[] = [];
  const sacoSku = getUsableSku("sacoSku", sacoValue, ignoredComponents);
  const extraSku = getUsableSku("extraSku", extraValue, ignoredComponents);

  if (!sacoSku && !extraSku) {
    return { value: null, ignoredComponents };
  }

  if (!sacoSku || !extraSku) {
    return { value: sacoSku ?? extraSku, ignoredComponents };
  }

  if (sacoSku.toLocaleLowerCase() === extraSku.toLocaleLowerCase()) {
    return { value: sacoSku, ignoredComponents };
  }

  return { value: `${sacoSku} - ${extraSku}`, ignoredComponents };
}

export function parseCatalogUpdateRows(rows: unknown[][]): CatalogParseResult {
  const header = findHeaderRow(rows);

  if (!header) {
    return {
      headerRowNumber: null,
      rows: [],
      blankRowCount: 0,
      errors: ["Required product-update headers not found"],
    };
  }

  const missingHeaders = REQUIRED_HEADERS.filter(
    (requiredHeader) => header.columns[requiredHeader] === undefined,
  );

  if (missingHeaders.length > 0) {
    return {
      headerRowNumber: header.index + 1,
      rows: [],
      blankRowCount: 0,
      errors: [
        `Missing required workbook headers: ${missingHeaders
          .map(formatRequiredHeader)
          .join(", ")}`,
      ],
    };
  }

  const parsedRows: CatalogUpdateRow[] = [];
  let blankRowCount = 0;

  for (let rowIndex = header.index + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] ?? [];

    if (row.every((cell) => normalizeText(cell) === "")) {
      blankRowCount++;
      continue;
    }

    const matchName = normalizeText(row[header.columns.systemItemName]);
    const name = normalizeText(row[header.columns.productName]);
    const model = normalizeText(row[header.columns.model]);
    const sacoSku = toNullableText(row[header.columns.sacoSku]);
    const extraSku = toNullableText(row[header.columns.extraSku]);
    const skuResult = buildCatalogSku(sacoSku, extraSku);
    const priceResult = parseCatalogPrice(row[header.columns.rsp]);
    const errors: string[] = [];

    if (!matchName) errors.push("system item name is required");
    if (!name) errors.push("Proudect Name is required");
    if (!model) errors.push("Proudect Model Number is required");
    if (!priceResult.valid)
      errors.push("RSP must be a finite non-negative number");

    parsedRows.push({
      excelRowNumber: rowIndex + 1,
      matchName,
      normalizedMatchName: normalizeCatalogMatchKey(matchName),
      name,
      model,
      sacoSku,
      extraSku,
      sku: skuResult.value,
      ignoredSkuComponents: skuResult.ignoredComponents,
      price: priceResult.value,
      errors,
    });
  }

  return {
    headerRowNumber: header.index + 1,
    rows: parsedRows,
    blankRowCount,
    errors: [],
  };
}

export function parseCatalogPrice(value: unknown): {
  valid: boolean;
  value: number | null;
} {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0
      ? { valid: true, value }
      : { valid: false, value: null };
  }

  const text = normalizeText(value);
  if (!text) return { valid: false, value: null };

  const parsed = Number(text.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0
    ? { valid: true, value: parsed }
    : { valid: false, value: null };
}

function findHeaderRow(rows: unknown[][]): {
  index: number;
  columns: Partial<Record<RequiredHeader, number>>;
} | null {
  const maxHeaderRows = Math.min(rows.length, 20);
  let best:
    | {
        index: number;
        columns: Partial<Record<RequiredHeader, number>>;
      }
    | undefined;

  for (let rowIndex = 0; rowIndex < maxHeaderRows; rowIndex++) {
    const columns: Partial<Record<RequiredHeader, number>> = {};
    const row = rows[rowIndex] ?? [];

    row.forEach((cell, columnIndex) => {
      const normalizedHeader = normalizeHeader(cell);
      for (const requiredHeader of REQUIRED_HEADERS) {
        if (
          columns[requiredHeader] === undefined &&
          HEADER_ALIASES[requiredHeader].includes(normalizedHeader)
        ) {
          columns[requiredHeader] = columnIndex;
        }
      }
    });

    if (
      !best ||
      Object.keys(columns).length > Object.keys(best.columns).length
    ) {
      best = { index: rowIndex, columns };
    }
  }

  return best;
}

function getUsableSku(
  source: "sacoSku" | "extraSku",
  value: unknown,
  ignoredComponents: CatalogIgnoredSkuComponent[],
): string | null {
  const text = toNullableText(value);
  if (!text) return null;

  if (INACTIVE_SKU_VALUES.has(text.toLocaleLowerCase())) {
    ignoredComponents.push({
      source,
      value: text,
      reason: "inactive_placeholder",
    });
    return null;
  }

  return text;
}

function normalizeHeader(value: unknown): string {
  return normalizeText(value)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function toNullableText(value: unknown): string | null {
  const text = normalizeText(value);
  return text || null;
}

function formatRequiredHeader(header: RequiredHeader): string {
  const labels: Record<RequiredHeader, string> = {
    systemItemName: "system item name",
    productName: "Proudect Name",
    model: "Proudect Model Number",
    sacoSku: "Saco SKU",
    extraSku: "Extra SKU",
    rsp: "RSP",
  };

  return labels[header];
}
