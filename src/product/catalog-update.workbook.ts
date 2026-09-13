import * as ExcelJS from "exceljs";
import { CatalogWorkbookParseResult } from "./catalog-update.types";
import { parseCatalogUpdateRows } from "./catalog-update.parser";

export async function loadCatalogUpdateWorkbook(
  filePath: string,
): Promise<CatalogWorkbookParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("Excel file has no worksheets");
  }

  const rows: unknown[][] = [];
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const values: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      values[columnNumber - 1] = cell.text;
    });
    rows.push(values);
  }

  return {
    ...parseCatalogUpdateRows(rows),
    worksheetName: worksheet.name,
    ignoredWorksheetNames: workbook.worksheets
      .slice(1)
      .map((ignoredWorksheet) => ignoredWorksheet.name),
  };
}
